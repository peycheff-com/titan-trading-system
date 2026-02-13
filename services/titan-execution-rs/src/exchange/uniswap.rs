use crate::config::ExchangeConfig;
use crate::exchange::adapter::{
    ExchangeAdapter, ExchangeError, OrderRequest, OrderResponse, Position,
};
use async_trait::async_trait;
use chrono::Utc;
use ethers::prelude::*;
use rust_decimal::prelude::*;
use std::convert::TryFrom;
use std::str::FromStr;
use std::sync::Arc;

// JSON ABI for SwapRouter02 exactInputSingle
abigen!(
    ISwapRouter,
    r#"[
        {
          "inputs": [
            {
              "components": [
                { "internalType": "address", "name": "tokenIn", "type": "address" },
                { "internalType": "address", "name": "tokenOut", "type": "address" },
                { "internalType": "uint24", "name": "fee", "type": "uint24" },
                { "internalType": "address", "name": "recipient", "type": "address" },
                { "internalType": "uint256", "name": "deadline", "type": "uint256" },
                { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
                { "internalType": "uint256", "name": "amountOutMinimum", "type": "uint256" },
                { "internalType": "uint160", "name": "sqrtPriceLimitX96", "type": "uint160" }
              ],
              "internalType": "struct ISwapRouter.ExactInputSingleParams",
              "name": "params",
              "type": "tuple"
            }
          ],
          "name": "exactInputSingle",
          "outputs": [{ "internalType": "uint256", "name": "amountOut", "type": "uint256" }],
          "stateMutability": "payable",
          "type": "function"
        }
    ]"#
);

#[derive(Clone)]
pub struct UniswapAdapter {
    client: Arc<SignerMiddleware<Provider<Http>, LocalWallet>>,
    router_address: Address,
}

impl UniswapAdapter {
    pub fn new(config: Option<&ExchangeConfig>) -> Result<Self, ExchangeError> {
        let config = config.ok_or(ExchangeError::Configuration(
            "Missing Uniswap config".into(),
        ))?;

        // RPC URL
        let rpc_url = std::env::var("UNISWAP_RPC_URL")
            .unwrap_or_else(|_| "https://mainnet.infura.io/v3/YOUR_KEY".to_string());
        let provider = Provider::<Http>::try_from(rpc_url)
            .map_err(|e| ExchangeError::Configuration(format!("Invalid RPC URL: {}", e)))?;

        // Private Key
        let private_key = config.get_secret_key().ok_or(ExchangeError::Configuration(
            "Missing Uniswap Private Key".into(),
        ))?;
        let wallet: LocalWallet = private_key
            .parse::<LocalWallet>()
            .map_err(|e| ExchangeError::Configuration(format!("Invalid Private Key: {}", e)))?
            .with_chain_id(1u64); // Default to Mainnet, should be configurable

        let client = Arc::new(SignerMiddleware::new(provider, wallet));

        // Router Address (SwapRouter02)
        let router_addr = std::env::var("UNISWAP_ROUTER_ADDRESS")
            .unwrap_or_else(|_| "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45".to_string());
        let router_address = Address::from_str(&router_addr)
            .map_err(|e| ExchangeError::Configuration(format!("Invalid Router Address: {}", e)))?;

        Ok(Self {
            client,
            router_address,
        })
    }
}

#[async_trait]
impl ExchangeAdapter for UniswapAdapter {
    async fn init(&self) -> Result<(), ExchangeError> {
        // Check chain ID or block number to verify connection
        let _block = self
            .client
            .get_block_number()
            .await
            .map_err(|e| ExchangeError::Network(format!("Failed to connect to RPC: {}", e)))?;
        Ok(())
    }

    async fn place_order(&self, order: OrderRequest) -> Result<OrderResponse, ExchangeError> {
        // OrderRequest: symbol "WETH/USDC"
        let parts: Vec<&str> = order.symbol.split('/').collect();
        if parts.len() != 2 && !order.symbol.contains('-') {
            return Err(ExchangeError::OrderRejected(
                "Invalid symbol format for Uniswap".into(),
            ));
        }

        // Resolution of Address from Symbol is needed.
        let (token_in_str, token_out_str) = if order.symbol.contains('-') {
            let s: Vec<&str> = order.symbol.split('-').collect();
            (s[0], s[1])
        } else {
            match order.symbol.as_str() {
                "WETH/USDC" => (
                    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                ),
                "USDC/WETH" => (
                    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                ),
                _ => {
                    return Err(ExchangeError::Configuration(
                        "Unknown symbol, please use Address-Address format".into(),
                    ))
                }
            }
        };

        let token_in = Address::from_str(token_in_str)
            .map_err(|_| ExchangeError::OrderRejected("Invalid Token In specificiation".into()))?;
        let token_out = Address::from_str(token_out_str)
            .map_err(|_| ExchangeError::OrderRejected("Invalid Token Out specification".into()))?;

        let contract = ISwapRouter::new(self.router_address, self.client.clone());

        // Amount In
        let decimals = if token_in_str == "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" {
            6
        } else {
            18
        };
        let amount_in_raw = (order.quantity * Decimal::from(10u64.pow(decimals)))
            .to_u64()
            .unwrap_or(0);

        // Use generated struct
        let params = ExactInputSingleParams {
            token_in,
            token_out,
            fee: 3000,
            recipient: self.client.address(),
            deadline: U256::from(Utc::now().timestamp() + 300),
            amount_in: U256::from(amount_in_raw),
            amount_out_minimum: U256::zero(),
            sqrt_price_limit_x96: U256::zero(),
        };

        let tx = contract.exact_input_single(params);
        let pending_tx = tx
            .send()
            .await
            .map_err(|e| ExchangeError::Network(format!("Failed to send swap: {}", e)))?;

        let tx_hash = format!("{:?}", pending_tx.tx_hash());

        Ok(OrderResponse {
            order_id: tx_hash,
            client_order_id: order.client_order_id,
            symbol: order.symbol,
            status: "PENDING".to_string(),
            executed_qty: Decimal::zero(),
            avg_price: None,
            t_exchange: None,
            t_ack: Utc::now().timestamp_millis(),
            fee: None,
            fee_asset: None,
        })
    }

    async fn cancel_order(
        &self,
        _symbol: &str,
        _order_id: &str,
    ) -> Result<OrderResponse, ExchangeError> {
        Err(ExchangeError::NotImplemented(
            "Cannot cancel Uniswap swap once broadcast".into(),
        ))
    }

    async fn get_balance(&self, asset: &str) -> Result<Decimal, ExchangeError> {
        if asset == "ETH" {
            let bal = self
                .client
                .get_balance(self.client.address(), None)
                .await
                .map_err(|e| ExchangeError::Network(e.to_string()))?;
            return Ok(Decimal::from_str(&bal.to_string()).unwrap() / Decimal::from(10u64.pow(18)));
        }
        Ok(Decimal::zero())
    }

    fn name(&self) -> &str {
        "uniswap"
    }

    async fn get_positions(&self) -> Result<Vec<Position>, ExchangeError> {
        Ok(Vec::new())
    }
}

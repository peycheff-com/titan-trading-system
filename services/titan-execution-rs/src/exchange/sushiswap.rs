use crate::config::ExchangeConfig;
use crate::exchange::adapter::{
    ExchangeAdapter, ExchangeError, OrderRequest, OrderResponse, Position,
};
use crate::exchange::dex_utils;
use async_trait::async_trait;
use chrono::Utc;
use ethers::prelude::*;
use rust_decimal::prelude::*;
use std::convert::TryFrom;
use std::str::FromStr;
use std::sync::Arc;
use tracing::info;

// SushiSwap V3 Adapter — Multi-chain DEX
//
// SushiSwap V3 uses the same Uniswap V3 router interface (exactInputSingle)
// deployed across Ethereum, Arbitrum, Polygon, Avalanche, Optimism, Base.
//
// Router addresses (RouteProcessor3):
// - Ethereum:  0x827179dD56d07A7eeA32e3873493835da2866976
// - Arbitrum:  0xfc506AaA1340b4dedFfd88bE278bEe058952D674
// - Polygon:   0x0a6e511Fe663827b9cA7e2D2542b20B37fC217A6

abigen!(
    ISushiRouter,
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
pub struct SushiSwapAdapter {
    client: Arc<SignerMiddleware<Provider<Http>, LocalWallet>>,
    router_address: Address,
    #[allow(dead_code)]
    chain_name: String,
    slippage_bps: u64,
}

impl SushiSwapAdapter {
    pub fn new(config: Option<&ExchangeConfig>) -> Result<Self, ExchangeError> {
        let config = config.ok_or(ExchangeError::Configuration(
            "Missing SushiSwap config".into(),
        ))?;

        let rpc_url = std::env::var("SUSHISWAP_RPC_URL").unwrap_or_else(|_| {
            if config.testnet {
                "https://ethereum-sepolia-rpc.publicnode.com".to_string()
            } else {
                "https://eth.llamarpc.com".to_string()
            }
        });

        let provider = Provider::<Http>::try_from(rpc_url)
            .map_err(|e| ExchangeError::Configuration(format!("Invalid RPC URL: {}", e)))?;

        let private_key = config.get_secret_key().ok_or(ExchangeError::Configuration(
            "Missing SushiSwap Private Key".into(),
        ))?;

        let chain_id: u64 = std::env::var("SUSHISWAP_CHAIN_ID")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(if config.testnet { 11155111 } else { 1 });

        let chain_name = match chain_id {
            1 => "ethereum",
            42161 => "arbitrum",
            137 => "polygon",
            43114 => "avalanche",
            10 => "optimism",
            8453 => "base",
            _ => "ethereum",
        }
        .to_string();

        let wallet: LocalWallet = private_key
            .parse::<LocalWallet>()
            .map_err(|e| ExchangeError::Configuration(format!("Invalid Private Key: {}", e)))?
            .with_chain_id(chain_id);

        let client = Arc::new(SignerMiddleware::new(provider, wallet));

        let default_router = match chain_id {
            42161 => "0xfc506AaA1340b4dedFfd88bE278bEe058952D674",
            137 => "0x0a6e511Fe663827b9cA7e2D2542b20B37fC217A6",
            _ => "0x827179dD56d07A7eeA32e3873493835da2866976",
        };
        let router_addr = std::env::var("SUSHISWAP_ROUTER_ADDRESS")
            .unwrap_or_else(|_| default_router.to_string());
        let router_address = Address::from_str(&router_addr)
            .map_err(|e| ExchangeError::Configuration(format!("Invalid Router Address: {}", e)))?;

        let slippage_bps = dex_utils::resolve_slippage("SUSHISWAP");

        Ok(Self {
            client,
            router_address,
            chain_name,
            slippage_bps,
        })
    }
}

#[async_trait]
impl ExchangeAdapter for SushiSwapAdapter {
    async fn init(&self) -> Result<(), ExchangeError> {
        let _block = self
            .client
            .get_block_number()
            .await
            .map_err(|e| ExchangeError::Network(format!("SushiSwap RPC connect failed: {}", e)))?;
        Ok(())
    }

    async fn place_order(&self, order: OrderRequest) -> Result<OrderResponse, ExchangeError> {
        let (token_in_str, token_out_str) = if order.symbol.contains('-') {
            let s: Vec<&str> = order.symbol.split('-').collect();
            (s[0], s[1])
        } else {
            match order.symbol.as_str() {
                "WETH/USDC" => (
                    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                    "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
                ),
                "WETH/USDT" => (
                    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                    "0xdAC17F958D2ee523a2206206994597C13D831ec7",
                ),
                "WETH/DAI" => (
                    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                    "0x6B175474E89094C44Da98b954EedeAC495271d0F",
                ),
                "SUSHI/WETH" => (
                    "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2",
                    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                ),
                _ => {
                    return Err(ExchangeError::Configuration(
                        "Unknown symbol — use Address-Address format".into(),
                    ))
                }
            }
        };

        let token_in = Address::from_str(token_in_str)
            .map_err(|_| ExchangeError::OrderRejected("Invalid Token In".into()))?;
        let token_out = Address::from_str(token_out_str)
            .map_err(|_| ExchangeError::OrderRejected("Invalid Token Out".into()))?;

        let decimals = dex_utils::token_decimals_from_address(token_in_str);
        let amount_in_raw = (order.quantity * Decimal::from(10u64.pow(decimals)))
            .to_u64()
            .unwrap_or(0);
        let amount_in = U256::from(amount_in_raw);

        // ERC-20 approval
        dex_utils::ensure_approval(
            self.client.clone(),
            token_in,
            self.router_address,
            self.client.address(),
            amount_in,
        )
        .await
        .map_err(|e| ExchangeError::Network(format!("Token approval failed: {}", e)))?;

        // Slippage protection
        let amount_out_minimum = dex_utils::calc_min_output(amount_in, self.slippage_bps);

        info!(
            "🍣 SushiSwap swap on {}: {} → {}, slippage={}bps",
            self.chain_name, token_in_str, token_out_str, self.slippage_bps
        );

        let contract = ISushiRouter::new(self.router_address, self.client.clone());

        let params = ExactInputSingleParams {
            token_in,
            token_out,
            fee: 3000,
            recipient: self.client.address(),
            deadline: U256::from(Utc::now().timestamp() + 300),
            amount_in,
            amount_out_minimum,
            sqrt_price_limit_x96: U256::zero(),
        };

        let tx = contract.exact_input_single(params);
        let pending_tx = tx
            .send()
            .await
            .map_err(|e| ExchangeError::Network(format!("SushiSwap swap failed: {}", e)))?;

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
            "Cannot cancel SushiSwap swap once broadcast".into(),
        ))
    }

    async fn get_balance(&self, asset: &str) -> Result<Decimal, ExchangeError> {
        if asset == "ETH" {
            let bal = self
                .client
                .get_balance(self.client.address(), None)
                .await
                .map_err(|e| ExchangeError::Network(e.to_string()))?;
            return Ok(Decimal::from_str(&bal.to_string()).unwrap_or(Decimal::ZERO)
                / Decimal::from(10u64.pow(18)));
        }

        let token_addr = match asset {
            "USDC" => Some("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
            "USDT" => Some("0xdAC17F958D2ee523a2206206994597C13D831ec7"),
            "DAI" => Some("0x6B175474E89094C44Da98b954EedeAC495271d0F"),
            "SUSHI" => Some("0x6B3595068778DD592e39A122f4f5a5cF09C90fE2"),
            _ => None,
        };

        if let Some(addr_str) = token_addr {
            let addr = Address::from_str(addr_str).unwrap();
            let decimals = dex_utils::token_decimals_from_address(addr_str);
            return dex_utils::get_token_balance(
                self.client.clone(),
                addr,
                self.client.address(),
                decimals,
            )
            .await
            .map_err(ExchangeError::Network);
        }

        Ok(Decimal::zero())
    }

    fn name(&self) -> &str {
        "SushiSwap V3"
    }

    async fn get_positions(&self) -> Result<Vec<Position>, ExchangeError> {
        Ok(Vec::new())
    }
}

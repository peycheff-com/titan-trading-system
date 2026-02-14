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
    slippage_bps: u64,
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
        // Chain ID: Mainnet=1, Sepolia=11155111
        let chain_id: u64 = if config.testnet { 11155111 } else { 1 };

        let wallet: LocalWallet = private_key
            .parse::<LocalWallet>()
            .map_err(|e| ExchangeError::Configuration(format!("Invalid Private Key: {}", e)))?
            .with_chain_id(chain_id);

        let client = Arc::new(SignerMiddleware::new(provider, wallet));

        // Router Address (SwapRouter02)
        // Mainnet: 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45
        // Sepolia: 0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E
        let default_router = if config.testnet {
            "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E"
        } else {
            "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45"
        };
        let router_addr =
            std::env::var("UNISWAP_ROUTER_ADDRESS").unwrap_or_else(|_| default_router.to_string());
        let router_address = Address::from_str(&router_addr)
            .map_err(|e| ExchangeError::Configuration(format!("Invalid Router Address: {}", e)))?;

        // Slippage protection (configurable via UNISWAP_SLIPPAGE_BPS, default 50 = 0.5%)
        let slippage_bps = dex_utils::resolve_slippage("UNISWAP");

        Ok(Self {
            client,
            router_address,
            slippage_bps,
        })
    }
}

#[async_trait]
impl ExchangeAdapter for UniswapAdapter {
    async fn init(&self) -> Result<(), ExchangeError> {
        let _block = self
            .client
            .get_block_number()
            .await
            .map_err(|e| ExchangeError::Network(format!("Failed to connect to RPC: {}", e)))?;
        Ok(())
    }

    async fn place_order(&self, order: OrderRequest) -> Result<OrderResponse, ExchangeError> {
        // Parse symbol: "WETH/USDC" or "0xAddress-0xAddress"
        let parts: Vec<&str> = order.symbol.split('/').collect();
        if parts.len() != 2 && !order.symbol.contains('-') {
            return Err(ExchangeError::OrderRejected(
                "Invalid symbol format for Uniswap. Use TOKEN_A/TOKEN_B or ADDRESS-ADDRESS".into(),
            ));
        }

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
                "WETH/USDT" => (
                    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                    "0xdAC17F958D2ee523a2206206994597C13D831ec7",
                ),
                "USDT/WETH" => (
                    "0xdAC17F958D2ee523a2206206994597C13D831ec7",
                    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                ),
                "WETH/DAI" => (
                    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                    "0x6B175474E89094C44Da98b954EedeAC495271d0F",
                ),
                "DAI/WETH" => (
                    "0x6B175474E89094C44Da98b954EedeAC495271d0F",
                    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                ),
                "WBTC/WETH" => (
                    "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
                    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
                ),
                _ => {
                    return Err(ExchangeError::Configuration(
                        "Unknown symbol. Use ADDRESS-ADDRESS format for custom pairs".into(),
                    ));
                }
            }
        };

        let token_in = Address::from_str(token_in_str)
            .map_err(|_| ExchangeError::OrderRejected("Invalid Token In address".into()))?;
        let token_out = Address::from_str(token_out_str)
            .map_err(|_| ExchangeError::OrderRejected("Invalid Token Out address".into()))?;

        // Resolve decimals for input token
        let decimals = dex_utils::token_decimals_from_address(token_in_str);
        let amount_in_raw = (order.quantity * Decimal::from(10u64.pow(decimals)))
            .to_u64()
            .unwrap_or(0);
        let amount_in = U256::from(amount_in_raw);

        // ERC-20 Approval: ensure router can spend our tokens
        // Skip for native ETH wrapping scenarios
        if token_in_str.to_lowercase() != "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" {
            dex_utils::ensure_approval(
                self.client.clone(),
                token_in,
                self.router_address,
                self.client.address(),
                amount_in,
            )
            .await
            .map_err(|e| ExchangeError::Network(format!("Token approval failed: {}", e)))?;
        }

        // Slippage protection: min output = amount_in * (1 - slippage)
        // This is a rough floor — production systems should pre-quote via Quoter contract
        let amount_out_minimum = dex_utils::calc_min_output(amount_in, self.slippage_bps);

        info!(
            "🔄 Uniswap swap: {} {} → {}, slippage {}bps, min_out={}",
            amount_in, token_in_str, token_out_str, self.slippage_bps, amount_out_minimum
        );

        let contract = ISwapRouter::new(self.router_address, self.client.clone());

        // Determine fee tier — 3000 (0.3%) default, config override via env
        let fee_tier: u32 = std::env::var("UNISWAP_FEE_TIER")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(3000);

        let params = ExactInputSingleParams {
            token_in,
            token_out,
            fee: fee_tier.try_into().unwrap_or(3000),
            recipient: self.client.address(),
            deadline: U256::from(Utc::now().timestamp() + 300), // 5 min
            amount_in,
            amount_out_minimum,
            sqrt_price_limit_x96: U256::zero(),
        };

        let tx = contract.exact_input_single(params);

        // EIP-1559 gas estimation — let ethers handle it (it auto-detects EIP-1559)
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
            return Ok(Decimal::from_str(&bal.to_string()).unwrap_or(Decimal::ZERO)
                / Decimal::from(10u64.pow(18)));
        }

        // ERC-20 balance lookup by known token symbol
        let token_addr = match asset {
            "USDC" => Some("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
            "USDT" => Some("0xdAC17F958D2ee523a2206206994597C13D831ec7"),
            "DAI" => Some("0x6B175474E89094C44Da98b954EedeAC495271d0F"),
            "WETH" => Some("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
            "WBTC" => Some("0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"),
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
        "uniswap"
    }

    async fn get_positions(&self) -> Result<Vec<Position>, ExchangeError> {
        Ok(Vec::new())
    }
}

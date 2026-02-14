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

// Curve Finance Adapter — #1 Stablecoin DEX
//
// Specialized for low-slippage stablecoin/pegged-asset swaps.
// Uses the Curve StableSwap exchange/get_dy functions.
//
// Key pools:
// - 3pool (DAI/USDC/USDT): 0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7
// - FRAX/USDC: 0xDcEF968d416a41Cdac0ED8702fAC8128A64241A2
// - stETH/ETH: 0xDC24316b9AE028F1497c275EB9192a3Ea0f67022

abigen!(
    ICurvePool,
    r#"[
        {
          "name": "exchange",
          "outputs": [{ "type": "uint256", "name": "" }],
          "inputs": [
            { "type": "int128", "name": "i" },
            { "type": "int128", "name": "j" },
            { "type": "uint256", "name": "dx" },
            { "type": "uint256", "name": "min_dy" }
          ],
          "stateMutability": "payable",
          "type": "function"
        },
        {
          "name": "get_dy",
          "outputs": [{ "type": "uint256", "name": "" }],
          "inputs": [
            { "type": "int128", "name": "i" },
            { "type": "int128", "name": "j" },
            { "type": "uint256", "name": "dx" }
          ],
          "stateMutability": "view",
          "type": "function"
        }
    ]"#
);

#[derive(Clone)]
pub struct CurveAdapter {
    client: Arc<SignerMiddleware<Provider<Http>, LocalWallet>>,
    pool_address: Address,
    pool_name: String,
    slippage_bps: u64,
}

impl CurveAdapter {
    pub fn new(config: Option<&ExchangeConfig>) -> Result<Self, ExchangeError> {
        let config = config.ok_or(ExchangeError::Configuration("Missing Curve config".into()))?;

        let rpc_url = std::env::var("CURVE_RPC_URL").unwrap_or_else(|_| {
            if config.testnet {
                "https://ethereum-sepolia-rpc.publicnode.com".to_string()
            } else {
                "https://eth.llamarpc.com".to_string()
            }
        });

        let provider = Provider::<Http>::try_from(rpc_url)
            .map_err(|e| ExchangeError::Configuration(format!("Invalid RPC URL: {}", e)))?;

        let private_key = config.get_secret_key().ok_or(ExchangeError::Configuration(
            "Missing Curve Private Key".into(),
        ))?;

        let chain_id: u64 = if config.testnet { 11155111 } else { 1 };

        let wallet: LocalWallet = private_key
            .parse::<LocalWallet>()
            .map_err(|e| ExchangeError::Configuration(format!("Invalid Private Key: {}", e)))?
            .with_chain_id(chain_id);

        let client = Arc::new(SignerMiddleware::new(provider, wallet));

        let pool_name = std::env::var("CURVE_POOL_NAME").unwrap_or_else(|_| "3pool".to_string());
        let default_pool = match pool_name.as_str() {
            "3pool" => "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
            "steth" => "0xDC24316b9AE028F1497c275EB9192a3Ea0f67022",
            "fraxusdc" => "0xDcEF968d416a41Cdac0ED8702fAC8128A64241A2",
            "tricrypto2" => "0xD51a44d3FaE010294C616388b506AcdA1bfAAE46",
            _ => "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
        };

        let pool_addr =
            std::env::var("CURVE_POOL_ADDRESS").unwrap_or_else(|_| default_pool.to_string());
        let pool_address = Address::from_str(&pool_addr)
            .map_err(|e| ExchangeError::Configuration(format!("Invalid Pool Address: {}", e)))?;

        // Stablecoins typically need tighter slippage (10 bps = 0.1%)
        let slippage_bps = std::env::var("CURVE_SLIPPAGE_BPS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(10u64); // 0.1% default for stablecoin pools

        Ok(Self {
            client,
            pool_address,
            pool_name,
            slippage_bps,
        })
    }

    /// Map token symbol to Curve pool index
    fn token_index(pool: &str, token: &str) -> Result<i128, ExchangeError> {
        match pool {
            "3pool" => match token {
                "DAI" => Ok(0),
                "USDC" => Ok(1),
                "USDT" => Ok(2),
                _ => Err(ExchangeError::Configuration(format!(
                    "Unknown token {} for 3pool",
                    token
                ))),
            },
            "steth" => match token {
                "ETH" => Ok(0),
                "stETH" => Ok(1),
                _ => Err(ExchangeError::Configuration(format!(
                    "Unknown token {} for steth pool",
                    token
                ))),
            },
            "fraxusdc" => match token {
                "FRAX" => Ok(0),
                "USDC" => Ok(1),
                _ => Err(ExchangeError::Configuration(format!(
                    "Unknown token {} for fraxusdc pool",
                    token
                ))),
            },
            "tricrypto2" => match token {
                "USDT" => Ok(0),
                "WBTC" => Ok(1),
                "WETH" => Ok(2),
                _ => Err(ExchangeError::Configuration(format!(
                    "Unknown token {} for tricrypto2",
                    token
                ))),
            },
            _ => Err(ExchangeError::Configuration(format!(
                "Unknown pool: {}",
                pool
            ))),
        }
    }

    fn token_decimals(token: &str) -> u32 {
        match token {
            "USDC" | "USDT" | "FRAX" => 6,
            "WBTC" => 8,
            _ => 18, // DAI, ETH, stETH, WETH
        }
    }

    /// Resolve token address for ERC-20 approval
    fn token_address(token: &str) -> Option<&'static str> {
        match token {
            "DAI" => Some("0x6B175474E89094C44Da98b954EedeAC495271d0F"),
            "USDC" => Some("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
            "USDT" => Some("0xdAC17F958D2ee523a2206206994597C13D831ec7"),
            "FRAX" => Some("0x853d955aCEf822Db058eb8505911ED77F175b99e"),
            "stETH" => Some("0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84"),
            "WBTC" => Some("0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"),
            "WETH" => Some("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
            _ => None,
        }
    }
}

#[async_trait]
impl ExchangeAdapter for CurveAdapter {
    async fn init(&self) -> Result<(), ExchangeError> {
        let _block = self
            .client
            .get_block_number()
            .await
            .map_err(|e| ExchangeError::Network(format!("Curve RPC connect failed: {}", e)))?;
        Ok(())
    }

    async fn place_order(&self, order: OrderRequest) -> Result<OrderResponse, ExchangeError> {
        let parts: Vec<&str> = order.symbol.split('/').collect();
        if parts.len() != 2 {
            return Err(ExchangeError::OrderRejected(
                "Invalid symbol — use TOKEN_IN/TOKEN_OUT format".into(),
            ));
        }

        let token_in = parts[0];
        let token_out = parts[1];

        let i = Self::token_index(&self.pool_name, token_in)?;
        let j = Self::token_index(&self.pool_name, token_out)?;

        let decimals = Self::token_decimals(token_in);
        let amount_in_raw = (order.quantity * Decimal::from(10u64.pow(decimals)))
            .to_u64()
            .unwrap_or(0);
        let amount_in = U256::from(amount_in_raw);

        // ERC-20 approval (skip for native ETH)
        if token_in != "ETH" {
            if let Some(addr_str) = Self::token_address(token_in) {
            let addr = Address::from_str(addr_str)
                .map_err(|e| ExchangeError::Configuration(format!("Bad address: {}", e)))?;
            dex_utils::ensure_approval(
                self.client.clone(),
                addr,
                self.pool_address,
                self.client.address(),
                amount_in,
            )
            .await
            .map_err(|e| ExchangeError::Network(format!("Token approval failed: {}", e)))?;
        }
    }

        let contract = ICurvePool::new(self.pool_address, self.client.clone());

        // Pre-quote via get_dy for accurate slippage protection
        let quoted_dy = contract
            .get_dy(i, j, amount_in)
            .call()
            .await
            .unwrap_or(U256::zero());

        let min_dy = if quoted_dy > U256::zero() {
            // Apply slippage to the actual quote (much more precise)
            dex_utils::calc_min_output(quoted_dy, self.slippage_bps)
        } else {
            // Fallback: apply slippage to input (rough)
            dex_utils::calc_min_output(amount_in, self.slippage_bps)
        };

        info!(
            "🔄 Curve swap ({} pool): {} → {}, quoted_dy={}, min_dy={}, slippage={}bps",
            self.pool_name, token_in, token_out, quoted_dy, min_dy, self.slippage_bps
        );

        let tx = contract.exchange(i, j, amount_in, min_dy);

        let pending_tx = tx
            .send()
            .await
            .map_err(|e| ExchangeError::Network(format!("Curve swap failed: {}", e)))?;

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
            "Cannot cancel Curve swap once broadcast".into(),
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

        if let Some(addr_str) = Self::token_address(asset) {
            let addr = Address::from_str(addr_str).unwrap();
            let decimals = Self::token_decimals(asset);
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
        "Curve Finance"
    }

    async fn get_positions(&self) -> Result<Vec<Position>, ExchangeError> {
        Ok(Vec::new())
    }
}

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

// PancakeSwap V3 Adapter — #1 DEX on BNB Chain
//
// Uses PancakeSwap SmartRouter (V3) for exact-input swaps.
// Supports BNB Chain (chain 56) and BSC Testnet (chain 97).
//
// Router addresses:
// - Mainnet BSC:  0x13f4EA83D0bd40E75C8222255bc855a974568Dd4
// - Testnet BSC:  0x1b81D678ffb9C0263b24A97847620C99d213eB14

abigen!(
    IPancakeRouter,
    r#"[
        {
          "inputs": [
            {
              "components": [
                { "internalType": "address", "name": "tokenIn", "type": "address" },
                { "internalType": "address", "name": "tokenOut", "type": "address" },
                { "internalType": "uint24", "name": "fee", "type": "uint24" },
                { "internalType": "address", "name": "recipient", "type": "address" },
                { "internalType": "uint256", "name": "amountIn", "type": "uint256" },
                { "internalType": "uint256", "name": "amountOutMinimum", "type": "uint256" },
                { "internalType": "uint160", "name": "sqrtPriceLimitX96", "type": "uint160" }
              ],
              "internalType": "struct IV3SwapRouter.ExactInputSingleParams",
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
pub struct PancakeSwapAdapter {
    client: Arc<SignerMiddleware<Provider<Http>, LocalWallet>>,
    router_address: Address,
    slippage_bps: u64,
}

impl PancakeSwapAdapter {
    pub fn new(config: Option<&ExchangeConfig>) -> Result<Self, ExchangeError> {
        let config = config.ok_or(ExchangeError::Configuration(
            "Missing PancakeSwap config".into(),
        ))?;

        // RPC URL — BSC mainnet or testnet
        let rpc_url = std::env::var("PANCAKESWAP_RPC_URL").unwrap_or_else(|_| {
            if config.testnet {
                "https://data-seed-prebsc-1-s1.binance.org:8545".to_string()
            } else {
                "https://bsc-dataseed.binance.org".to_string()
            }
        });

        let provider = Provider::<Http>::try_from(rpc_url)
            .map_err(|e| ExchangeError::Configuration(format!("Invalid RPC URL: {}", e)))?;

        let private_key = config.get_secret_key().ok_or(ExchangeError::Configuration(
            "Missing PancakeSwap Private Key".into(),
        ))?;

        // BSC Mainnet = 56, BSC Testnet = 97
        let chain_id: u64 = if config.testnet { 97 } else { 56 };

        let wallet: LocalWallet = private_key
            .parse::<LocalWallet>()
            .map_err(|e| ExchangeError::Configuration(format!("Invalid Private Key: {}", e)))?
            .with_chain_id(chain_id);

        let client = Arc::new(SignerMiddleware::new(provider, wallet));

        // PancakeSwap V3 SmartRouter
        let default_router = if config.testnet {
            "0x1b81D678ffb9C0263b24A97847620C99d213eB14"
        } else {
            "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4"
        };
        let router_addr = std::env::var("PANCAKESWAP_ROUTER_ADDRESS")
            .unwrap_or_else(|_| default_router.to_string());
        let router_address = Address::from_str(&router_addr)
            .map_err(|e| ExchangeError::Configuration(format!("Invalid Router Address: {}", e)))?;

        let slippage_bps = dex_utils::resolve_slippage("PANCAKESWAP");

        Ok(Self {
            client,
            router_address,
            slippage_bps,
        })
    }
}

#[async_trait]
impl ExchangeAdapter for PancakeSwapAdapter {
    async fn init(&self) -> Result<(), ExchangeError> {
        let _block =
            self.client.get_block_number().await.map_err(|e| {
                ExchangeError::Network(format!("Failed to connect to BSC RPC: {}", e))
            })?;
        Ok(())
    }

    async fn place_order(&self, order: OrderRequest) -> Result<OrderResponse, ExchangeError> {
        let (token_in_str, token_out_str) = if order.symbol.contains('-') {
            let s: Vec<&str> = order.symbol.split('-').collect();
            (s[0], s[1])
        } else {
            match order.symbol.as_str() {
                "WBNB/BUSD" | "BNB/BUSD" => (
                    "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
                    "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", // BUSD
                ),
                "WBNB/USDT" | "BNB/USDT" => (
                    "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
                    "0x55d398326f99059fF775485246999027B3197955", // BSC USDT
                ),
                "CAKE/WBNB" => (
                    "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82", // CAKE
                    "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
                ),
                "WBNB/USDC" | "BNB/USDC" => (
                    "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", // WBNB
                    "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // BSC USDC
                ),
                _ => {
                    return Err(ExchangeError::Configuration(
                        "Unknown symbol — use Address-Address format".into(),
                    ));
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

        // Configurable fee tier (PancakeSwap V3: 100, 500, 2500, 10000)
        let fee_tier: u32 = std::env::var("PANCAKESWAP_FEE_TIER")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(2500);

        info!(
            "🥞 PancakeSwap swap: {} → {}, fee={}bps, slippage={}bps",
            token_in_str, token_out_str, fee_tier, self.slippage_bps
        );

        let contract = IPancakeRouter::new(self.router_address, self.client.clone());

        let params = ExactInputSingleParams {
            token_in,
            token_out,
            fee: fee_tier.try_into().unwrap_or(2500),
            recipient: self.client.address(),
            amount_in,
            amount_out_minimum,
            sqrt_price_limit_x96: U256::zero(),
        };

        let tx = contract.exact_input_single(params);
        let pending_tx = tx
            .send()
            .await
            .map_err(|e| ExchangeError::Network(format!("PancakeSwap swap failed: {}", e)))?;

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
            "Cannot cancel PancakeSwap swap once broadcast".into(),
        ))
    }

    async fn get_balance(&self, asset: &str) -> Result<Decimal, ExchangeError> {
        if asset == "BNB" {
            let bal = self
                .client
                .get_balance(self.client.address(), None)
                .await
                .map_err(|e| ExchangeError::Network(e.to_string()))?;
            return Ok(Decimal::from_str(&bal.to_string()).unwrap_or(Decimal::ZERO)
                / Decimal::from(10u64.pow(18)));
        }

        // BEP-20 token balances
        let token_addr = match asset {
            "BUSD" => Some("0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56"),
            "USDT" => Some("0x55d398326f99059fF775485246999027B3197955"),
            "USDC" => Some("0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"),
            "CAKE" => Some("0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82"),
            "WBNB" => Some("0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"),
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
        "PancakeSwap V3"
    }

    async fn get_positions(&self) -> Result<Vec<Position>, ExchangeError> {
        Ok(Vec::new())
    }
}

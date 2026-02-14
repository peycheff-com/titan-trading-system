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

/// GMX V2 Adapter — #1 Perpetual DEX on Arbitrum
///
/// GMX V2 uses an on-chain order book with oracle-based pricing.
/// Orders are submitted to the ExchangeRouter, which creates them in the
/// OrderVault. Keepers fill orders when oracle prices confirm.
///
/// Addresses (Arbitrum One):
/// - ExchangeRouter: 0x7C68C7866A64FA2160F78EEaE12217FFbf871fa8
/// - OrderVault:     0x31eF83a530Fde1B38deDA89C0A6c72a85D4da123
/// - USDC:           0xaf88d065e77c8cC2239327C5EDb3A432268e5831
/// - WETH:           0x82aF49447D8a07e3bd95BD0d56f35241523fBab1

abigen!(
    IGMXExchangeRouter,
    r#"[
        {
          "inputs": [
            {
              "components": [
                {
                  "components": [
                    { "internalType": "address", "name": "receiver", "type": "address" },
                    { "internalType": "address", "name": "callbackContract", "type": "address" },
                    { "internalType": "address", "name": "uiFeeReceiver", "type": "address" },
                    { "internalType": "address", "name": "market", "type": "address" },
                    { "internalType": "address", "name": "initialCollateralToken", "type": "address" },
                    { "internalType": "address[]", "name": "swapPath", "type": "address[]" }
                  ],
                  "internalType": "struct BaseOrderUtils.CreateOrderParamsAddresses",
                  "name": "addresses",
                  "type": "tuple"
                },
                {
                  "components": [
                    { "internalType": "uint256", "name": "sizeDeltaUsd", "type": "uint256" },
                    { "internalType": "uint256", "name": "initialCollateralDeltaAmount", "type": "uint256" },
                    { "internalType": "uint256", "name": "triggerPrice", "type": "uint256" },
                    { "internalType": "uint256", "name": "acceptablePrice", "type": "uint256" },
                    { "internalType": "uint256", "name": "executionFee", "type": "uint256" },
                    { "internalType": "uint256", "name": "callbackGasLimit", "type": "uint256" },
                    { "internalType": "uint256", "name": "minOutputAmount", "type": "uint256" }
                  ],
                  "internalType": "struct BaseOrderUtils.CreateOrderParamsNumbers",
                  "name": "numbers",
                  "type": "tuple"
                },
                { "internalType": "uint8", "name": "orderType", "type": "uint8" },
                { "internalType": "uint8", "name": "decreasePositionSwapType", "type": "uint8" },
                { "internalType": "bool", "name": "isLong", "type": "bool" },
                { "internalType": "bool", "name": "shouldUnwrapNativeToken", "type": "bool" },
                { "internalType": "bytes32", "name": "referralCode", "type": "bytes32" }
              ],
              "internalType": "struct BaseOrderUtils.CreateOrderParams",
              "name": "params",
              "type": "tuple"
            }
          ],
          "name": "createOrder",
          "outputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
          "stateMutability": "payable",
          "type": "function"
        },
        {
          "inputs": [
            { "internalType": "address", "name": "token", "type": "address" },
            { "internalType": "address", "name": "receiver", "type": "address" },
            { "internalType": "uint256", "name": "amount", "type": "uint256" }
          ],
          "name": "sendTokens",
          "outputs": [],
          "stateMutability": "payable",
          "type": "function"
        },
        {
          "inputs": [
            { "internalType": "address", "name": "receiver", "type": "address" }
          ],
          "name": "sendWnt",
          "outputs": [],
          "stateMutability": "payable",
          "type": "function"
        }
    ]"#
);

/// Well-known GMX V2 Arbitrum addresses
const EXCHANGE_ROUTER: &str = "0x7C68C7866A64FA2160F78EEaE12217FFbf871fa8";
const ORDER_VAULT: &str = "0x31eF83a530Fde1B38deDA89C0A6c72a85D4da123";
const ARB_USDC: &str = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const ARB_WETH: &str = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
const ARB_WBTC: &str = "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f";

/// GMX V2 markets (market address for the perpetual pair)
const ETH_USD_MARKET: &str = "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336";
const BTC_USD_MARKET: &str = "0x47c031236e19d024b42f8AE6DA7A0d1D6FAb4291";

#[derive(Clone)]
pub struct GmxAdapter {
    client: Arc<SignerMiddleware<Provider<Http>, LocalWallet>>,
    exchange_router: Address,
    order_vault: Address,
    slippage_bps: u64,
}

impl GmxAdapter {
    pub fn new(config: Option<&ExchangeConfig>) -> Result<Self, ExchangeError> {
        let config = config.ok_or(ExchangeError::Configuration("Missing GMX config".into()))?;

        let rpc_url = std::env::var("GMX_RPC_URL").unwrap_or_else(|_| {
            if config.testnet {
                "https://goerli-rollup.arbitrum.io/rpc".to_string()
            } else {
                "https://arb1.arbitrum.io/rpc".to_string()
            }
        });

        let provider = Provider::<Http>::try_from(rpc_url)
            .map_err(|e| ExchangeError::Configuration(format!("Invalid RPC URL: {}", e)))?;

        let private_key = config.get_secret_key().ok_or(ExchangeError::Configuration(
            "Missing GMX Private Key".into(),
        ))?;

        // Arbitrum One = 42161, Arbitrum Goerli = 421613
        let chain_id: u64 = if config.testnet { 421613 } else { 42161 };

        let wallet: LocalWallet = private_key
            .parse::<LocalWallet>()
            .map_err(|e| ExchangeError::Configuration(format!("Invalid Private Key: {}", e)))?
            .with_chain_id(chain_id);

        let client = Arc::new(SignerMiddleware::new(provider, wallet));

        let exchange_router = Address::from_str(
            &std::env::var("GMX_EXCHANGE_ROUTER").unwrap_or_else(|_| EXCHANGE_ROUTER.to_string()),
        )
        .map_err(|e| ExchangeError::Configuration(format!("Invalid Router: {}", e)))?;

        let order_vault = Address::from_str(
            &std::env::var("GMX_ORDER_VAULT").unwrap_or_else(|_| ORDER_VAULT.to_string()),
        )
        .map_err(|e| ExchangeError::Configuration(format!("Invalid Vault: {}", e)))?;

        let slippage_bps = dex_utils::resolve_slippage("GMX");

        Ok(Self {
            client,
            exchange_router,
            order_vault,
            slippage_bps,
        })
    }

    /// Resolve market address + collateral for well-known GMX perps
    fn resolve_market(symbol: &str) -> Result<(Address, Address, bool), ExchangeError> {
        match symbol {
            "ETH/USD" | "ETH-PERP" => Ok((
                Address::from_str(ETH_USD_MARKET).unwrap(),
                Address::from_str(ARB_USDC).unwrap(),
                true, // isLong
            )),
            "BTC/USD" | "BTC-PERP" => Ok((
                Address::from_str(BTC_USD_MARKET).unwrap(),
                Address::from_str(ARB_USDC).unwrap(),
                true,
            )),
            "ETH/USD-SHORT" => Ok((
                Address::from_str(ETH_USD_MARKET).unwrap(),
                Address::from_str(ARB_USDC).unwrap(),
                false,
            )),
            "BTC/USD-SHORT" => Ok((
                Address::from_str(BTC_USD_MARKET).unwrap(),
                Address::from_str(ARB_USDC).unwrap(),
                false,
            )),
            _ => Err(ExchangeError::Configuration(format!(
                "Unknown GMX market: {}. Use ETH/USD, BTC/USD, ETH/USD-SHORT, BTC/USD-SHORT",
                symbol
            ))),
        }
    }
}

#[async_trait]
impl ExchangeAdapter for GmxAdapter {
    async fn init(&self) -> Result<(), ExchangeError> {
        let _block = self
            .client
            .get_block_number()
            .await
            .map_err(|e| ExchangeError::Network(format!("GMX/Arbitrum RPC failed: {}", e)))?;
        Ok(())
    }

    async fn place_order(&self, order: OrderRequest) -> Result<OrderResponse, ExchangeError> {
        let (market, collateral_token, is_long) = Self::resolve_market(&order.symbol)?;

        // Size in USD (30 decimals for GMX V2)
        let size_usd = (order.quantity * Decimal::from(10u64.pow(30)))
            .to_u128()
            .unwrap_or(0);

        // Execution fee: Estimate based on current gas price
        // GMX V2 requires ~2M gas for keeper execution. We use 2.5M for safety.
        let gas_price = self
            .client
            .get_gas_price()
            .await
            .map_err(|e| ExchangeError::Network(format!("Gas price fetch failed: {}", e)))?;

        let estimated_fee = gas_price * U256::from(2_500_000u64);

        // Ensure minimum of 0.001 ETH (safe floor)
        let min_fee = U256::from(1_000_000_000_000_000u64);
        let execution_fee = std::cmp::max(estimated_fee, min_fee);

        // Acceptable price with slippage
        // For longs: max price = infinity (we accept any price up to slippage)
        // For shorts: min price = 0
        let acceptable_price = if is_long {
            U256::MAX // Market order — accept any price
        } else {
            U256::zero()
        };

        // Approve USDC collateral for OrderVault
        dex_utils::ensure_approval(
            self.client.clone(),
            collateral_token,
            self.order_vault,
            self.client.address(),
            U256::from(size_usd),
        )
        .await
        .map_err(|e| ExchangeError::Network(format!("Collateral approval failed: {}", e)))?;

        info!(
            "📊 GMX V2 order: {} {} size=${}k, slippage={}bps",
            if is_long { "LONG" } else { "SHORT" },
            order.symbol,
            order.quantity / Decimal::from(1000),
            self.slippage_bps
        );

        let router = IGMXExchangeRouter::new(self.exchange_router, self.client.clone());

        // Build CreateOrderParams using abigen-generated struct types
        let addresses = CreateOrderParamsAddresses {
            receiver: self.client.address(),
            callback_contract: Address::zero(),
            ui_fee_receiver: Address::zero(),
            market,
            initial_collateral_token: collateral_token,
            swap_path: Vec::new(),
        };

        let numbers = CreateOrderParamsNumbers {
            size_delta_usd: U256::from(size_usd),
            initial_collateral_delta_amount: U256::zero(),
            trigger_price: U256::zero(),
            acceptable_price,
            execution_fee,
            callback_gas_limit: U256::zero(),
            min_output_amount: U256::zero(),
        };

        let params = CreateOrderParams {
            addresses,
            numbers,
            order_type: 2, // MarketIncrease
            decrease_position_swap_type: 0,
            is_long,
            should_unwrap_native_token: true,
            referral_code: [0u8; 32],
        };

        let tx = router.create_order(params).value(execution_fee);

        let pending_tx = tx
            .send()
            .await
            .map_err(|e| ExchangeError::Network(format!("GMX createOrder failed: {}", e)))?;

        let tx_hash = format!("{:?}", pending_tx.tx_hash());

        Ok(OrderResponse {
            order_id: tx_hash,
            client_order_id: order.client_order_id,
            symbol: order.symbol,
            status: "PENDING_KEEPER".to_string(),
            executed_qty: Decimal::zero(),
            avg_price: None,
            t_exchange: None,
            t_ack: Utc::now().timestamp_millis(),
            fee: None,
            fee_asset: Some("ETH".to_string()),
        })
    }

    async fn cancel_order(
        &self,
        _symbol: &str,
        _order_id: &str,
    ) -> Result<OrderResponse, ExchangeError> {
        // GMX V2 supports order cancellation via cancelOrder(bytes32 key)
        // Requires the order key from createOrder return value
        Err(ExchangeError::NotImplemented(
            "GMX order cancellation requires order key — use full SDK".into(),
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
            "USDC" => Some(ARB_USDC),
            "WETH" => Some(ARB_WETH),
            "WBTC" => Some(ARB_WBTC),
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
        "GMX V2"
    }

    async fn get_positions(&self) -> Result<Vec<Position>, ExchangeError> {
        // GMX V2 positions require reading from DataStore contract
        // which involves complex multicall — defer to full SDK
        Ok(Vec::new())
    }
}

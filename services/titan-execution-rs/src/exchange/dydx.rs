use crate::config::ExchangeConfig;
use crate::exchange::adapter::{
    ExchangeAdapter, ExchangeError, OrderRequest, OrderResponse, Position,
};
use async_trait::async_trait;
use rust_decimal::prelude::*;

#[derive(Clone)]
pub struct DydxAdapter {
    #[allow(dead_code)] // Reserved for future dYdX v4 API integration
    base_url: String,
}

impl DydxAdapter {
    pub fn new(config: Option<&ExchangeConfig>) -> Result<Self, ExchangeError> {
        let _config = config.ok_or(ExchangeError::Configuration("Missing dYdX config".into()))?;

        Ok(Self {
            base_url: "https://indexer.dydx.trade/v4".to_string(),
        })
    }
}

#[async_trait]
impl ExchangeAdapter for DydxAdapter {
    async fn init(&self) -> Result<(), ExchangeError> {
        Ok(())
    }

    async fn place_order(&self, _order: OrderRequest) -> Result<OrderResponse, ExchangeError> {
        Err(ExchangeError::NotImplemented("dYdX place_order".into()))
    }

    async fn cancel_order(
        &self,
        _symbol: &str,
        _order_id: &str,
    ) -> Result<OrderResponse, ExchangeError> {
        Err(ExchangeError::NotImplemented("dYdX cancel_order".into()))
    }

    async fn get_balance(&self, _asset: &str) -> Result<Decimal, ExchangeError> {
        Ok(Decimal::zero())
    }

    fn name(&self) -> &str {
        "dydx"
    }

    async fn get_positions(&self) -> Result<Vec<Position>, ExchangeError> {
        Ok(Vec::new())
    }
}

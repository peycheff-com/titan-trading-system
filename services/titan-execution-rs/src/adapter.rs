use async_trait::async_trait;
use crate::model::{Order, OrderId, Position, Symbol};
use rust_decimal::Decimal;

#[async_trait]
pub trait ExchangeAdapter: Send + Sync {
    async fn get_positions(&self) -> Result<Vec<Position>, String>;
    async fn place_order(&self, order: Order) -> Result<OrderId, String>;
    async fn cancel_order(&self, order_id: OrderId, symbol: Symbol) -> Result<(), String>;
    async fn get_balance(&self) -> Result<Decimal, String>;
}

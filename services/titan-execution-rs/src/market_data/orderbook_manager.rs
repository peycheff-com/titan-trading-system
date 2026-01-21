use crate::market_data::model::{OrderBookL2, OrderBookLevel};
use rust_decimal::Decimal;
use std::collections::{BTreeMap, HashMap};

/// Manages the local state of orderbooks for multiple symbols.
/// Applies snapshots and deltas to maintain integrity.
pub struct OrderBookManager {
    books: HashMap<String, LocalBook>,
}

struct LocalBook {
    #[allow(dead_code)]
    symbol: String,
    bids: BTreeMap<Decimal, Decimal>, // Price -> Quantity (Reverse Ordered for Bids usually, but BTreeMap is ASC. We handle desc iter)
    asks: BTreeMap<Decimal, Decimal>, // Price -> Quantity (ASC)
    last_update_id: u64,
}

impl OrderBookManager {
    pub fn new() -> Self {
        Self {
            books: HashMap::new(),
        }
    }

    pub fn apply_event(&mut self, event: &OrderBookL2) {
        let book = self
            .books
            .entry(event.symbol.clone())
            .or_insert_with(|| LocalBook {
                symbol: event.symbol.clone(),
                bids: BTreeMap::new(),
                asks: BTreeMap::new(),
                last_update_id: 0,
            });

        if event.is_snapshot {
            // Reset and Fill
            book.bids.clear();
            book.asks.clear();
            for level in &event.bids {
                book.bids.insert(level.price, level.quantity);
            }
            for level in &event.asks {
                book.asks.insert(level.price, level.quantity);
            }
            book.last_update_id = event.update_id;
        } else {
            // Delta Update
            // Check sequence (optional but good)
            if event.update_id <= book.last_update_id {
                // return; // Old update?
            }
            book.last_update_id = event.update_id;

            // Apply Bids
            for level in &event.bids {
                if level.quantity.is_zero() {
                    book.bids.remove(&level.price);
                } else {
                    book.bids.insert(level.price, level.quantity);
                }
            }
            // Apply Asks
            for level in &event.asks {
                if level.quantity.is_zero() {
                    book.asks.remove(&level.price);
                } else {
                    book.asks.insert(level.price, level.quantity);
                }
            }
        }
    }

    pub fn get_snapshot(&self, symbol: &str, depth: usize) -> Option<OrderBookL2> {
        if let Some(book) = self.books.get(symbol) {
            let bids: Vec<OrderBookLevel> = book
                .bids
                .iter()
                .rev()
                .take(depth)
                .map(|(p, q)| OrderBookLevel {
                    price: *p,
                    quantity: *q,
                })
                .collect();

            let asks: Vec<OrderBookLevel> = book
                .asks
                .iter()
                .take(depth)
                .map(|(p, q)| OrderBookLevel {
                    price: *p,
                    quantity: *q,
                })
                .collect();

            Some(OrderBookL2 {
                symbol: symbol.to_string(),
                bids,
                asks,
                timestamp: chrono::Utc::now(), // Synthetic timestamp
                update_id: book.last_update_id,
                exchange: "INTERNAL".to_string(),
                is_snapshot: true,
            })
        } else {
            None
        }
    }
}

use titan_execution_rs::market_data::binance::connector::BinanceConnector;
use titan_execution_rs::market_data::bybit::connector::BybitConnector;
use titan_execution_rs::market_data::connector::{MarketDataConnector, StreamType, Subscription};
use titan_execution_rs::market_data::hyperliquid::connector::HyperliquidConnector;
use titan_execution_rs::market_data::mexc::connector::MexcConnector;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();
    println!("Starting Dual Exchange Market Data Test...");

    // Spawn Bybit Task
    let bybit_handle = tokio::spawn(async {
        let mut connector = BybitConnector::new();
        println!("[Bybit] Connecting...");
        if let Err(e) = connector.connect().await {
            println!("[Bybit] Connection failed: {}", e);
            return;
        }

        // Subscribe
        let sub = Subscription {
            symbol: "BTCUSDT".to_string(),
            stream_type: StreamType::OrderBookL2,
        };
        if let Err(e) = connector.subscribe(sub).await {
            println!("[Bybit] Subscription failed: {}", e);
            return;
        }
        println!("[Bybit] Subscribed to BTCUSDT Orderbook");

        let mut stream = connector.event_stream();
        let mut count = 0;
        while let Some(event) = stream.recv().await {
            println!("[Bybit] Event: {:?}", event);
            count += 1;
            if count >= 3 {
                break;
            }
        }
        println!("[Bybit] Done.");
    });

    // Spawn MEXC Task
    let mexc_handle = tokio::spawn(async {
        let mut connector = MexcConnector::new();
        println!("[MEXC] Connecting...");
        if let Err(e) = connector.connect().await {
            println!("[MEXC] Connection failed: {}", e);
            return;
        }

        // Subscribe
        let sub = Subscription {
            symbol: "BTCUSDT".to_string(), // Connector should adapt to BTC_USDT
            stream_type: StreamType::PublicTrade,
        };
        if let Err(e) = connector.subscribe(sub).await {
            println!("[MEXC] Subscription failed: {}", e);
            return;
        }
        println!("[MEXC] Subscribed to BTC_USDT");

        let mut stream = connector.event_stream();
        let mut count = 0;
        while let Some(event) = stream.recv().await {
            println!("[MEXC] Event: {:?}", event);
            count += 1;
            if count >= 3 {
                break;
            }
        }
        println!("[MEXC] Done.");
    });

    // Spawn Binance Task
    let binance_handle = tokio::spawn(async {
        let mut connector = BinanceConnector::new();
        println!("[Binance] Connecting...");
        if let Err(e) = connector.connect().await {
            println!("[Binance] Connection failed: {}", e);
            return;
        }

        // Subscribe
        let sub = Subscription {
            symbol: "BTCUSDT".to_string(), // Connector should handle lowercase/norm
            stream_type: StreamType::PublicTrade,
        };
        if let Err(e) = connector.subscribe(sub).await {
            println!("[Binance] Subscription failed: {}", e);
            return;
        }
        println!("[Binance] Subscribed to BTCUSDT");

        let mut stream = connector.event_stream();
        let mut count = 0;
        while let Some(event) = stream.recv().await {
            println!("[Binance] Event: {:?}", event);
            count += 1;
            if count >= 3 {
                break;
            }
        }
        println!("[Binance] Done.");
    });

    // Spawn Hyperliquid Task
    let hl_handle = tokio::spawn(async {
        let mut connector = HyperliquidConnector::new();
        println!("[HL] Connecting...");
        if let Err(e) = connector.connect().await {
            println!("[HL] Connection failed: {}", e);
            return;
        }

        let sub = Subscription {
            symbol: "BTC".to_string(), // Hyperliquid uses "BTC"
            stream_type: StreamType::PublicTrade,
        };
        if let Err(e) = connector.subscribe(sub).await {
            println!("[HL] Subscription failed: {}", e);
            return;
        }
        println!("[HL] Subscribed to BTC");

        let mut stream = connector.event_stream();
        let mut count = 0;
        while let Some(event) = stream.recv().await {
            println!("[HL] Event: {:?}", event);
            count += 1;
            if count >= 3 {
                break;
            }
        }
        println!("[HL] Done.");
    });

    // Wait for all
    let _ = tokio::join!(bybit_handle, mexc_handle, binance_handle, hl_handle);
    println!("Quad Stream Test Complete!");
    Ok(())
}

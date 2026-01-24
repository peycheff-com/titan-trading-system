use rust_decimal_macros::dec;
use std::env;
use std::fs::File;
use std::io::Write;
use std::path::PathBuf;
use titan_execution_rs::market_data::types::BookTicker;
use titan_execution_rs::model::{Intent, IntentStatus, IntentType};
use titan_execution_rs::replay_model::ReplayEvent;
use titan_execution_rs::risk_policy::{RiskPolicy, RiskState};

struct Args {
    output: PathBuf,
    scenarios: usize,
}

impl Args {
    fn parse() -> Self {
        let args: Vec<String> = env::args().collect();
        let mut output = PathBuf::from("golden_dataset.jsonl");
        let mut scenarios = 100;

        let mut i = 1;
        while i < args.len() {
            match args[i].as_str() {
                "--output" | "-o" => {
                    if i + 1 < args.len() {
                        output = PathBuf::from(&args[i + 1]);
                        i += 1;
                    }
                }
                "--scenarios" | "-n" => {
                    if i + 1 < args.len() {
                        if let Ok(n) = args[i + 1].parse() {
                            scenarios = n;
                        }
                        i += 1;
                    }
                }
                _ => {}
            }
            i += 1;
        }

        Self { output, scenarios }
    }
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args = Args::parse();
    let mut file = File::create(&args.output)?;

    let mut timestamp = 1700000000000;

    // 1. Initial State: Normal
    let mut policy = RiskPolicy::default();
    policy.current_state = RiskState::Normal;
    write_event(
        &mut file,
        ReplayEvent::RiskPolicy {
            policy: policy.clone(),
            ts: timestamp,
        },
    )?;

    // 2. Market Data & Signal Loop
    let mut price = dec!(50000.0);

    for i in 0..args.scenarios {
        timestamp += 1000;

        // Simulating Price Walk
        if i % 2 == 0 {
            price += dec!(10.0);
        } else {
            price -= dec!(10.0);
        }

        // Market Data Tick
        let ticker = BookTicker {
            symbol: "BTC/USDT".to_string(),
            best_bid: price,
            best_bid_qty: dec!(5.0),
            best_ask: price + dec!(1.0),
            best_ask_qty: dec!(5.0),
            transaction_time: timestamp,
            event_time: timestamp,
        };
        write_event(&mut file, ReplayEvent::MarketData(ticker))?;

        // Random Signal Injection (deterministic pattern via loop index)
        if i % 10 == 0 {
            let intent = Intent {
                signal_id: format!("golden-sig-{}", i),
                source: Some("golden_gen".to_string()),
                symbol: "BTC/USDT".to_string(),
                direction: 1, // Long
                intent_type: IntentType::BuySetup,
                entry_zone: vec![price, price + dec!(5.0)],
                stop_loss: price - dec!(500.0),
                take_profits: vec![price + dec!(1000.0)],
                size: dec!(0.1),
                status: IntentStatus::Pending,
                t_signal: timestamp + 50,
                t_analysis: None,
                t_decision: None,
                t_ingress: None,
                t_exchange: None,
                max_slippage_bps: Some(50),
                rejection_reason: None,
                regime_state: None,
                phase: None,
                metadata: None,
                exchange: None,
                position_mode: None,
                // Envelope
                ttl_ms: Some(5000),
                partition_key: None,
                causation_id: None,
                env: None,
                subject: None,
                child_fills: vec![],
                filled_size: dec!(0),
            };
            write_event(&mut file, ReplayEvent::Signal(intent))?;
        }

        // Inject a Risk Policy Update mid-stream
        if i == 50 {
            policy.max_position_notional = dec!(10000.0); // Tighter limit
            write_event(
                &mut file,
                ReplayEvent::RiskPolicy {
                    policy: policy.clone(),
                    ts: timestamp + 10,
                },
            )?;
        }
    }

    // Final Tick
    timestamp += 1000;
    write_event(&mut file, ReplayEvent::Tick { timestamp })?;

    println!(
        "✨ Generated Golden Dataset: {:?} with {} scenarios",
        args.output, args.scenarios
    );
    Ok(())
}

fn write_event(file: &mut File, event: ReplayEvent) -> std::io::Result<()> {
    let json = serde_json::to_string(&event)?;
    writeln!(file, "{}", json)
}

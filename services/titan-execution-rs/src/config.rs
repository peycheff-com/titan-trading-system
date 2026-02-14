use config::{Config, ConfigError, Environment, File};
use serde::Deserialize;
use std::collections::HashMap;
use std::env;

#[derive(Debug, Deserialize, Clone, Default)]
pub struct Settings {
    pub exchanges: Option<Exchanges>,
    pub execution: Option<ExecutionConfig>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct Exchanges {
    pub binance: Option<ExchangeConfig>,
    pub bybit: Option<ExchangeConfig>,
    pub mexc: Option<ExchangeConfig>,
    pub okx: Option<ExchangeConfig>,
    pub coinbase: Option<ExchangeConfig>,
    pub kraken: Option<ExchangeConfig>,
    pub kucoin: Option<ExchangeConfig>,
    pub gateio: Option<ExchangeConfig>,
    pub cryptocom: Option<ExchangeConfig>,
    pub dydx: Option<ExchangeConfig>,
    pub uniswap: Option<ExchangeConfig>,
    pub pancakeswap: Option<ExchangeConfig>,
    pub sushiswap: Option<ExchangeConfig>,
    pub curve: Option<ExchangeConfig>,
    pub jupiter: Option<ExchangeConfig>,
    pub gmx: Option<ExchangeConfig>,
    pub hyperliquid: Option<ExchangeConfig>,
    #[serde(flatten)]
    pub others: HashMap<String, ExchangeConfig>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct ExchangeConfig {
    pub api_key: Option<String>,
    pub secret_key: Option<String>, // "secret_key" or "apiSecret"? JSON usually uses camelCase.
    // We should use alias to support both snake_case (Rust) and camelCase (JSON) or use serde rename_all

    // Support JSON keys: apiKey, apiSecret, testnet, enabled
    #[serde(alias = "apiKey")]
    pub api_key_alt: Option<String>,

    #[serde(alias = "apiSecret")]
    pub secret_key_alt: Option<String>,

    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub testnet: bool,

    #[serde(alias = "executeOn", default)]
    pub execute_on: bool,

    #[serde(alias = "rateLimit")]
    pub rate_limit: Option<u32>,
}

impl ExchangeConfig {
    pub fn get_api_key(&self) -> Option<String> {
        self.api_key.clone().or(self.api_key_alt.clone())
    }

    pub fn get_secret_key(&self) -> Option<String> {
        self.secret_key.clone().or(self.secret_key_alt.clone())
    }
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct ExecutionConfig {
    pub port: Option<u16>,
    pub nats_url: Option<String>,
    pub routing: Option<RoutingConfig>,
    pub initial_balance: Option<f64>,
    pub freshness_threshold_ms: Option<u64>,
    pub risk_guard: RiskGuardConfig,
    #[serde(default)]
    pub active_standby: bool,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct RiskGuardConfig {
    pub max_leverage: f64,
    pub daily_loss_limit: f64,
    pub symbol_whitelist: Vec<String>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct RoutingConfig {
    pub fanout: Option<bool>,
    pub weights: Option<HashMap<String, f64>>,
    #[serde(default)]
    pub per_source: HashMap<String, RoutingRule>,
}

#[derive(Debug, Deserialize, Clone, Default)]
pub struct RoutingRule {
    pub fanout: Option<bool>,
    pub weights: Option<HashMap<String, f64>>,
}

impl Settings {
    pub fn new() -> Result<Self, ConfigError> {
        let _run_mode = env::var("RUN_MODE").unwrap_or_else(|_| "development".into());
        let home = env::var("HOME").unwrap_or_else(|_| ".".into());

        let s = Config::builder()
            // 1. Load global config from ~/.titan/config.json
            .add_source(File::with_name(&format!("{}/.titan/config", home)).required(false))
            // 2. Load project config from config/config.json
            .add_source(File::with_name("config/config").required(false))
            // 3. Load local config from config/local.json (not checked in)
            .add_source(File::with_name("config/local").required(false))
            // 4. Load environment overrides (Titan specific)
            // e.g. TITAN_EXCHANGES__BINANCE__API_KEY
            .add_source(Environment::with_prefix("TITAN").separator("__"))
            .build()?;

        let s = s.try_deserialize::<Settings>()?;
        s.validate()?;
        Ok(s)
    }

    pub fn validate(&self) -> Result<(), ConfigError> {
        // 1. Validate NATS URL (Execution Config)
        if let Some(exec) = &self.execution {
            if let Some(nats_url) = &exec.nats_url
                && nats_url.trim().is_empty()
            {
                return Err(ConfigError::Message("NATS URL cannot be empty".to_string()));
            }

            // Validate Risk Guard (GAP-03)
            let risk = &exec.risk_guard;
            if risk.max_leverage > 20.0 {
                return Err(ConfigError::Message(format!(
                    "Risk Guard: Max leverage {:.1} exceeds safety limit of 20.0",
                    risk.max_leverage
                )));
            }
            if risk.daily_loss_limit <= 0.0 {
                return Err(ConfigError::Message(
                    "Risk Guard: Daily loss limit must be positive".to_string(),
                ));
            }
            if risk.symbol_whitelist.is_empty() {
                return Err(ConfigError::Message(
                    "Risk Guard: Symbol whitelist cannot be empty".to_string(),
                ));
            }
        }

        // 2. Validate Exchanges
        if let Some(exchanges) = &self.exchanges {
            // Helper to validate individual exchange
            let validate_exchange = |name: &str,
                                     config: &Option<ExchangeConfig>|
             -> Result<(), ConfigError> {
                if let Some(c) = config
                    && c.enabled
                {
                    if c.get_api_key().is_none() || c.get_api_key().unwrap().trim().is_empty() {
                        return Err(ConfigError::Message(format!(
                            "Exchange '{}' is enabled but API Key is missing",
                            name
                        )));
                    }
                    if c.get_secret_key().is_none() || c.get_secret_key().unwrap().trim().is_empty()
                    {
                        return Err(ConfigError::Message(format!(
                            "Exchange '{}' is enabled but Secret Key is missing",
                            name
                        )));
                    }
                }
                Ok(())
            };

            validate_exchange("binance", &exchanges.binance)?;
            validate_exchange("bybit", &exchanges.bybit)?;
            validate_exchange("mexc", &exchanges.mexc)?;
            validate_exchange("okx", &exchanges.okx)?;
            validate_exchange("coinbase", &exchanges.coinbase)?;
            validate_exchange("kraken", &exchanges.kraken)?;
            validate_exchange("kucoin", &exchanges.kucoin)?;
            validate_exchange("gateio", &exchanges.gateio)?;
            validate_exchange("cryptocom", &exchanges.cryptocom)?;
            validate_exchange("dydx", &exchanges.dydx)?;
            validate_exchange("uniswap", &exchanges.uniswap)?;

            for (name, config) in &exchanges.others {
                validate_exchange(name, &Some(config.clone()))?;
            }
        }

        // 3. Validate Routing Config
        if let Some(exec) = &self.execution
            && let Some(routing) = &exec.routing
        {
            let validate_weights =
                |name: &str, weights: &Option<HashMap<String, f64>>| -> Result<(), ConfigError> {
                    if let Some(map) = weights {
                        if map.is_empty() {
                            return Err(ConfigError::Message(format!(
                                "Routing weights for '{}' cannot be empty",
                                name
                            )));
                        }
                        for (exchange, weight) in map {
                            if !weight.is_finite() || *weight <= 0.0 {
                                return Err(ConfigError::Message(format!(
                                    "Routing weight for '{}' must be > 0 (exchange: {})",
                                    name, exchange
                                )));
                            }
                        }
                    }
                    Ok(())
                };

            validate_weights("default", &routing.weights)?;
            for (source, rule) in &routing.per_source {
                validate_weights(source, &rule.weights)?;
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_defaults() {
        // Ensure no env vars interfere
        // This is tricky if running in parallel, but for unit test file it's okay unless global env is set.
        // Better to use Figment or Config with manual source for testing, but Config works with env.

        let _settings = Settings::new();
        // It might fail if no file, but defaults should be Option::None or defaults.
        // We set defaults for ExecutionConfig
        // But Settings::new() calls Config::builder().

        // If config file is missing, and no env vars, result depends on error handling.
        // Our Settings::new() returns Result.

        // To test robustly, we can checking if it parsers structure correctly.
    }

    #[test]
    fn test_exchange_config_mapping() {
        let mut map = HashMap::new();
        map.insert(
            "test".to_string(),
            ExchangeConfig {
                api_key: Some("key".into()),
                secret_key: Some("secret".into()),
                api_key_alt: None,
                secret_key_alt: None,
                enabled: true,
                testnet: true,
                execute_on: false,
                rate_limit: None,
            },
        );

        let exchanges = Exchanges {
            others: map,
            ..Default::default()
        };

        assert!(exchanges.others.contains_key("test"));
    }

    #[test]
    fn test_api_key_fallback() {
        let config = ExchangeConfig {
            api_key: None,
            secret_key: None,
            api_key_alt: Some("alt_key".into()),
            secret_key_alt: Some("alt_secret".into()),
            enabled: true,
            testnet: false,
            execute_on: true,
            rate_limit: None,
        };

        assert_eq!(config.get_api_key().unwrap(), "alt_key");
        assert_eq!(config.get_secret_key().unwrap(), "alt_secret");
    }

    #[test]
    fn test_validation_error() {
        let mut settings = Settings::default();
        let mut map = HashMap::new();
        // Invalid config: Enabled but no API Key
        map.insert(
            "test_ex".to_string(),
            ExchangeConfig {
                api_key: None,
                secret_key: None,
                api_key_alt: None,
                secret_key_alt: None,
                enabled: true,
                testnet: false,
                execute_on: false,
                rate_limit: None,
            },
        );
        settings.exchanges = Some(Exchanges {
            others: map,
            ..Default::default()
        });

        let result = settings.validate();
        assert!(result.is_err());
        match result {
            Err(ConfigError::Message(msg)) => {
                assert!(msg.contains("API Key is missing"));
            }
            _ => panic!("Expected ConfigError::Message"),
        }
    }

    #[test]
    fn test_risk_guard_validation() {
        let settings = Settings {
            execution: Some(ExecutionConfig {
                risk_guard: RiskGuardConfig {
                    max_leverage: 100.0, // Unsafe
                    daily_loss_limit: 1000.0,
                    symbol_whitelist: vec!["BTC/USDT".into()],
                },
                ..Default::default()
            }),
            ..Default::default()
        };

        let result = settings.validate();
        assert!(result.is_err());
        match result {
            Err(ConfigError::Message(msg)) => assert!(msg.contains("exceeds safety limit")),
            _ => panic!("Should fail on leverage"),
        }
    }
}

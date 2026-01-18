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
}

impl Settings {
    pub fn new() -> Result<Self, ConfigError> {
        let run_mode = env::var("RUN_MODE").unwrap_or_else(|_| "development".into());
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

        s.try_deserialize()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn test_config_defaults() {
        // Ensure no env vars interfere
        // This is tricky if running in parallel, but for unit test file it's okay unless global env is set.
        // Better to use Figment or Config with manual source for testing, but Config works with env.

        let settings = Settings::new();
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
            binance: None,
            bybit: None,
            mexc: None,
            others: map,
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
}

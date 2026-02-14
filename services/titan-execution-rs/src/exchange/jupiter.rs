use crate::config::ExchangeConfig;
use crate::exchange::adapter::{
    ExchangeAdapter, ExchangeError, OrderRequest, OrderResponse, Position,
};
use async_trait::async_trait;
use chrono::Utc;
use reqwest::Client;
use rust_decimal::prelude::*;
use serde_json::Value;
use std::time::Duration;
use tracing::info;

/// Jupiter Aggregator Adapter — #1 DEX on Solana
///
/// Jupiter is a DEX aggregator that finds the best route across
/// Solana DEXes (Orca, Raydium, Lifinity, etc.).
///
/// Uses the Jupiter V6 Quote + Swap REST API:
/// - Mainnet: https://quote-api.jup.ag/v6
/// - Devnet:  https://devnet.helius-rpc.com
///
/// Flow: Quote → Swap API (returns serialized tx) → Deserialize →
///       Sign with ed25519 keypair → Broadcast via Solana RPC sendTransaction.

#[derive(Clone)]
pub struct JupiterAdapter {
    api_url: String,
    rpc_url: String,
    wallet_pubkey: String,
    private_key: String,
    client: Client,
    slippage_bps: u64,
}

impl JupiterAdapter {
    pub fn new(config: Option<&ExchangeConfig>) -> Result<Self, ExchangeError> {
        let config = config.ok_or(ExchangeError::Configuration(
            "Missing Jupiter config".into(),
        ))?;

        let api_url = std::env::var("JUPITER_API_URL")
            .unwrap_or_else(|_| "https://quote-api.jup.ag/v6".to_string());

        let rpc_url = std::env::var("JUPITER_RPC_URL").unwrap_or_else(|_| {
            if config.testnet {
                "https://api.devnet.solana.com".to_string()
            } else {
                "https://api.mainnet-beta.solana.com".to_string()
            }
        });

        let private_key = config.get_secret_key().ok_or(ExchangeError::Configuration(
            "Missing Jupiter/Solana Private Key (base58)".into(),
        ))?;

        let wallet_pubkey = std::env::var("JUPITER_WALLET_PUBKEY").unwrap_or_default();

        // Configurable slippage (default 50 bps = 0.5%)
        let slippage_bps = std::env::var("JUPITER_SLIPPAGE_BPS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(50u64);

        let client = Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|e| ExchangeError::Network(e.to_string()))?;

        Ok(Self {
            api_url,
            rpc_url,
            wallet_pubkey,
            private_key,
            client,
            slippage_bps,
        })
    }

    /// Well-known Solana token mint addresses
    fn resolve_mint(token: &str) -> Result<String, ExchangeError> {
        match token {
            "SOL" | "WSOL" => Ok("So11111111111111111111111111111111111111112".to_string()),
            "USDC" => Ok("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v".to_string()),
            "USDT" => Ok("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB".to_string()),
            "JUP" => Ok("JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN".to_string()),
            "BONK" => Ok("DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263".to_string()),
            "RAY" => Ok("4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R".to_string()),
            "ORCA" => Ok("orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE".to_string()),
            "mSOL" => Ok("mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So".to_string()),
            "jitoSOL" => Ok("J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn".to_string()),
            "WIF" => Ok("EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm".to_string()),
            _ => {
                // Direct mint address
                if token.len() >= 32 {
                    Ok(token.to_string())
                } else {
                    Err(ExchangeError::Configuration(format!(
                        "Unknown Solana token: {}",
                        token
                    )))
                }
            }
        }
    }

    /// Decode base58 private key to 64-byte ed25519 keypair
    fn decode_keypair(base58_key: &str) -> Result<Vec<u8>, ExchangeError> {
        bs58::decode(base58_key)
            .into_vec()
            .map_err(|e| ExchangeError::Configuration(format!("Invalid base58 key: {}", e)))
    }

    /// Sign a serialized Solana transaction and broadcast via RPC
    async fn sign_and_broadcast(
        &self,
        swap_transaction_b64: &str,
    ) -> Result<String, ExchangeError> {
        use base64::Engine;
        let engine = base64::engine::general_purpose::STANDARD;

        // Decode the base64 transaction
        let tx_bytes = engine
            .decode(swap_transaction_b64)
            .map_err(|e| ExchangeError::Api(format!("Base64 decode failed: {}", e)))?;

        // Decode the ed25519 keypair from private key
        let keypair_bytes = Self::decode_keypair(&self.private_key)?;
        if keypair_bytes.len() < 64 {
            return Err(ExchangeError::Configuration(
                "Private key must be 64-byte ed25519 keypair (base58)".into(),
            ));
        }

        // The transaction from Jupiter is a VersionedTransaction.
        // We need to:
        // 1. Deserialize it
        // 2. Sign with our keypair (first signature slot)
        // 3. Re-serialize and broadcast

        // For VersionedTransaction, the message starts after the signature array.
        // We sign the message bytes with ed25519.
        use ed25519_dalek::{Signer, SigningKey};

        let signing_key = SigningKey::from_bytes(
            keypair_bytes[..32]
                .try_into()
                .map_err(|_| ExchangeError::Configuration("Key slice error".into()))?,
        );

        // Parse signature count (compact-u16 encoding)
        let sig_count = tx_bytes[0] as usize;
        let sig_start = 1;
        let msg_start = sig_start + (sig_count * 64);

        if msg_start >= tx_bytes.len() {
            return Err(ExchangeError::Api("Malformed transaction".into()));
        }

        // Sign the message portion
        let message_bytes = &tx_bytes[msg_start..];
        let signature = signing_key.sign(message_bytes);

        // Reconstruct: [sig_count] [our_sig (64)] [remaining sigs] [message]
        let mut signed_tx = Vec::with_capacity(tx_bytes.len());
        signed_tx.push(tx_bytes[0]); // sig count
        signed_tx.extend_from_slice(&signature.to_bytes()); // our signature (first slot)
                                                            // Copy remaining signatures (if any)
        if sig_count > 1 {
            signed_tx.extend_from_slice(&tx_bytes[sig_start + 64..msg_start]);
        }
        signed_tx.extend_from_slice(message_bytes);

        // Base64 encode the signed transaction
        let signed_b64 = engine.encode(&signed_tx);

        // Broadcast via sendTransaction RPC
        let rpc_body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "sendTransaction",
            "params": [
                signed_b64,
                {
                    "encoding": "base64",
                    "skipPreflight": false,
                    "preflightCommitment": "confirmed",
                    "maxRetries": 3
                }
            ]
        });

        let resp = self
            .client
            .post(&self.rpc_url)
            .json(&rpc_body)
            .send()
            .await
            .map_err(|e| ExchangeError::Network(format!("sendTransaction failed: {}", e)))?;

        let resp_text = resp
            .text()
            .await
            .map_err(|e| ExchangeError::Network(e.to_string()))?;

        let resp_json: Value = serde_json::from_str(&resp_text)
            .map_err(|e| ExchangeError::Api(format!("RPC response parse error: {}", e)))?;

        if let Some(error) = resp_json.get("error") {
            return Err(ExchangeError::Api(format!(
                "sendTransaction error: {}",
                error
            )));
        }

        let tx_signature = resp_json
            .get("result")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        if tx_signature.is_empty() {
            return Err(ExchangeError::Api(format!(
                "No signature in response: {}",
                resp_text
            )));
        }

        Ok(tx_signature)
    }
}

#[async_trait]
impl ExchangeAdapter for JupiterAdapter {
    async fn init(&self) -> Result<(), ExchangeError> {
        // Health check via Solana RPC
        let body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getHealth"
        });

        let resp = self
            .client
            .post(&self.rpc_url)
            .json(&body)
            .send()
            .await
            .map_err(|e| ExchangeError::Network(format!("Solana RPC failed: {}", e)))?;

        if !resp.status().is_success() {
            return Err(ExchangeError::Network(
                "Solana RPC health check failed".into(),
            ));
        }

        Ok(())
    }

    async fn place_order(&self, order: OrderRequest) -> Result<OrderResponse, ExchangeError> {
        // Parse symbol: "SOL/USDC" or "mint-mint"
        let (input_mint, output_mint) = if order.symbol.contains('/') {
            let parts: Vec<&str> = order.symbol.split('/').collect();
            if parts.len() != 2 {
                return Err(ExchangeError::OrderRejected("Invalid symbol format".into()));
            }
            (Self::resolve_mint(parts[0])?, Self::resolve_mint(parts[1])?)
        } else if order.symbol.contains('-') {
            let parts: Vec<&str> = order.symbol.split('-').collect();
            (parts[0].to_string(), parts[1].to_string())
        } else {
            return Err(ExchangeError::OrderRejected(
                "Use TOKEN_IN/TOKEN_OUT or MINT-MINT format".into(),
            ));
        };

        // Determine input decimals (SOL=9, USDC/USDT=6)
        let decimals: u32 = if input_mint == "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
            || input_mint == "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
        {
            6
        } else {
            9
        };

        let amount = (order.quantity * Decimal::from(10u64.pow(decimals)))
            .to_u64()
            .unwrap_or(0);

        // Step 1: Quote with slippage
        let quote_url = format!(
            "{}/quote?inputMint={}&outputMint={}&amount={}&slippageBps={}",
            self.api_url, input_mint, output_mint, amount, self.slippage_bps
        );

        info!(
            "🪐 Jupiter quote: {} → {}, amount={}, slippage={}bps",
            input_mint, output_mint, amount, self.slippage_bps
        );

        let quote_resp = self
            .client
            .get(&quote_url)
            .send()
            .await
            .map_err(|e| ExchangeError::Network(format!("Jupiter quote failed: {}", e)))?;

        let quote_text = quote_resp
            .text()
            .await
            .map_err(|e| ExchangeError::Network(e.to_string()))?;

        let quote: Value = serde_json::from_str(&quote_text)
            .map_err(|e| ExchangeError::Api(format!("Quote parse error: {}", e)))?;

        if quote.get("error").is_some() {
            return Err(ExchangeError::Api(format!(
                "Jupiter quote error: {}",
                quote_text
            )));
        }

        let out_amount_str = quote
            .get("outAmount")
            .and_then(|v| v.as_str())
            .unwrap_or("0");

        // Step 2: Get swap transaction
        let swap_body = serde_json::json!({
            "quoteResponse": quote,
            "userPublicKey": self.wallet_pubkey,
            "wrapAndUnwrapSol": true,
            "dynamicComputeUnitLimit": true,
            "prioritizationFeeLamports": "auto"
        });

        let swap_resp = self
            .client
            .post(format!("{}/swap", self.api_url))
            .json(&swap_body)
            .send()
            .await
            .map_err(|e| ExchangeError::Network(format!("Jupiter swap API failed: {}", e)))?;

        let swap_text = swap_resp
            .text()
            .await
            .map_err(|e| ExchangeError::Network(e.to_string()))?;

        let swap_data: Value = serde_json::from_str(&swap_text)
            .map_err(|e| ExchangeError::Api(format!("Swap parse error: {}", e)))?;

        let swap_tx = swap_data
            .get("swapTransaction")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        if swap_tx.is_empty() {
            return Err(ExchangeError::Api(format!(
                "No swap transaction returned: {}",
                swap_text
            )));
        }

        // Step 3: Sign and broadcast the transaction
        let tx_signature = self.sign_and_broadcast(swap_tx).await?;

        info!("✅ Jupiter swap broadcast: {}", tx_signature);

        let output_decimals: u32 = if output_mint == "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
            || output_mint == "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
        {
            6
        } else {
            9
        };

        let executed = Decimal::from_str(out_amount_str).unwrap_or(Decimal::ZERO)
            / Decimal::from(10u64.pow(output_decimals));

        Ok(OrderResponse {
            order_id: tx_signature,
            client_order_id: order.client_order_id,
            symbol: order.symbol,
            status: "CONFIRMED".to_string(),
            executed_qty: executed,
            avg_price: None,
            t_exchange: None,
            t_ack: Utc::now().timestamp_millis(),
            fee: None,
            fee_asset: Some("SOL".to_string()),
        })
    }

    async fn cancel_order(
        &self,
        _symbol: &str,
        _order_id: &str,
    ) -> Result<OrderResponse, ExchangeError> {
        Err(ExchangeError::NotImplemented(
            "Cannot cancel Jupiter swap once broadcast".into(),
        ))
    }

    async fn get_balance(&self, asset: &str) -> Result<Decimal, ExchangeError> {
        if self.wallet_pubkey.is_empty() {
            return Err(ExchangeError::Configuration(
                "JUPITER_WALLET_PUBKEY not set".into(),
            ));
        }

        if asset == "SOL" {
            let body = serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "getBalance",
                "params": [self.wallet_pubkey]
            });

            let resp = self
                .client
                .post(&self.rpc_url)
                .json(&body)
                .send()
                .await
                .map_err(|e| ExchangeError::Network(e.to_string()))?;

            let text = resp
                .text()
                .await
                .map_err(|e| ExchangeError::Network(e.to_string()))?;

            let json: Value =
                serde_json::from_str(&text).map_err(|e| ExchangeError::Api(e.to_string()))?;

            let lamports = json
                .get("result")
                .and_then(|r| r.get("value"))
                .and_then(|v| v.as_u64())
                .unwrap_or(0);

            return Ok(Decimal::from(lamports) / Decimal::from(1_000_000_000u64));
        }

        // SPL token balance via getTokenAccountsByOwner
        let mint = Self::resolve_mint(asset)?;
        let body = serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getTokenAccountsByOwner",
            "params": [
                self.wallet_pubkey,
                { "mint": mint },
                { "encoding": "jsonParsed" }
            ]
        });

        let resp = self
            .client
            .post(&self.rpc_url)
            .json(&body)
            .send()
            .await
            .map_err(|e| ExchangeError::Network(e.to_string()))?;

        let text = resp
            .text()
            .await
            .map_err(|e| ExchangeError::Network(e.to_string()))?;

        let json: Value =
            serde_json::from_str(&text).map_err(|e| ExchangeError::Api(e.to_string()))?;

        // Parse token accounts
        let accounts = json
            .get("result")
            .and_then(|r| r.get("value"))
            .and_then(|v| v.as_array());

        if let Some(accts) = accounts {
            let mut total = Decimal::ZERO;
            for acct in accts {
                let amount_str = acct
                    .get("account")
                    .and_then(|a| a.get("data"))
                    .and_then(|d| d.get("parsed"))
                    .and_then(|p| p.get("info"))
                    .and_then(|i| i.get("tokenAmount"))
                    .and_then(|t| t.get("uiAmountString"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("0");
                total += Decimal::from_str(amount_str).unwrap_or(Decimal::ZERO);
            }
            return Ok(total);
        }

        Ok(Decimal::zero())
    }

    fn name(&self) -> &str {
        "Jupiter (Solana)"
    }

    async fn get_positions(&self) -> Result<Vec<Position>, ExchangeError> {
        Ok(Vec::new())
    }
}

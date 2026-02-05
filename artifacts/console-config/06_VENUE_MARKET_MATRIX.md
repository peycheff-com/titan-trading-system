# Titan Venue & Market Matrix

**Generated**: 2026-02-05  
**Source**: `services/titan-execution-rs/src/exchange/`

## Implemented Venues

| Venue | Adapter File | Markets | Status |
|-------|--------------|---------|--------|
| Binance | `binance.rs` (14KB) | USDTM, COINM | Production |
| Bybit | `bybit.rs` (16KB) | Linear, Inverse | Production |
| MEXC | `mexc.rs` (9KB) | Futures | Production |
| Coinbase | - | Spot | Not Implemented |
| Kraken | - | Spot, Futures | Not Implemented |

---

## Venue Details

### Binance
- **API Base**: `https://fapi.binance.com` (USDTM), `https://dapi.binance.com` (COINM)
- **WebSocket**: `wss://fstream.binance.com`
- **Markets**: USDTM (USDT-margined), COINM (coin-margined)
- **Rate Limits**: 1200 req/min (orders), 2400 req/min (general)

### Bybit
- **API Base**: `https://api.bybit.com`, `https://api-testnet.bybit.com` (testnet)
- **WebSocket**: `wss://stream.bybit.com/v5/public/linear`
- **Markets**: Linear (USDT perpetual), Inverse (coin perpetual)
- **Rate Limits**: 120 req/s (private), 50 req/s (public)

### MEXC
- **API Base**: `https://www.mexc.com`
- **Markets**: Futures (USDT-margined)
- **Rate Limits**: Variable by endpoint

---

## Symbol Mapping

| Canonical | Binance | Bybit | MEXC |
|-----------|---------|-------|------|
| BTC/USDT | BTCUSDT | BTCUSDT | BTC_USDT |
| ETH/USDT | ETHUSDT | ETHUSDT | ETH_USDT |
| SOL/USDT | SOLUSDT | SOLUSDT | SOL_USDT |

---

## Market Types per Venue

| Venue | Spot | USDTM | COINM | Options |
|-------|------|-------|-------|---------|
| Binance | ❌ | ✅ | ✅ | ❌ |
| Bybit | ❌ | ✅ | ✅ | ❌ |
| MEXC | ❌ | ✅ | ❌ | ❌ |
| Coinbase | ❌ | ❌ | ❌ | ❌ |
| Kraken | ❌ | ❌ | ❌ | ❌ |

---

## Venue Configuration Parameters

### Per-Venue Settings
| Parameter | Binance | Bybit | MEXC |
|-----------|---------|-------|------|
| API Key | `BINANCE_API_KEY` | `BYBIT_API_KEY` | `MEXC_API_KEY` |
| API Secret | `BINANCE_API_SECRET` | `BYBIT_API_SECRET` | `MEXC_API_SECRET` |
| Testnet | N/A | `BYBIT_TESTNET` | N/A |
| Rate Limit | N/A | `BYBIT_RATE_LIMIT_RPS` | N/A |
| Max Retries | N/A | `BYBIT_MAX_RETRIES` | N/A |

### Per-Market Settings (Future)
- Max leverage per market
- Max position size per market
- Fee overrides per market
- Funding rate thresholds

---

## Router Configuration

The exchange router (`router.rs`, 16KB) handles:
1. Venue selection based on symbol
2. Order routing with fallback
3. Position aggregation across venues
4. Balance reconciliation

---

## Gaps & Recommendations

1. **Missing Venues**: Coinbase and Kraken adapters not implemented
2. **Spot Markets**: Currently only futures supported
3. **Options**: Not supported
4. **Venue-Scoped Config**: All config is global, need per-venue overrides
5. **Health Monitoring**: No per-venue health dashboard in console

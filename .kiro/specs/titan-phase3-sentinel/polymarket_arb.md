# Polymarket Arbitrage ("Coinflips") Integration Analysis

## 1. Executive Summary

The proposed strategy—high-frequency latency arbitrage between Binance Spot BTC
prices (leading) and Polymarket prediction market odds (lagging)—is **highly
feasible** and fits perfectly as the foundational engine for **Phase 3:
Sentinel**.

**Pros:**

- **Edge:** Exploits distinct latency (30-90s) in decentralized oracle updates.
- **Simplicity:** "Up/Down" 15m windows are binary and predictable.
- **Alignment:** Fits the "Sentinel" mandate of Arbitrage and Market Neutral
  strategies.

**Cons/Challenges:**

- **Infrastructure:** Requires new Web3/EVM capabilities (Polygon network).
- **Speed:** Requires low-latency execution. Node.js is adequate, but we must
  optimize the event loop.

## 2. Architectural Recommendation

We will implement this as the **backend service for Phase 3**, named
`titan-phase3-sentinel`. Currently, Sentinel exists only as a frontend UI. This
service will house the new "Arbitrage Engine" initially focused on the
Polymarket strategy, alongside the planned Basis Trading engines.

**Structure:**

```text
titan-phase3-sentinel/
├── src/
│   ├── engine/
│   │   ├── PolymarketArbEngine.ts  (The Core Loop)
│   │   ├── BinanceFeed.ts          (Leading Indicator)
│   │   ├── PolymarketFeed.ts       (Lagging Target)
│   │   └── ArbEngine.ts            (Abstract Base Class)
│   ├── execution/
│   │   └── PolyClient.ts           (EVM/Gamma API Interaction)
│   ├── discovery/
│   │   └── MarketLookup.ts         (Finds active 15m/Hourly markets)
│   └── ipc/
│       └── FastPathClient.ts       (Reporting to titan-execution)
```

## 3. Implementation Logic (Porting the User's Code)

### A. Market Discovery (`lookup.py` equivalent)

- **Logic:** Query Polymarket's Gamma API for "BTC", filter for "15m" or
  "Hourly" windows, checking `active` status and end times.
- **Titan Port:** A scheduled task in `titan-phase3-sentinel` that updates the
  `targetMarketId` every 15 minutes.

### B. The Engine (`ArbitrageEngine` C++ equivalent)

- **Logic:**
  1. Subscribe to Binance BTC-USDT AggTrade/BookTicker (fastest).
  2. Subscribe to Polymarket Orderbook for the specific `targetMarketId`.
  3. **Trigger:** When Binance moves > `threshold` (e.g., 0.5% in 10s):
  4. **Check:** Does Polymarket implied probability match the move?
  5. **Act:** If No (Lag detected), `limit_buy` the CHEAP side on Polymarket
     immediately.

### C. Execution

- **Polymarket:** Uses the **CTF Exchange** standard.
- **Libs:** `ethers.js` or `viem` for signing.
- **API:** Polymarket CLOB (Central Limit Order Book) API.

## 4. Integration Roadmap

1. **Dependencies:** Add `ethers`, `axios`, `ws`, and `@polymarket/clob-client`
   to the new service.
2. **Scaffolding:** Initialize `titan-phase3-sentinel` workspace.
3. **Core Development:**
   - Port `MarketLookup` logic.
   - Implement dual WebSocket ingestion.
   - Implement "Sniper" logic.
4. **Frontend:** Connect the existing `Sentinel.tsx` to this new backend via
   `titan-execution` proxy or direct websocket.

## 5. Next Steps

- **Approval:** Confirm creation of `titan-phase3-sentinel` workspace.
- **Setup:** Initialize the new package.
- **Development:** Start with Market Discovery and Data Feeds.

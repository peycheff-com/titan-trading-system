# Bybit Testnet Testing Guide

This guide walks you through testing the Titan Execution Service with Bybit testnet before using real money.

## Prerequisites

1. **Create Bybit Testnet Account**
   - Visit: https://testnet.bybit.com
   - Sign up for a free testnet account
   - You'll receive testnet USDT automatically

2. **Generate API Keys**
   - Go to: https://testnet.bybit.com/app/user/api-management
   - Click "Create New Key"
   - Name: `Titan Execution Service`
   - Permissions: Enable "Contract" trading
   - IP Restriction: Optional (recommended for production)
   - Save your API Key and API Secret securely

## Configuration

1. **Copy Environment Template**
   ```bash
   cd services/titan-execution
   cp .env.example .env
   ```

2. **Configure Bybit Testnet**
   Edit `.env` and set:
   ```bash
   # Enable Bybit testnet
   BYBIT_TESTNET=true
   
   # Add your testnet API credentials
   BYBIT_API_KEY=your_testnet_api_key_here
   BYBIT_API_SECRET=your_testnet_api_secret_here
   
   # Use real Bybit adapter (not mock)
   USE_MOCK_BROKER=false
   
   # Optional: Adjust rate limiting
   BYBIT_RATE_LIMIT_RPS=10
   BYBIT_MAX_RETRIES=3
   ```

3. **Configure HMAC Secret**
   Generate a secure HMAC secret:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   
   Add to `.env`:
   ```bash
   HMAC_SECRET=<generated_secret>
   ```

## Testing Steps

### Step 1: Verify Connection

Start the Execution Service:
```bash
npm start
```

Look for these log messages:
```
✅ Initializing BybitAdapter
✅ Testing Bybit connection...
✅ Bybit connection test successful
   - exchange: Bybit
   - testnet: true
   - balance: <your_testnet_balance>
```

If you see errors, check:
- API keys are correct
- API keys have "Contract" trading permission
- Testnet is enabled (`BYBIT_TESTNET=true`)

### Step 2: Test Health Endpoint

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-12-07T...",
  "components": {
    "shadowState": "healthy",
    "replayGuard": "healthy",
    "wsCache": "healthy",
    "l2Validator": "healthy",
    "brokerGateway": "healthy"
  }
}
```

### Step 3: Test Small Order (Manual)

Create a test signal file `test-signal.json`:
```json
{
  "signal_id": "test_btcusdt_long_1733587200000",
  "source": "manual_test",
  "symbol": "BTCUSDT",
  "direction": "LONG",
  "entry_zone": {
    "min": 42000,
    "max": 42100
  },
  "stop_loss": 41500,
  "take_profits": [43000],
  "confidence": 90,
  "leverage": 2,
  "velocity": 0.001,
  "trap_type": "TEST",
  "timestamp": 1733587200000
}
```

Sign and send the signal:
```bash
# Generate signature
node services/titan-execution/sign_webhook.js test-signal.json

# Send webhook (use the signature from above)
curl -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -H "X-Signature: <signature_from_above>" \
  -d @test-signal.json
```

Expected response:
```json
{
  "success": true,
  "signal_id": "test_btcusdt_long_1733587200000",
  "broker_order_id": "...",
  "fill_price": 42050,
  "fill_size": 0.001,
  "status": "FILLED"
}
```

### Step 4: Verify Position on Bybit

1. Go to: https://testnet.bybit.com/trade/usdt/BTCUSDT
2. Check "Positions" tab
3. You should see your test position:
   - Symbol: BTCUSDT
   - Side: Buy (Long)
   - Size: ~0.001 BTC
   - Entry Price: ~42050
   - Stop Loss: 41500
   - Take Profit: 43000

### Step 5: Test Position Closure

Close the position via API:
```bash
curl -X POST http://localhost:3001/api/positions/BTCUSDT/close
```

Expected response:
```json
{
  "success": true,
  "symbol": "BTCUSDT",
  "closed_size": 0.001
}
```

Verify on Bybit that position is closed.

### Step 6: Test Emergency Flatten

1. Open 2-3 small test positions (repeat Step 3 with different symbols)
2. Trigger emergency flatten:
   ```bash
   curl -X POST http://localhost:3001/api/emergency-flatten
   ```

3. Expected response:
   ```json
   {
     "success": true,
     "closed_count": 3,
     "total_positions": 3
   }
   ```

4. Verify all positions are closed on Bybit

## Monitoring

### Check Logs

```bash
# Real-time logs
tail -f logs/execution.log

# Search for errors
grep ERROR logs/execution.log

# Search for rate limit warnings
grep "rate limit" logs/execution.log
```

### Check Shadow State

```bash
curl http://localhost:3001/api/state
```

### Check Database

```bash
# View trades
sqlite3 titan_execution.db "SELECT * FROM trades ORDER BY timestamp DESC LIMIT 10;"

# View positions
sqlite3 titan_execution.db "SELECT * FROM positions;"
```

## Common Issues

### Issue: "API key invalid"
**Solution**: 
- Verify API key is from testnet (not mainnet)
- Check API key has "Contract" trading permission
- Regenerate API key if needed

### Issue: "Rate limit exceeded"
**Solution**:
- Reduce `BYBIT_RATE_LIMIT_RPS` in `.env`
- Increase `BYBIT_MAX_RETRIES` for more retry attempts
- Wait 60 seconds and try again

### Issue: "Insufficient balance"
**Solution**:
- Check testnet balance: https://testnet.bybit.com/user/assets/home
- Request more testnet USDT from faucet
- Reduce position size in test signal

### Issue: "Order rejected: leverage too high"
**Solution**:
- Reduce leverage in test signal (try 2x or 5x)
- Check symbol's max leverage on Bybit
- Verify account is in cross margin mode

## Safety Checklist

Before moving to mainnet:

- [ ] All testnet tests passed
- [ ] Order placement works correctly
- [ ] Stop loss and take profit are set
- [ ] Position closure works
- [ ] Emergency flatten works
- [ ] Shadow State reconciliation works
- [ ] Rate limiting is working (no 429 errors)
- [ ] Logs show no errors
- [ ] Database records are correct
- [ ] Understand all error messages

## Moving to Mainnet

⚠️ **WARNING**: Only proceed after thorough testnet testing!

1. **Update Configuration**
   ```bash
   # Disable testnet
   BYBIT_TESTNET=false
   
   # Use mainnet API keys
   BYBIT_API_KEY=your_mainnet_api_key_here
   BYBIT_API_SECRET=your_mainnet_api_secret_here
   ```

2. **Start with Small Amount**
   - Fund account with $50-100 only
   - Test with 1-2 small positions
   - Monitor closely for 24 hours

3. **Gradual Scale-Up**
   - If successful, increase to $200-500
   - Continue monitoring
   - Only scale up after 7 days of stable operation

## Support

If you encounter issues:
1. Check logs: `logs/execution.log`
2. Check Bybit API status: https://bybit-exchange.github.io/docs/
3. Review this guide
4. Check Bybit testnet documentation: https://testnet.bybit.com/en-US/help-center

## Next Steps

After successful testnet testing:
- [ ] Complete Task 1.14 (Test with real money - small amount)
- [ ] Move to Week 2 tasks (Crash Recovery & Performance)
- [ ] Set up monitoring (Prometheus + Grafana)
- [ ] Configure alerting (Slack/Email)

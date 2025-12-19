# Railway Deployment Guide for Titan Trading System

## Issue Resolution

The deployment failed because Railway tried to deploy the entire monorepo as a single service. We need to deploy each service separately with the correct root directory configuration.

## Solution: Deploy Services Individually

### Method 1: Using Railway Dashboard (Recommended)

1. **Go to Railway Dashboard**: https://railway.com/project/996fbeae-08cf-4dd0-9592-abe16038e754

2. **Delete the current failed service** (if any)

3. **Add titan-execution service**:
   - Click "Add Service" → "GitHub Repo"
   - Select `peycheff-com/titan-trading-system`
   - **IMPORTANT**: Set root directory to `services/titan-execution`
   - Service name: `titan-execution`

4. **Add titan-brain service**:
   - Click "Add Service" → "GitHub Repo" 
   - Select `peycheff-com/titan-trading-system`
   - **IMPORTANT**: Set root directory to `services/titan-brain`
   - Service name: `titan-brain`

### Method 2: Using Railway CLI with Monorepo Support

```bash
# Deploy titan-execution
cd services/titan-execution
railway login
railway init
railway up

# Deploy titan-brain  
cd ../titan-brain
railway init
railway up
```

## Service Configuration

### titan-execution Service

**Root Directory**: `services/titan-execution`

**Environment Variables**:
```bash
NODE_ENV=production
PORT=3002
HMAC_SECRET=titan_production_secret_2024_secure_key_for_webhooks
DATABASE_PATH=/app/data/titan_execution.db
LOG_LEVEL=info
WS_PORT=8081
WS_HEARTBEAT_INTERVAL=30000
WS_RECONNECT_DELAY=5000
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
CORS_ORIGIN=https://titan-console-h1aayir36-peycheff.vercel.app
ALLOWED_IPS=*
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_TIMEOUT=30000
```

**Build Configuration** (already in `services/titan-execution/railway.json`):
```json
{
  "build": {
    "builder": "RAILPACK"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### titan-brain Service

**Root Directory**: `services/titan-brain`

**Environment Variables**:
```bash
NODE_ENV=production
PORT=3100
DB_HOST=aws-1-ap-northeast-2.pooler.supabase.com
DB_PORT=5432
DB_NAME=postgres
DB_USER=postgres.txegecpfpukpvmwdnsgj
DB_PASSWORD=TitanTrading2024!SecureDB
LOG_LEVEL=info
WS_PORT=3101
WS_HEARTBEAT_INTERVAL=30000
MAX_GLOBAL_LEVERAGE=50
MAX_GLOBAL_DRAWDOWN=0.15
EMERGENCY_FLATTEN_THRESHOLD=0.15
PHASE_1_MAX_CAPITAL=5000
PHASE_2_MAX_CAPITAL=50000
PHASE_3_MIN_CAPITAL=50000
```

**Build Configuration** (already in `services/titan-brain/railway.json`):
```json
{
  "build": {
    "builder": "RAILPACK"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/status",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

## Expected Service URLs

After successful deployment:

- **titan-execution**: `https://titan-execution-production.up.railway.app`
- **titan-brain**: `https://titan-brain-production.up.railway.app`

## Update Vercel Environment Variables

Once Railway services are deployed, update the Vercel environment variables:

1. Go to Vercel Dashboard: https://vercel.com/peycheff/titan-console
2. Go to Settings → Environment Variables
3. Update:
   - `NEXT_PUBLIC_EXECUTION_URL` → Railway titan-execution URL
   - `NEXT_PUBLIC_BRAIN_URL` → Railway titan-brain URL
   - `NEXT_PUBLIC_WS_URL` → Railway titan-execution WebSocket URL

## Troubleshooting

### If Railway still can't detect the services:

1. **Check package.json exists** in each service directory
2. **Verify railway.json configuration** in each service directory
3. **Ensure Node.js version** is specified in package.json:
   ```json
   {
     "engines": {
       "node": ">=18.0.0"
     }
   }
   ```

### If build fails:

1. **Check build logs** for specific error messages
2. **Verify all dependencies** are in package.json
3. **Check TypeScript compilation** (for titan-brain)
4. **Verify environment variables** are set correctly

## Manual Deployment Alternative

If Railway continues to have issues, you can deploy to other platforms:

### Render.com
- Similar to Railway but with better monorepo support
- Free tier available
- Automatic GitHub integration

### Fly.io
- Excellent for Node.js applications
- Global edge deployment
- Docker-based deployment

### DigitalOcean App Platform
- Simple deployment process
- Good pricing
- Automatic scaling

## Next Steps

1. **Deploy services individually** using Method 1 above
2. **Test health endpoints** after deployment
3. **Update Vercel environment variables**
4. **Test end-to-end functionality**
5. **Set up monitoring and alerts**

The key is to deploy each service from its own subdirectory rather than trying to deploy the entire monorepo as one service.
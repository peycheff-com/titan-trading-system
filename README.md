# Titan Trading System

**Bio-Mimetic Trading Organism** - A 5-phase algorithmic trading system that
evolves with capital growth.

## 🚀 Live Deployment

- **API**: Railway deployment (auto-deployed from main branch)
- **Database**: Supabase PostgreSQL (Seoul region)

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    TITAN BRAIN (Phase 5)                        │
│  Capital Allocation | Risk Management | Phase Coordination      │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  PHASE 1     │    │  PHASE 2     │    │  PHASE 3     │
│  Scavenger   │    │  Hunter      │    │  Sentinel    │
│  Trap System │    │  Holographic │    │  Basis Arb   │
└──────────────┘    └──────────────┘    └──────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 TITAN EXECUTION (Microservice)                  │
│  Webhook Receiver | Order Execution | Position Management       │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  AI QUANT    │    │  CONSOLE     │    │  SHARED      │
│  Phase 4     │    │  Web UI      │    │  INFRA       │
│  Gemini AI   │    │  React/Vite  │    │  TypeScript  │
└──────────────┘    └──────────────┘    └──────────────┘
```

## 🎯 Trading Phases

| Phase | Name      | Capital Range | Strategy                       | Leverage |
| ----- | --------- | ------------- | ------------------------------ | -------- |
| 1     | Scavenger | $200 - $5K    | Predestination trap system     | 15-20x   |
| 2     | Hunter    | $2.5K - $50K  | Holographic market structure   | 3-5x     |
| 3     | Sentinel  | $50K+         | Market-neutral basis arbitrage | 1-3x     |
| 4     | AI Quant  | N/A           | Gemini AI parameter optimizer  | N/A      |
| 5     | Brain     | All           | Master orchestrator            | N/A      |

### Supporting Services

| Service | Description | Technology |
| ------- | ----------- | ---------- |
| Titan Execution | Order execution microservice | JavaScript + Fastify |
| Titan Console | Web monitoring dashboard | React + Vite + Tailwind |
| Shared Infrastructure | Common services | TypeScript |

## 🛠 Technology Stack

- **Backend**: Node.js 18+, TypeScript, Fastify

- **Database**: Supabase PostgreSQL
- **Deployment**: Railway (backend)
- **Monitoring**: Prometheus metrics, WebSocket status
- **Security**: HMAC authentication, rate limiting, input validation

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL (or use Supabase)
- Redis (optional, for caching)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/peycheff-com/titan-trading-system.git
   cd titan-trading-system
   ```

2. **Install dependencies**
   ```bash
   # Install dependencies for all services
   cd services/titan-execution && npm install && cd ../..
   cd services/titan-brain && npm install && cd ../..
   ```

3. **Configure environment variables**
   ```bash
   # Copy example environment files
   cp services/titan-execution/.env.example services/titan-execution/.env
   cp services/titan-brain/.env.example services/titan-brain/.env


   # Edit the files with your configuration
   ```

4. **Start the services**
   ```bash
   # Start all services
   ./start-titan.sh

   # Or start individually
   cd services/titan-execution && npm run dev &
   cd services/titan-brain && npm run dev &
   ```

5. **Access the dashboard**
   - API available at http://localhost:3002
   - Brain API at http://localhost:3100

## 🔧 Configuration

### Environment Variables

#### Titan Execution Service

```bash
NODE_ENV=production
PORT=3002
HMAC_SECRET=your_webhook_secret
DATABASE_PATH=/app/data/titan_execution.db
BYBIT_API_KEY=your_bybit_key
BYBIT_API_SECRET=your_bybit_secret
```

#### Titan Brain Service

```bash
NODE_ENV=production
PORT=3100
DB_HOST=your_postgres_host
DB_USER=your_postgres_user
DB_PASSWORD=your_postgres_password
DB_NAME=your_postgres_database
```

## 📈 Trading Features

### Phase 1 - Scavenger

- **Strategy**: Predestination trap system
- **Targets**: Liquidation clusters, funding squeezes, basis arbitrage
- **Risk**: 2% per trade, 7% daily drawdown limit
- **Execution**: Market/Aggressive Limit orders on Bybit

### Phase 2 - Hunter

- **Strategy**: Holographic market structure
- **Targets**: Multi-timeframe fractal analysis, POI detection
- **Risk**: 1.5% per trade, 5% daily drawdown limit
- **Execution**: Post-Only Limit orders for maker rebates

### Phase 3 - Sentinel

- **Strategy**: Market-neutral basis arbitrage
- **Targets**: Delta-neutral hedging, funding rate exploitation
- **Risk**: 0.5% per trade, 3% daily drawdown limit
- **Execution**: Systematic position sizing

## 🔒 Security Features

- **HMAC Authentication**: Webhook signature verification
- **Rate Limiting**: 100 requests/minute per IP
- **Input Validation**: All inputs sanitized and validated
- **HTTPS**: SSL/TLS encryption in production
- **API Key Encryption**: Secure credential storage
- **Circuit Breakers**: Automatic risk management

## 📊 Monitoring

- **Health Checks**: `/health` endpoint for all services
- **Metrics**: Prometheus metrics at `/metrics`
- **WebSocket Status**: Real-time connection monitoring
- **Logging**: Structured JSON logging with correlation IDs
- **Alerts**: Automated notifications for system events

## 🚀 Deployment

### Automatic Deployment

This repository is configured for automatic deployment:

- **Backend**: Railway (connected to main branch)
- **Database**: Supabase (managed PostgreSQL)

### Manual Deployment

#### Deploy to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway up
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run integration tests
npm run test:integration

# Run property-based tests
npm run test:property
```

## 📚 Documentation

- [API Documentation](./docs/api/)
- [Architecture Guide](./docs/architecture/)
- [Deployment Guide](./DEPLOYMENT_GUIDE.md)
- [Trading Strategies](./docs/strategies/)
- [Risk Management](./docs/risk-management/)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is proprietary software. All rights reserved.

## ⚠️ Disclaimer

This software is for educational and research purposes only. Trading
cryptocurrencies involves substantial risk of loss. Past performance does not
guarantee future results. Use at your own risk.

## 🆘 Support

- **Issues**:
  [GitHub Issues](https://github.com/peycheff-com/titan-trading-system/issues)
- **Discussions**:
  [GitHub Discussions](https://github.com/peycheff-com/titan-trading-system/discussions)
- **Email**: support@peycheff.com

---

**Built with ❤️ by the Titan Team**

# Local Development

## Prerequisites
- Docker & Docker Compose
- Node.js v22
- Rust (latest stable)

## Getting Started
1. **Clone the repo.**
2. **Start dependencies:**
   ```bash
   docker compose up -d nats postgres redis
   ```
3. **Run the brain:**
   ```bash
   npm run start:brain
   ```

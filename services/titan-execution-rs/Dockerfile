# Builder stage
FROM rust:1.75-bookworm as builder

WORKDIR /usr/src/app
COPY . .

# Build the application
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

WORKDIR /app

# Install OpenSSL (required by async-nats/tokio-postgres)
RUN apt-get update && apt-get install -y libssl3 ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/src/app/target/release/titan-execution-rs /app/titan-execution-rs

CMD ["./titan-execution-rs"]

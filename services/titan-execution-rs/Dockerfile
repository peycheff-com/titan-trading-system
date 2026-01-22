# Builder stage
FROM rust:1.85-bookworm as builder

WORKDIR /usr/src/app

# Copy only the Rust service source files
COPY services/titan-execution-rs/Cargo.toml ./
COPY services/titan-execution-rs/Cargo.lock ./
COPY services/titan-execution-rs/src ./src

# Build the application
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

WORKDIR /app

# Install OpenSSL (required by async-nats/tokio-postgres) and curl (for healthchecks)
RUN apt-get update && apt-get install -y libssl3 ca-certificates curl && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -g 1001 titan && \
    useradd -u 1001 -g titan -m -s /bin/bash titan

# Copy binary with ownership
COPY --chown=titan:titan --from=builder /usr/src/app/target/release/titan-execution-rs /app/titan-execution-rs

# Switch to non-root user
USER titan

CMD ["./titan-execution-rs"]

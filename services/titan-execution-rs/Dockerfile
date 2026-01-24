# Builder Stage
FROM rust:1.77-slim-bookworm as builder

WORKDIR /usr/src/app

# Install build dependencies (OpenSSL, Protobuf for OTel/gRPC)
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    protobuf-compiler \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests
COPY Cargo.toml Cargo.lock ./

# Create dummy main to cache dependencies
RUN mkdir src && \
    echo "fn main() {println!(\"if you see this, the build broke\")}" > src/main.rs && \
    echo "fn main() {println!(\"if you see this, the build broke\")}" > src/lib.rs

# Build dependencies only (both binary and lib targets)
RUN cargo build --release --lib
RUN cargo build --release --bin titan-execution-rs

# Remove dummy source
RUN rm -rf src

# Copy actual source code
COPY . .

# Touch main files to force rebuild of the app itself
RUN touch src/main.rs src/lib.rs

# Build the release binary
RUN cargo build --release --bin titan-execution-rs

# Runtime Stage
FROM debian:bookworm-slim

# Install runtime dependencies (SSL, CA Certs)
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create non-root user
RUN groupadd -g 1001 titan && \
    useradd -u 1001 -g titan -m -s /bin/bash titan

# Copy binary from builder
COPY --chown=titan:titan --from=builder /usr/src/app/target/release/titan-execution-rs /app/titan-execution-rs

# Switch to non-root user
USER titan

# Expose API/Metrics port
EXPOSE 3002

# Run
CMD ["./titan-execution-rs"]

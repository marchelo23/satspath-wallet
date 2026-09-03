# Multi-stage build — expects build context = repo root
# Railway: set Root Directory = blank (root), Dockerfile Path = Dockerfile

FROM rust:1.80-slim-bookworm AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libssl-dev build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build

# Copy workspace manifests first (layer cache)
COPY satspath/Cargo.toml satspath/Cargo.lock ./

# Copy all crates source
COPY satspath/crates ./crates

# Build release binary
RUN cargo build --release -p satspathd

# ──────────────────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/target/release/satspathd /usr/local/bin/satspathd

RUN mkdir -p /data

# Default env vars (overrideable by Railway Variables)
ENV SATSPATH_HOME=/data
ENV SATSPATHD_BIND=0.0.0.0:9737
ENV SATSPATH_NETWORK=testnet
ENV SATSPATHD_CORS_ORIGIN=*

EXPOSE 9737

ENTRYPOINT ["satspathd"]
CMD ["--no-open"]

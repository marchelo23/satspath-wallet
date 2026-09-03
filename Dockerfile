# Multi-stage Docker build for satspathd (Rust Backend)
FROM rust:1.80-slim-bookworm AS builder

RUN apt-get update && apt-get install -y pkg-config libssl-dev build-essential && rm -rf /var/lib/apt/lists/*

WORKDIR /app/satspath
COPY satspath/Cargo.toml satspath/Cargo.lock ./
COPY satspath/crates ./crates

RUN cargo build --release -p satspathd

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/satspath/target/release/satspathd /usr/local/bin/satspathd

RUN mkdir -p /data
ENV SATSPATH_HOME=/data
ENV SATSPATHD_BIND=0.0.0.0:9737
ENV SATSPATH_NETWORK=testnet

EXPOSE 9737

ENTRYPOINT ["satspathd"]
CMD ["--no-open"]

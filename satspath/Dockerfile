FROM debian:trixie-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY bin/satspathd /usr/local/bin/satspathd
RUN mkdir -p /data
EXPOSE 9737
ENTRYPOINT ["satspathd"]
CMD ["--network", "devnet", "--home", "/data", "--bind", "0.0.0.0:9737", "--no-open"]

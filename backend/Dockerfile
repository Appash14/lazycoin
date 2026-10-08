
FROM debian:bullseye-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y \
    curl build-essential libssl-dev pkg-config
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:$PATH"
RUN curl -sSfL https://release.anza.xyz/stable/install | sh
ENV PATH="/root/.local/share/solana/install/active_release/bin:$PATH"
RUN solana config set --url https://api.devnet.solana.com
WORKDIR /solana-token
CMD ["/bin/bash"]

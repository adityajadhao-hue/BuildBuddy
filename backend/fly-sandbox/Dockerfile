# ─── BuildBuddy Sandbox Base Image ───────────────────────────────────────────
# This image runs on Fly Machines (ephemeral VMs with auto_destroy).
# It provides all toolchains needed to clone and test developer repos.
#
# Build & push:
#   fly deploy --app buildbuddy-sandbox --image-label latest --dockerfile ./Dockerfile
# Or manually:
#   docker build -t registry.fly.io/buildbuddy-sandbox:latest .
#   fly auth docker
#   docker push registry.fly.io/buildbuddy-sandbox:latest

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV HOME=/root

# ─── System packages ─────────────────────────────────────────────────────────

RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    jq \
    build-essential \
    ca-certificates \
    gnupg \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# ─── Node.js 20 (via NodeSource) ────────────────────────────────────────────

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm yarn \
    && rm -rf /var/lib/apt/lists/*

# ─── Rust (via rustup) ──────────────────────────────────────────────────────

RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
ENV PATH="/root/.cargo/bin:${PATH}"

# ─── Go 1.21 ────────────────────────────────────────────────────────────────

RUN wget -q https://go.dev/dl/go1.21.6.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go1.21.6.linux-amd64.tar.gz \
    && rm go1.21.6.linux-amd64.tar.gz
ENV PATH="/usr/local/go/bin:${PATH}"
ENV GOPATH="/root/go"
ENV PATH="${GOPATH}/bin:${PATH}"

# ─── Foundry ────────────────────────────────────────────────────────────────

RUN curl -L https://foundry.paradigm.xyz | bash \
    && /root/.foundry/bin/foundryup
ENV PATH="/root/.foundry/bin:${PATH}"

# ─── Python test tools ───────────────────────────────────────────────────────

RUN pip3 install --no-cache-dir pytest pytest-cov

# ─── Global Node test tools ──────────────────────────────────────────────────

RUN npm install -g jest vitest

# ─── Copy entrypoint ─────────────────────────────────────────────────────────

COPY entrypoint.sh /usr/local/bin/buildbuddy-entrypoint.sh
RUN chmod +x /usr/local/bin/buildbuddy-entrypoint.sh

# ─── Resource limits ─────────────────────────────────────────────────────────

# Soft limits — prevents runaway processes
RUN echo '* soft nproc 512' >> /etc/security/limits.conf \
    && echo '* soft nofile 4096' >> /etc/security/limits.conf

# ─── Working directory ───────────────────────────────────────────────────────

WORKDIR /workspace

ENTRYPOINT ["/usr/local/bin/buildbuddy-entrypoint.sh"]

FROM docker.io/cloudflare/sandbox:0.12.3

ARG NODE_VERSION=24.13.1
ARG TARGETARCH

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential ca-certificates curl git jq openssh-client python3 python3-pip ripgrep unzip xz-utils \
    && case "${TARGETARCH}" in \
         amd64) NODE_ARCH=x64 ;; \
         arm64) NODE_ARCH=arm64 ;; \
         *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
       esac \
    && curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
    && tar -xJf "node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -C /usr/local --strip-components=1 \
    && rm "node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
    && npm install --global \
         @anthropic-ai/claude-code@2.1.211 \
         @openai/codex@0.144.5 \
         t3@0.0.28 \
    && npm cache clean --force \
    && rm -rf /var/lib/apt/lists/*

ENV HOME=/workspace/home \
    T3CODE_HOME=/workspace/t3

RUN mkdir -p /workspace/home /workspace/repos /workspace/t3

WORKDIR /workspace/repos

EXPOSE 3773

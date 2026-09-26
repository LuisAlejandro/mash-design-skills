# Local OpenDesign image: official daemon + Linux agent CLIs.
# Do not vendor OpenDesign source; wrap the published image.
ARG OPEN_DESIGN_IMAGE=ghcr.io/nexu-io/od:0.17.0

FROM debian:bookworm-slim AS glibc
ARG TARGETARCH
RUN apt-get update \
    && apt-get install -y --no-install-recommends libstdc++6 zlib1g \
    && rm -rf /var/lib/apt/lists/*
COPY copy-glibc.sh /tmp/copy-glibc.sh
RUN chmod +x /tmp/copy-glibc.sh && TARGETARCH="${TARGETARCH}" /tmp/copy-glibc.sh

FROM ${OPEN_DESIGN_IMAGE}

USER root

RUN apk add --no-cache curl bash git tar unzip ca-certificates libstdc++ \
    && mkdir -p /home/open-design \
    && chown 1001:1001 /home/open-design

# Copy Debian glibc after apk so gcompat/libc6-compat cannot replace ld-linux.
COPY --from=glibc /out/lib/ /lib/
COPY --from=glibc /out/usr/lib/ /usr/lib/
COPY --from=glibc /out/lib64/ /lib64/

# CLIs go to /usr/local/bin and /opt. HOME/.local/bin is not reliable at
# runtime: Compose overlays /home/open-design with open_design_home.
ENV HOME=/home/open-design \
    PATH="/usr/local/bin:/home/open-design/.local/bin:${PATH}"

ARG CURSOR_AGENT_VERSION=2026.09.23-86fc751
ARG CLAUDE_CODE_VERSION=2.1.283
ARG CODEX_VERSION=0.157.0
ARG OPENCODE_VERSION=1.18.32
ARG PI_VERSION=0.87.1
ENV CURSOR_AGENT_VERSION=${CURSOR_AGENT_VERSION} \
    CLAUDE_CODE_VERSION=${CLAUDE_CODE_VERSION} \
    CODEX_VERSION=${CODEX_VERSION} \
    OPENCODE_VERSION=${OPENCODE_VERSION} \
    PI_VERSION=${PI_VERSION}

COPY install-clis.sh /tmp/install-clis.sh
RUN chmod +x /tmp/install-clis.sh \
    && /tmp/install-clis.sh \
    && rm -f /tmp/install-clis.sh \
    && chown -R 1001:1001 /home/open-design

USER open-design
WORKDIR /app

# Fail the build if the daemon user cannot execute the agent CLIs.
# cursor-agent status used to hang (PATH wrapper overwrote the launcher).
RUN cursor-agent --version \
    && timeout 20 cursor-agent status \
    && claude --version \
    && codex --version \
    && opencode --version \
    && pi --version

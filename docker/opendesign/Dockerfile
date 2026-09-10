# Local OpenDesign image: official daemon + Linux agent CLIs.
# Do not vendor OpenDesign source; wrap the published image.
ARG OPEN_DESIGN_IMAGE=ghcr.io/nexu-io/od:latest

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

ENV HOME=/home/open-design \
    PATH="/usr/local/bin:/home/open-design/.local/bin:${PATH}"

COPY install-clis.sh /tmp/install-clis.sh
RUN chmod +x /tmp/install-clis.sh \
    && /tmp/install-clis.sh \
    && rm -f /tmp/install-clis.sh \
    && chown -R 1001:1001 /home/open-design

USER open-design
WORKDIR /app

# Fail the build if the daemon user cannot execute the agent CLIs.
RUN cursor-agent --version \
    && claude --version \
    && codex --version \
    && opencode --version \
    && pi --version

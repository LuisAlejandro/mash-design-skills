#!/bin/bash
# Pack Debian glibc (and C++ runtime) for the build TARGETARCH.
# Runs in the debian:bookworm-slim stage.
set -euo pipefail

arch="${TARGETARCH:-amd64}"
out=/out
mkdir -p "$out/lib" "$out/usr/lib" "$out/lib64"
touch "$out/lib64/.keep"

if [ "$arch" = "arm64" ]; then
  triple=aarch64-linux-gnu
  cp -a "/lib/${triple}" "$out/lib/"
  mkdir -p "$out/usr/lib/${triple}"
  cp -a /usr/lib/${triple}/libstdc++.so* "$out/usr/lib/${triple}/"
  cp -a /usr/lib/${triple}/libgcc_s.so* "$out/usr/lib/${triple}/"
  if [ -e "/lib/ld-linux-aarch64.so.1" ]; then
    cp -a /lib/ld-linux-aarch64.so.1 "$out/lib/"
  fi
else
  triple=x86_64-linux-gnu
  cp -a "/lib/${triple}" "$out/lib/"
  mkdir -p "$out/usr/lib/${triple}"
  cp -a /usr/lib/${triple}/libstdc++.so* "$out/usr/lib/${triple}/"
  cp -a /usr/lib/${triple}/libgcc_s.so* "$out/usr/lib/${triple}/"
  if [ -e "/lib64/ld-linux-x86-64.so.2" ]; then
    cp -a /lib64/ld-linux-x86-64.so.2 "$out/lib64/"
  fi
fi

# zlib lives in lib or usr/lib depending on the Debian snapshot.
for z in "/lib/${triple}/libz.so"* "/usr/lib/${triple}/libz.so"*; do
  if [ -e "$z" ]; then
    cp -a "$z" "$out/lib/${triple}/" 2>/dev/null || cp -a "$z" "$out/usr/lib/${triple}/"
  fi
done

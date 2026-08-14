#!/usr/bin/env bash
# Prints a strong random value suitable for APP_SECRET.
# Usage: ./scripts/generate_secret.sh
#   or:  make generate-secret
set -euo pipefail

if command -v openssl >/dev/null 2>&1; then
  openssl rand -base64 32
else
  # Fallback for systems without openssl: /dev/urandom, base64-encoded.
  head -c 32 /dev/urandom | base64
fi

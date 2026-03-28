#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "==> Building client..."
cd "$ROOT/client"
npm run build

echo "==> Starting server..."
cd "$ROOT"
node server/index.js

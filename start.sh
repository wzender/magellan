#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "==> Installing server dependencies..."
cd "$ROOT"
npm install

echo "==> Installing client dependencies..."
cd "$ROOT/client"
npm install

echo "==> Building client..."
npm run build

echo "==> Starting server..."
cd "$ROOT"
node server/index.js

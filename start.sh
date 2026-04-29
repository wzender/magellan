#!/usr/bin/env bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Load PORT from .env if present
PORT="${PORT:-5000}"
if [ -f "$ROOT/.env" ]; then
  DOTENV_PORT=$(grep -E '^PORT=' "$ROOT/.env" | cut -d= -f2 | tr -d '[:space:]')
  [ -n "$DOTENV_PORT" ] && PORT="$DOTENV_PORT"
fi

echo "==> Stopping any previous server on port $PORT..."
PIDS=$(lsof -ti tcp:"$PORT" 2>/dev/null || true)
if [ -n "$PIDS" ]; then
  echo "    Killing PIDs: $PIDS"
  echo "$PIDS" | xargs kill -9
  sleep 1
else
  echo "    No process found on port $PORT"
fi

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

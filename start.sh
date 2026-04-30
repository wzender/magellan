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
if [ -d "$ROOT/node_modules/xlsx" ]; then
  echo "    Server dependencies already present (found node_modules/xlsx), skipping install"
else
  if ! npm ci --no-audit --fund=false --prefer-offline; then
    echo ""
    echo "ERROR: Failed to install server dependencies."
    echo "This machine appears to be airgapped and missing cached npm packages (e.g. xlsx)."
    echo "Populate node_modules (or npm cache) from a connected machine, then re-run ./start.sh."
    exit 1
  fi
fi

echo "==> Installing client dependencies..."
cd "$ROOT/client"
if [ -d "$ROOT/client/node_modules/xlsx" ]; then
  echo "    Client dependencies already present (found client/node_modules/xlsx), skipping install"
else
  if ! npm ci --no-audit --fund=false --prefer-offline; then
    echo ""
    echo "ERROR: Failed to install client dependencies."
    echo "This machine appears to be airgapped and missing cached npm packages (e.g. xlsx)."
    echo "Populate client/node_modules (or npm cache) from a connected machine, then re-run ./start.sh."
    exit 1
  fi
fi

echo "==> Building client..."
npm run build

echo "==> Starting server..."
cd "$ROOT"
node server/index.js

#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
node ./migrate.cjs

echo "[entrypoint] Starting RadTempo..."
exec "$@"

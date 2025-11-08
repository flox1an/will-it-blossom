#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_NAME="route96-tests"
COMPOSE_FILE="$SCRIPT_DIR/../servers/compose/route96.yml"

cleanup() {
  docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" down -v --remove-orphans >/dev/null 2>&1 || true
}

trap cleanup EXIT

cleanup
docker compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up

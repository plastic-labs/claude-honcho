#!/usr/bin/env bash
# Smoke-test a staged plugin tree: every bundled entry point must run under
# node from a bare directory (no node_modules on the resolution path), with
# config states that exit before any network call.
set -euo pipefail

STAGE_DIR="${1:?usage: smoke.sh <staged-plugin-dir>}"

# timeout(1) is absent on macOS; bound each invocation where available.
bounded() {
  if command -v timeout >/dev/null 2>&1; then timeout 15 "$@"; else "$@"; fi
}

SMOKE="$(mktemp -d)"
cp -R "$STAGE_DIR/." "$SMOKE"
cd "$SMOKE"

# Hooks + MCP server: disabled config, exits after config load.
export HOME="$(mktemp -d)"
mkdir -p "$HOME/.honcho"
echo '{"apiKey":"smoke","enabled":false}' > "$HOME/.honcho/config.json"

for hook in dist/hooks/*.js; do
  echo "smoke: $hook"
  echo '{"session_id":"smoke","cwd":"/tmp","hook_event_name":"SessionStart","source":"startup"}' \
    | bounded node "$hook"
done

echo "smoke: dist/mcp-server.js"
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}\n' \
  | bounded node dist/mcp-server.js | grep -q '"serverInfo"'

# Backfill needs a config to start; dry-run over an empty transcript dir
# makes no network calls.
echo "smoke: dist/skills/backfill-runner.js"
bounded node dist/skills/backfill-runner.js --dry-run </dev/null >/dev/null

# Setup and status with no config and no key exercise their offline
# not-configured paths (a configured run would validate the connection).
export HOME="$(mktemp -d)"
unset HONCHO_API_KEY

# Setup exits 1 by design when no key is found; assert it reached that
# decision rather than expecting success.
echo "smoke: dist/skills/setup-runner.js"
(bounded node dist/skills/setup-runner.js </dev/null || true) | grep -q "No API key found"
echo "smoke: dist/skills/status-runner.js"
bounded node dist/skills/status-runner.js </dev/null | grep -q "Not configured"

echo "smoke: all entry points OK"

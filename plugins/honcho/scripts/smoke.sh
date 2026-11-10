#!/usr/bin/env bash
# Smoke-test a staged plugin tree: every bundled entry point must run under
# node from a bare directory (no node_modules on the resolution path), with
# config states that exit before any network call. That is how the published
# package runs, so this catches a dependency left out of the bundle. Manifest
# paths and quoting are checked statically by build.ts, and output wording
# belongs to the unit tests, so this only checks that each entry point runs.
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
# (Standalone assignment so a mktemp failure propagates under set -e.)
TMP_HOME="$(mktemp -d)"
export HOME="$TMP_HOME"
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
TMP_HOME="$(mktemp -d)"
export HOME="$TMP_HOME"
unset HONCHO_API_KEY

echo "smoke: dist/skills/pane-runner.js"
bounded node dist/skills/pane-runner.js setup-state </dev/null >/dev/null
echo "smoke: dist/skills/status-runner.js"
bounded node dist/skills/status-runner.js </dev/null >/dev/null

# The MCP server must start without a key and still answer a tool call.
echo "smoke: dist/mcp-server.js (no key)"
{
  printf '%s\n' \
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}' \
    '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_config","arguments":{}}}'
  sleep 1
} | bounded node dist/mcp-server.js 2>/dev/null | grep -q '"id":2'

echo "smoke: all entry points OK"

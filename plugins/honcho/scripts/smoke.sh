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

# Setup exits 1 by design when no key is found; assert it reached that
# decision rather than expecting success.
echo "smoke: dist/skills/setup-runner.js"
(bounded node dist/skills/setup-runner.js </dev/null || true) | grep -q "No API key found"
echo "smoke: dist/skills/status-runner.js"
bounded node dist/skills/status-runner.js </dev/null | grep -q "Not configured"

# The hook payload must survive the entry point's initHook() -> handler hop.
# The checks above all run with the plugin disabled, so they exit before the
# handler ever reads stdin — a bundled entry that loses the payload passes them
# regardless. Here the plugin is enabled and pointed at a closed port, so the
# handler runs its pre-network work (which records session_id) and then fails
# fast on connect. Seeing session_id land in the cache proves the payload
# crossed the hop.
PAYLOAD_HOME="$(mktemp -d)"
mkdir -p "$PAYLOAD_HOME/.honcho"
cat > "$PAYLOAD_HOME/.honcho/config.json" <<'JSON'
{"apiKey":"smoke","peerName":"smoke-peer","workspace":"smoke-ws","baseUrl":"http://127.0.0.1:1","logging":false}
JSON
echo "smoke: dist/hooks/session-start.js sees the hook payload"
HOME="$PAYLOAD_HOME" bounded node dist/hooks/session-start.js >/dev/null 2>&1 <<'JSON' || true
{"session_id":"payload-probe","cwd":"/tmp","hook_event_name":"SessionStart","source":"startup"}
JSON
grep -q "payload-probe" "$PAYLOAD_HOME/.honcho/cache.json" 2>/dev/null || {
  echo "FAIL: bundled session-start did not receive the hook payload (session_id missing from cache)" >&2
  echo "      the entry point's cached stdin is not reaching the handler — see initHook/getCachedStdin" >&2
  exit 1
}

echo "smoke: all entry points OK"

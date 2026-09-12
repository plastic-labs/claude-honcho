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
export HOME="$TMP_HOME" USERPROFILE="$TMP_HOME" # USERPROFILE: node homedir() on Windows
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

# The per-turn hook must actually see the prompt: the stdin payload has to
# survive the initHook() -> getCachedStdin() hand-off across bundle chunks
# (#133 shipped a bundle where it did not, and every other smoke here passed).
# An enabled config with an unreachable endpoint gets past the config gate;
# the hook logs the prompt before its first network call and fails fast on
# connect, so the run stays offline. Exit status is not the signal, the log is.
TMP_HOME="$(mktemp -d)"
export HOME="$TMP_HOME" USERPROFILE="$TMP_HOME" # USERPROFILE: node homedir() on Windows
mkdir -p "$HOME/.honcho"
echo '{"apiKey":"smoke","peerName":"smoke","enabled":true,"endpoint":{"baseUrl":"http://127.0.0.1:9"}}' > "$HOME/.honcho/config.json"
echo "smoke: dist/hooks/user-prompt.js (prompt reaches the handler)"
echo '{"session_id":"smoke","cwd":"/tmp","hook_event_name":"UserPromptSubmit","prompt":"smoke prompt"}' \
  | bounded node dist/hooks/user-prompt.js >/dev/null 2>&1 || true
grep -q "Prompt received" "$HOME/.honcho/activity.log"

# Setup and status with no config and no key exercise their offline
# not-configured paths (a configured run would validate the connection).
TMP_HOME="$(mktemp -d)"
export HOME="$TMP_HOME" USERPROFILE="$TMP_HOME" # USERPROFILE: node homedir() on Windows
unset HONCHO_API_KEY

# Setup exits 1 by design when no key is found; assert it reached that
# decision rather than expecting success.
echo "smoke: dist/skills/setup-runner.js"
(bounded node dist/skills/setup-runner.js </dev/null || true) | grep -q "No API key found"
echo "smoke: dist/skills/status-runner.js"
bounded node dist/skills/status-runner.js </dev/null | grep -q "Not configured"

echo "smoke: all entry points OK"

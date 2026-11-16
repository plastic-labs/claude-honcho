#!/usr/bin/env bash
# Nag users when their installed honcho plugin lags behind the published
# version. Throttled to one network check per 24h. Dep-free; uses curl + sort -V.
set -eu

ROOT="${CLAUDE_PLUGIN_ROOT:-}"
DATA="${CLAUDE_PLUGIN_DATA:-}"

[ -z "$ROOT" ] && exit 0
[ -z "$DATA" ] && exit 0

mkdir -p "$DATA"
STAMP="${DATA}/.version-check"
FLAG="${DATA}/.version-stale"

# Throttle: skip if checked within last 24h.
if [ -f "$STAMP" ]; then
  if find "$STAMP" -mtime -1 -print 2>/dev/null | grep -q .; then
    exit 0
  fi
fi

LOCAL_VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
  "${ROOT}/.claude-plugin/plugin.json" | head -n1)
[ -z "$LOCAL_VERSION" ] && exit 0

REMOTE_JSON=$(curl --max-time 2 -fsSL \
  "https://registry.npmjs.org/@honcho-ai/claude-honcho/latest" \
  2>/dev/null) || exit 0

REMOTE_VERSION=$(printf '%s' "$REMOTE_JSON" \
  | tr -d '\n' \
  | sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
  | head -n1)
[ -z "$REMOTE_VERSION" ] && exit 0

# Touch stamp regardless of outcome so we don't keep hammering the network.
touch "$STAMP"

# If local >= remote, clear any stale flag and exit.
LATEST=$(printf '%s\n%s\n' "$LOCAL_VERSION" "$REMOTE_VERSION" | sort -V | tail -n1)
if [ "$LOCAL_VERSION" = "$LATEST" ]; then
  rm -f "$FLAG"
  exit 0
fi

printf 'honcho plugin: v%s installed, v%s available. To update: run /plugins, search honcho, press Enter, choose "Update now".\n' \
  "$LOCAL_VERSION" "$REMOTE_VERSION" > "$FLAG"
exit 0

#!/usr/bin/env bash
# Install the local plugin source into Claude Code's plugin cache.
# Run from anywhere — paths are absolute.
# After running, restart Claude Code to pick up changes.

set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CACHE_BASE="$HOME/.claude/plugins/cache/honcho/honcho"
INSTALLED_JSON="$HOME/.claude/plugins/installed_plugins.json"

# Read version from package.json
VERSION=$(bun -e "console.log(require('$PLUGIN_DIR/package.json').version)")

# Determine cache target — match installed version if present, else use package version
if [[ -f "$INSTALLED_JSON" ]]; then
  INSTALLED_VERSION=$(bun -e "
    const p = require('$INSTALLED_JSON');
    const entries = p.plugins?.['honcho@honcho'] ?? [];
    console.log(entries[0]?.version ?? '');
  ")
  if [[ -n "$INSTALLED_VERSION" ]]; then
    CACHE_DIR="$CACHE_BASE/$INSTALLED_VERSION"
  else
    CACHE_DIR="$CACHE_BASE/$VERSION"
  fi
else
  CACHE_DIR="$CACHE_BASE/$VERSION"
fi

echo "  plugin source:  $PLUGIN_DIR"
echo "  cache target:   $CACHE_DIR"
echo "  version:        $VERSION"
echo ""

# Ensure deps are installed
if [[ ! -d "$PLUGIN_DIR/node_modules" ]]; then
  echo "  installing dependencies..."
  cd "$PLUGIN_DIR" && bun install --frozen-lockfile
  echo ""
fi

# Sync files to cache (excludes .git, scripts, and dev artifacts)
mkdir -p "$CACHE_DIR"
rsync -a --delete \
  --exclude '.git' \
  --exclude 'scripts' \
  --exclude '.DS_Store' \
  "$PLUGIN_DIR/" "$CACHE_DIR/"

# Update installed_plugins.json if version changed
if [[ -f "$INSTALLED_JSON" && -n "${INSTALLED_VERSION:-}" && "$INSTALLED_VERSION" != "$VERSION" ]]; then
  echo "  updating installed_plugins.json ($INSTALLED_VERSION -> $VERSION)"
  # Rename cache dir to new version
  NEW_CACHE="$CACHE_BASE/$VERSION"
  if [[ "$CACHE_DIR" != "$NEW_CACHE" ]]; then
    mv "$CACHE_DIR" "$NEW_CACHE"
    CACHE_DIR="$NEW_CACHE"
  fi
  # Update version and path in installed_plugins.json
  bun -e "
    const fs = require('fs');
    const p = JSON.parse(fs.readFileSync('$INSTALLED_JSON', 'utf-8'));
    const entry = p.plugins['honcho@honcho']?.[0];
    if (entry) {
      entry.version = '$VERSION';
      entry.installPath = '$CACHE_DIR';
      entry.lastUpdated = new Date().toISOString();
    }
    fs.writeFileSync('$INSTALLED_JSON', JSON.stringify(p, null, 2));
  "
fi

echo ""
echo "  done -- restart Claude Code to load changes"

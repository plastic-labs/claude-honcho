---
description: Import past local Claude Code sessions into Honcho memory (backfill history)
user-invocable: true
---

# Honcho Import

Backfill the user's existing local Claude Code session transcripts into Honcho so
past work becomes apart of Honcho's memory. It uploads real conversation content, so it
always previews first and requires explicit confirmation.

Transcripts live at `~/.claude/projects/<cwd-as-dashes>/<session-uuid>.jsonl`. The
importer reconstructs each conversation, names sessions using the user's configured
`sessionStrategy`, and uploads with the original message timestamps into the user's
configured workspace.

## Prerequisite

Honcho must already be configured (`HONCHO_API_KEY` set or `~/.honcho/config.json`
present). If not, tell the user to run `/honcho:setup` first and stop here.

## Optional arguments

The user may specify scope in natural language; translate it to flags:
- window → `--days N` (default 30)
- a specific workspace → `--workspace NAME` (default: their configured workspace)

## Steps

### 1. Preview (safe — no upload)

Run the importer in dry-run mode and show the user the plan:

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/skills/backfill-runner.js" --dry-run
```

If `CLAUDE_PLUGIN_ROOT` isn't set, the plugin lives here (find the version
directory inside and run the importer from there):

```bash
echo "$HOME/.claude/plugins/cache/honcho/honcho"
```

Report the workspace, session count, and message count. Note that any sessions
already imported are skipped automatically (the importer is idempotent).

### 2. Confirm

Ask the user to confirm before uploading. **Do not upload without an explicit yes**
— this sends real conversation content to Honcho.

### 3. Import

On confirmation, run the real import (add `--days`/`--workspace` if the user asked):

```bash
node "${CLAUDE_PLUGIN_ROOT}/dist/skills/backfill-runner.js" --yes
```

### 4. Report

Tell the user, honestly and without first-run/restart framing:

> Imported <N> message(s) across <M> session(s) into `<workspace>`. Honcho will
> start reasoning over them (no restart needed).

Notes to relay if relevant:
- Idempotent: already-imported transcripts are recorded in
  `~/.honcho/backfill-state.json` and skipped on re-run, so it's safe to run again
  (e.g. with a wider `--days` window) to pull in more history later.
- Sessions are named by the configured `sessionStrategy`, so imported history lines
  up with future live sessions.

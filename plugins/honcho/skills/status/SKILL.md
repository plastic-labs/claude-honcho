---
name: honcho:status
description: Show current Honcho memory status and configuration
user-invocable: true
---

# Honcho Status

Display the current Honcho memory system status, including configuration, session info, connection health, and live API stats.

## What It Shows

1. **Plugin Status** - Whether Honcho memory is enabled or disabled
2. **Configuration** - Peer name, AI peer, workspace, message saving
3. **Current Session** - Session name, strategy, directory
4. **Endpoint** - Production (api.honcho.dev) or local instance
5. **Cache Status** - Instance ID, context age, queued messages
6. **Honcho API** - Live connection health, latency, queue processing status, session count, conclusion/memory count

## Usage

Run `/honcho:status` to see the current state of the Honcho memory system.

## Presentation

After running the script, present a concise status card echoing the runner output. Do NOT add prose commentary — the output speaks for itself. Only add a one-line note if something looks wrong (e.g. auth failed, unreachable, 0 conclusions).

## Implementation

```bash
bun run ${CLAUDE_PLUGIN_ROOT}/src/skills/status-runner.ts
```

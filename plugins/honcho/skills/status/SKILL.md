---
name: honcho:status
description: Show current Honcho memory status and configuration
user-invocable: true
---

# Honcho Status

Display the current Honcho memory system status: connection health, workspace, peers, observation queue, and conclusion count.

## What It Shows

1. **Connection** - Live connection health and latency
2. **Workspace** - Current workspace and endpoint URL
3. **Peers** - User peer and AI peer names
4. **Observing** - Queue processing status (messages observed, active, sessions)
5. **Conclusions** - Total conclusion/memory count for the user peer

## Usage

Run `/honcho:status` to see the current state of the Honcho memory system.

## Presentation

After running the script, present a concise status card echoing the runner output. Do NOT add prose commentary — the output speaks for itself. Only add a one-line note if something looks wrong (e.g. auth failed, unreachable, 0 conclusions).

## Implementation

```bash
bun run ${CLAUDE_PLUGIN_ROOT}/src/skills/status-runner.ts
```

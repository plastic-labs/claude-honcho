---
description: Show current Honcho memory status and configuration
user-invocable: true
---

# Honcho Status

Display the current Honcho memory system status, including configuration, session info, and connection status.

## What It Shows

1. **Plugin Status** - Whether Honcho memory is enabled or disabled
2. **Configuration** - Peer name, Claude peer, workspace, message saving preference
3. **Current Session** - The session name for the current directory
4. **Endpoint** - Whether using SaaS (api.honcho.dev) or local instance
5. **Cache Status** - Current cache state and freshness

## Usage

Run `/honcho-status` to see the current state of the Honcho memory system.

## Implementation

```bash
bun run ${CLAUDE_PLUGIN_ROOT}/src/skills/status-runner.ts
```

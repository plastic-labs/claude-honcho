---
description: Create or connect to a Honcho session for persistent memory
allowed-tools: Bash(honcho:*)
argument-hint: [session-name]
---

# Create/Connect Honcho Session

The user wants to create or connect to a Honcho session for persistent memory.

If no session name is provided, the current directory name will be used.

Session name requested: $ARGUMENTS

## Current Session Info

!`honcho session current 2>/dev/null || echo "No session configured yet"`

## Creating/Connecting Session

!`honcho session new $ARGUMENTS`

## Instructions

After creating/connecting the session:
1. Confirm whether this is a new session or connecting to an existing one
2. Explain that future Claude Code sessions in this directory will use this Honcho session
3. The session will persist across Claude Code restarts until explicitly changed
4. If connecting to existing session, context from previous conversations will be loaded

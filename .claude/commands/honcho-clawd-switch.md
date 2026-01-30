---
description: Switch to a different Honcho session
allowed-tools: Bash(honcho:*)
argument-hint: <session-name>
---

# Switch Honcho Session

The user wants to switch to a different Honcho session.

Target session: $ARGUMENTS

## Current Session

!`honcho session current 2>/dev/null`

## Switching Session

!`honcho session switch $ARGUMENTS`

## Instructions

After switching:
1. Confirm the switch was successful
2. Explain that new Claude Code sessions will use the new Honcho session
3. Note that context from the previous session won't be loaded until the session is switched back

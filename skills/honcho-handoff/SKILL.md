---
description: Generate a research handoff summary of the current session
user-invocable: true
---

# Honcho Handoff

Generate a focused research handoff summary for the current session. This analyzes recent messages to detect stuck patterns, extract key activities, and create an actionable summary for debugging or handing off to another engineer.

## When to Use

- When stuck on a problem and want to document what's been tried
- When handing off work to another person or Claude instance
- When you need a concise summary of recent debugging activity
- Before escalating an issue to get a clear picture of the situation

## What It Includes

1. **Status indicator** - Whether you appear to be stuck and for how long
2. **Context** - Session summary from Honcho memory
3. **Errors encountered** - Detected error patterns from the conversation
4. **What's been tried** - Recent tool actions and approaches
5. **Focus areas** - Repeatedly mentioned topics (indicates stuck points)
6. **Git context** - Recent commits and uncommitted changes

## Usage

Simply invoke `/honcho-handoff` and the summary will be generated and copied to your clipboard.

## Implementation

```bash
bun run ${CLAUDE_PLUGIN_ROOT}/src/skills/handoff-runner.ts
```

---
description: Load the Honcho session briefing (session summary + peer card) via a visible tool call
user-invocable: true
---

# Honcho Briefing

Load the stored session summary and the user's peer card through the `get_briefing` MCP tool.

## Usage

Run `/honcho:briefing` at any point to load (or reload) the briefing. The session-start directives may also ask for this automatically on the first turn when the `briefing` component is configured.

## Implementation

Call the `get_briefing` tool from the honcho MCP server (`mcp__plugin_honcho_honcho__get_briefing`). No arguments.

## Presentation

The payload is already visible in the expandable tool row — do NOT repeat it back. After the call, reply with at most two sentences: confirm the briefing is loaded and name where the session left off (from the summary). If the tool reports no briefing available, say so in one line.

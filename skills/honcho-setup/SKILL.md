---
description: Configure Honcho memory (API key, workspace, peer name)
user-invocable: true
---

# Honcho Setup

Configure the Honcho memory system with your API key, workspace, and peer identity. This is required before Honcho memory can work.

## Requirements

You'll need:
1. **Honcho API Key** - Get one from https://app.honcho.dev
2. **Workspace name** - A name to group your sessions (e.g., "claude_code")
3. **Peer name** - Your identity in the system (e.g., your name)

## What It Configures

- API key for authenticating with Honcho
- Workspace for organizing sessions
- Your peer name (how Honcho identifies you)
- Claude's peer name (how Honcho identifies the AI)
- Message saving preferences
- Endpoint (SaaS or local Honcho instance)

## Configuration Location

Settings are saved to `~/.honcho/config.json`

## Usage

Run `/honcho-setup` and follow the interactive prompts to configure Honcho.

For local development with a self-hosted Honcho instance, enter "local" when prompted for the API key.

## Environment Variables (Alternative)

Instead of running setup, you can set these environment variables:
- `HONCHO_API_KEY` - Your Honcho API key
- `HONCHO_WORKSPACE` - Workspace name (default: claude_code)
- `HONCHO_PEER_NAME` - Your peer name
- `HONCHO_ENDPOINT` - API endpoint (default: https://api.honcho.dev/v3)

## Implementation

```bash
bun run ${CLAUDE_PLUGIN_ROOT}/src/skills/setup-runner.ts
```

# Contributing to Honcho Plugins for Claude Code

Thanks for your interest in contributing! This guide covers the development setup and conventions for both plugins in this repo.

## Project Structure

```
claude-honcho/
├── .claude-plugin/
│   └── marketplace.json    # Claude Code marketplace manifest
├── plugins/
│   ├── honcho/             # Persistent memory plugin
│   │   ├── src/            # TypeScript source
│   │   ├── hooks/          # Claude Code hook scripts (compiled)
│   │   ├── skills/         # Plugin skills (setup, config, status, interview)
│   │   ├── mcp-server.ts   # MCP server entry point
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── honcho-dev/         # SDK skills plugin
│       ├── skills/         # Skills for building with Honcho SDK
│       └── .claude-plugin/
├── assets/
├── CHANGELOG.md
└── README.md
```

## Development Setup

### Prerequisites

- [Bun](https://bun.sh) (the honcho plugin uses Bun as its runtime)
- A Honcho API key from [app.honcho.dev](https://app.honcho.dev)

### Clone and Install

```bash
git clone https://github.com/plastic-labs/claude-honcho.git
cd claude-honcho/plugins/honcho
bun install
```

### Build

```bash
bun run build
```

This compiles TypeScript from `src/` into the hook scripts and MCP server.

## Working on the `honcho` Plugin

The `honcho` plugin provides persistent memory for Claude Code via hooks and an MCP server.

### Key Files

- `src/hooks/` -- Hook implementations (session-start, session-end, user-prompt, pre-compact, post-tool-use, stop)
- `src/mcp/server.ts` -- MCP server for memory tools
- `src/config.ts` -- Configuration management
- `src/cache.ts` -- Local caching layer
- `skills/` -- Plugin skills (setup wizard, status check, etc.)

### Local Testing

1. Build the plugin:
   ```bash
   cd plugins/honcho
   bun run build
   ```

2. Install locally in Claude Code:
   ```bash
   # From the repo root
   /plugin install --local ./plugins/honcho
   ```

3. Restart Claude Code to pick up changes.

### Making Changes

- **TypeScript source** lives in `src/`. Always build after changes.
- **Hooks** are Claude Code lifecycle hooks -- they fire on session start/end, user prompts, compaction, etc.
- **Skills** are markdown-based instructions in `skills/`. These don't need compilation.
- **MCP server** provides tools that Claude can call for memory search, context retrieval, etc.

## Working on the `honcho-dev` Plugin

The `honcho-dev` plugin is skills-only (no compiled code). It provides guidance for building apps with the Honcho SDK.

### Key Files

- `skills/integrate/` -- Skill for integrating Honcho into applications
- `skills/migrate-py/` and `skills/migrate-ts/` -- Migration guides for Python and TypeScript

To contribute new skills, create a directory under `plugins/honcho-dev/skills/` with a `SKILL.md` file.

## Code Style

- TypeScript with ESM modules
- Bun as the runtime (not Node.js)
- Prefer async/await over callbacks
- Keep hook scripts focused -- each hook should do one thing

## Submitting Changes

1. Fork the repo and create a feature branch
2. Make your changes and test locally with Claude Code
3. Update `CHANGELOG.md` if your change is user-facing
4. Open a pull request with a clear description of what and why

## Questions?

Open an issue at [github.com/plastic-labs/claude-honcho](https://github.com/plastic-labs/claude-honcho/issues).

#!/usr/bin/env bun
/**
 * Standalone entry point for post-tool-use hook.
 * Can be executed directly by Claude Code plugin system or via `bun run`.
 */
import { handlePostToolUse } from "../src/hooks/post-tool-use.js";

await handlePostToolUse();

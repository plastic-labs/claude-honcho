#!/usr/bin/env bun
/**
 * Standalone entry point for user-prompt hook.
 * Can be executed directly by Claude Code plugin system or via `bun run`.
 */
import { handleUserPrompt } from "../src/hooks/user-prompt.js";

await handleUserPrompt();

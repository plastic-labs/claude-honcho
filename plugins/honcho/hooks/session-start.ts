#!/usr/bin/env bun
/**
 * Standalone entry point for session-start hook.
 * Can be executed directly by Claude Code plugin system or via `bun run`.
 */
import { handleSessionStart } from "../src/hooks/session-start.js";

await handleSessionStart();

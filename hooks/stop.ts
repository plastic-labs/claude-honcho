#!/usr/bin/env bun
/**
 * Standalone entry point for stop hook.
 * Can be executed directly by Claude Code plugin system or via `bun run`.
 */
import { handleStop } from "../src/hooks/stop.js";

await handleStop();

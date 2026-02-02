#!/usr/bin/env bun
/**
 * Standalone entry point for pre-compact hook.
 * Can be executed directly by Claude Code plugin system or via `bun run`.
 */
import { handlePreCompact } from "../src/hooks/pre-compact.js";

await handlePreCompact();

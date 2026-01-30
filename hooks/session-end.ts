#!/usr/bin/env bun
/**
 * Standalone entry point for session-end hook.
 * Can be executed directly by Claude Code plugin system or via `bun run`.
 */
import { handleSessionEnd } from "../src/hooks/session-end.js";

await handleSessionEnd();

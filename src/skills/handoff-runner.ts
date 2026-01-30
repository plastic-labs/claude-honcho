#!/usr/bin/env bun
/**
 * Runner script for the honcho-handoff skill.
 * Generates a research handoff summary.
 */
import { handleHandoff } from "./handoff.js";

await handleHandoff(process.argv.slice(2));

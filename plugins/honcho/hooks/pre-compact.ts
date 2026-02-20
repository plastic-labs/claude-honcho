#!/usr/bin/env bun
import { initHook } from "../src/config.js";
import { handlePreCompact } from "../src/hooks/pre-compact.js";

await initHook();
await handlePreCompact();

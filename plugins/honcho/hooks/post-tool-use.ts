#!/usr/bin/env bun
import { initHook } from "../src/config.js";
import { handlePostToolUse } from "../src/hooks/post-tool-use.js";

await initHook();
await handlePostToolUse();

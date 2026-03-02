#!/usr/bin/env bun
import { initHook } from "../src/config.js";
import { handleUserPrompt } from "../src/hooks/user-prompt.js";

await initHook();
await handleUserPrompt();

#!/usr/bin/env bun
import { initHook } from "../src/config.js";
import { handleSessionStart } from "../src/hooks/session-start.js";

await initHook();
await handleSessionStart();

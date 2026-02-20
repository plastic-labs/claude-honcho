#!/usr/bin/env bun
import { initHook } from "../src/config.js";
import { handleStop } from "../src/hooks/stop.js";

await initHook();
await handleStop();

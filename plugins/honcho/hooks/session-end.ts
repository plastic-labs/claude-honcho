#!/usr/bin/env bun
import { initHook } from "../src/config.js";
import { handleSessionEnd } from "../src/hooks/session-end.js";

await initHook();
await handleSessionEnd();

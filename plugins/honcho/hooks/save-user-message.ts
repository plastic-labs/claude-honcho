#!/usr/bin/env bun
import { initHook } from "../src/config.js";
import { handleSaveUserMessage } from "../src/hooks/save-user-message.js";

await initHook();
await handleSaveUserMessage();

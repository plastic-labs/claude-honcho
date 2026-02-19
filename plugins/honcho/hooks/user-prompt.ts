#!/usr/bin/env bun
import { detectHost, setDetectedHost, cacheStdin } from "../src/config.js";
import { handleUserPrompt } from "../src/hooks/user-prompt.js";

const stdinText = await Bun.stdin.text();
cacheStdin(stdinText);
const input = JSON.parse(stdinText || "{}");
if (input.cursor_version) process.exit(0);
setDetectedHost(detectHost(input));
await handleUserPrompt();

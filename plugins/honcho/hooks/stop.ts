#!/usr/bin/env bun
import { detectHost, setDetectedHost, cacheStdin } from "../src/config.js";
import { handleStop } from "../src/hooks/stop.js";

const stdinText = await Bun.stdin.text();
cacheStdin(stdinText);
const input = JSON.parse(stdinText || "{}");
if (input.cursor_version) process.exit(0);
setDetectedHost(detectHost(input));
await handleStop();

#!/usr/bin/env bun
import { detectHost, setDetectedHost, cacheStdin } from "../src/config.js";
import { handleSessionStart } from "../src/hooks/session-start.js";

const stdinText = await Bun.stdin.text();
cacheStdin(stdinText);
const input = JSON.parse(stdinText || "{}");
setDetectedHost(detectHost(input));
await handleSessionStart();

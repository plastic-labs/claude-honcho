#!/usr/bin/env bun
import { detectHost, setDetectedHost, cacheStdin } from "../src/config.js";
import { handleSessionEnd } from "../src/hooks/session-end.js";

const stdinText = await Bun.stdin.text();
cacheStdin(stdinText);
const input = JSON.parse(stdinText || "{}");
setDetectedHost(detectHost(input));
await handleSessionEnd();

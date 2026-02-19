#!/usr/bin/env bun
import { detectHost, setDetectedHost, cacheStdin } from "../src/config.js";
import { handlePostToolUse } from "../src/hooks/post-tool-use.js";

const stdinText = await Bun.stdin.text();
cacheStdin(stdinText);
const input = JSON.parse(stdinText || "{}");
setDetectedHost(detectHost(input));
await handlePostToolUse();

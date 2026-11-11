#!/usr/bin/env bun
import { run } from "./pane.js";

await run(process.argv[2], process.argv[3]);

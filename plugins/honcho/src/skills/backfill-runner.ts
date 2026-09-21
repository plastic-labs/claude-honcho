#!/usr/bin/env bun
import { run } from "./backfill.js";
import * as s from "../styles.js";

run().catch((err) => {
  console.log(s.error(`Backfill failed: ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});

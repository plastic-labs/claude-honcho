// e2e probe (not a test file — bun:test ignores it). Spawned by honcho-home-e2e.test.ts
// in a child process with a controlled HOME + HONCHO_HOME env, so the module-load-time
// state-dir constants are captured fresh. It performs real writes and reports the
// resolved state-dir paths as JSON on the last stdout line.
import { join } from "path";
import { existsSync } from "fs";
import { getConfigDir, getConfigPath } from "./config.js";
import { getLogPath, logActivity } from "./log.js";
import { getVerboseLogPath } from "./visual.js";
import { setCachedSessionId } from "./cache.js";

// real writes into whatever dir the plugin resolved
setCachedSessionId("/probe/cwd", "honcho-home-probe", "probe-id");
logActivity("cache", "honcho-home-probe", "probe activity line");

const configDir = getConfigDir();
console.log(JSON.stringify({
  configDir,
  configPath: getConfigPath(),
  logPath: getLogPath(),
  verbosePath: getVerboseLogPath(),
  cacheFileWritten: existsSync(join(configDir, "cache.json")),
  logFileWritten: existsSync(getLogPath()),
}));

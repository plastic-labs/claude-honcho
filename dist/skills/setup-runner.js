#!/usr/bin/env bun
// @bun
import {
  configExists,
  getClaudeSettingsDir,
  getClaudeSettingsPath,
  getConfigDir,
  getConfigPath,
  getHonchoClientOptions,
  loadConfig,
  loadConfigFromEnv,
  saveConfig,
  saveRootField,
  setDetectedHost
} from "../chunk-084dpgp3.js";
import {
  require_client,
  require_conclusions,
  require_errors,
  require_message,
  require_pagination,
  require_peer,
  require_session,
  require_session_context,
  require_streaming
} from "../chunk-xdntcesh.js";
import {
  __commonJS,
  __require,
  __toESM
} from "../chunk-gnp95nzg.js";

// node_modules/@honcho-ai/sdk/dist/index.js
var require_dist = __commonJS((exports) => {
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.Summary = exports.SessionSummaries = exports.SessionContext = exports.Session = exports.PeerContext = exports.Peer = exports.Page = exports.Message = exports.DialecticStreamResponse = exports.UnprocessableEntityError = exports.TimeoutError = exports.ServerError = exports.RateLimitError = exports.PermissionDeniedError = exports.NotFoundError = exports.HonchoError = exports.ConnectionError = exports.ConflictError = exports.BadRequestError = exports.AuthenticationError = exports.ConclusionScope = exports.Conclusion = exports.Honcho = undefined;
  var client_1 = require_client();
  Object.defineProperty(exports, "Honcho", { enumerable: true, get: function() {
    return client_1.Honcho;
  } });
  var conclusions_1 = require_conclusions();
  Object.defineProperty(exports, "Conclusion", { enumerable: true, get: function() {
    return conclusions_1.Conclusion;
  } });
  Object.defineProperty(exports, "ConclusionScope", { enumerable: true, get: function() {
    return conclusions_1.ConclusionScope;
  } });
  var errors_1 = require_errors();
  Object.defineProperty(exports, "AuthenticationError", { enumerable: true, get: function() {
    return errors_1.AuthenticationError;
  } });
  Object.defineProperty(exports, "BadRequestError", { enumerable: true, get: function() {
    return errors_1.BadRequestError;
  } });
  Object.defineProperty(exports, "ConflictError", { enumerable: true, get: function() {
    return errors_1.ConflictError;
  } });
  Object.defineProperty(exports, "ConnectionError", { enumerable: true, get: function() {
    return errors_1.ConnectionError;
  } });
  Object.defineProperty(exports, "HonchoError", { enumerable: true, get: function() {
    return errors_1.HonchoError;
  } });
  Object.defineProperty(exports, "NotFoundError", { enumerable: true, get: function() {
    return errors_1.NotFoundError;
  } });
  Object.defineProperty(exports, "PermissionDeniedError", { enumerable: true, get: function() {
    return errors_1.PermissionDeniedError;
  } });
  Object.defineProperty(exports, "RateLimitError", { enumerable: true, get: function() {
    return errors_1.RateLimitError;
  } });
  Object.defineProperty(exports, "ServerError", { enumerable: true, get: function() {
    return errors_1.ServerError;
  } });
  Object.defineProperty(exports, "TimeoutError", { enumerable: true, get: function() {
    return errors_1.TimeoutError;
  } });
  Object.defineProperty(exports, "UnprocessableEntityError", { enumerable: true, get: function() {
    return errors_1.UnprocessableEntityError;
  } });
  var streaming_1 = require_streaming();
  Object.defineProperty(exports, "DialecticStreamResponse", { enumerable: true, get: function() {
    return streaming_1.DialecticStreamResponse;
  } });
  var message_1 = require_message();
  Object.defineProperty(exports, "Message", { enumerable: true, get: function() {
    return message_1.Message;
  } });
  var pagination_1 = require_pagination();
  Object.defineProperty(exports, "Page", { enumerable: true, get: function() {
    return pagination_1.Page;
  } });
  var peer_1 = require_peer();
  Object.defineProperty(exports, "Peer", { enumerable: true, get: function() {
    return peer_1.Peer;
  } });
  Object.defineProperty(exports, "PeerContext", { enumerable: true, get: function() {
    return peer_1.PeerContext;
  } });
  var session_1 = require_session();
  Object.defineProperty(exports, "Session", { enumerable: true, get: function() {
    return session_1.Session;
  } });
  var session_context_1 = require_session_context();
  Object.defineProperty(exports, "SessionContext", { enumerable: true, get: function() {
    return session_context_1.SessionContext;
  } });
  Object.defineProperty(exports, "SessionSummaries", { enumerable: true, get: function() {
    return session_context_1.SessionSummaries;
  } });
  Object.defineProperty(exports, "Summary", { enumerable: true, get: function() {
    return session_context_1.Summary;
  } });
});

// src/skills/setup-runner.ts
var import_sdk = __toESM(require_dist(), 1);

// src/styles.ts
var colors = {
  reset: "\x1B[0m",
  bold: "\x1B[1m",
  dim: "\x1B[2m",
  orange: "\x1B[38;5;208m",
  lightOrange: "\x1B[38;5;214m",
  peach: "\x1B[38;5;215m",
  palePeach: "\x1B[38;5;223m",
  paleBlue: "\x1B[38;5;195m",
  lightBlue: "\x1B[38;5;159m",
  skyBlue: "\x1B[38;5;117m",
  brightBlue: "\x1B[38;5;81m",
  success: "\x1B[38;5;114m",
  error: "\x1B[38;5;203m",
  warn: "\x1B[38;5;214m",
  white: "\x1B[38;5;255m",
  gray: "\x1B[38;5;245m"
};
var symbols = {
  check: String.fromCodePoint(10003),
  cross: String.fromCodePoint(10007),
  dot: String.fromCodePoint(183),
  bullet: String.fromCodePoint(8226),
  arrow: String.fromCodePoint(8594),
  line: String.fromCodePoint(9472),
  corner: String.fromCodePoint(9492),
  pipe: String.fromCodePoint(9474),
  sparkle: String.fromCodePoint(10022)
};
function header(text) {
  const line = symbols.line.repeat(text.length);
  return `${colors.orange}${text}${colors.reset}
${colors.dim}${line}${colors.reset}`;
}
function section(text) {
  return `${colors.lightBlue}${text}${colors.reset}`;
}
function label(text) {
  return `${colors.skyBlue}${text}${colors.reset}`;
}
function dim(text) {
  return `${colors.dim}${text}${colors.reset}`;
}
function success(message) {
  return `${colors.success}${symbols.check}${colors.reset} ${message}`;
}
function warn(message) {
  return `${colors.warn}!${colors.reset} ${message}`;
}
function listItem(text, indent = 0) {
  const padding = "  ".repeat(indent);
  return `${padding}${colors.dim}${symbols.bullet}${colors.reset} ${text}`;
}

// src/skills/setup-runner.ts
import { copyFileSync, chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
function installStatusline() {
  console.log(section("Installing memory statusLine"));
  const src = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "scripts", "honcho-statusline.sh");
  const dest = join(getConfigDir(), "honcho-statusline.sh");
  try {
    if (!existsSync(getConfigDir()))
      mkdirSync(getConfigDir(), { recursive: true });
    copyFileSync(src, dest);
    chmodSync(dest, 493);
    console.log(success(`Renderer installed at ${dest}`));
  } catch (err) {
    console.log(warn(`Could not install renderer: ${err instanceof Error ? err.message : String(err)}`));
    return;
  }
  try {
    const raw = existsSync(getConfigPath()) ? JSON.parse(readFileSync(getConfigPath(), "utf-8")) : {};
    if (raw.statusline === undefined)
      saveRootField("statusline", "on");
  } catch {}
  const settingsPath = getClaudeSettingsPath();
  let settings = {};
  try {
    if (existsSync(settingsPath))
      settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
  } catch {
    console.log(warn(`Could not parse ${settingsPath} \u2014 add the statusLine entry manually:`));
    console.log(dim(`  "statusLine": { "type": "command", "command": "${dest}" }`));
    return;
  }
  const REFRESH = 1;
  const existing = settings.statusLine;
  if (existing?.command === dest) {
    if (existing.refreshInterval === REFRESH) {
      console.log(dim("statusLine already points at the honcho renderer"));
      return;
    }
    settings.statusLine = { type: "command", command: dest, refreshInterval: REFRESH };
    try {
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log(success("statusLine refreshInterval enabled \u2014 memory glyph now animates"));
    } catch (err) {
      console.log(warn(`Could not update settings.json: ${err instanceof Error ? err.message : String(err)}`));
    }
    return;
  }
  if (existing) {
    console.log(warn("A different statusLine is already configured \u2014 leaving it untouched."));
    console.log(dim("  To use honcho's instead, set settings.json statusLine.command to:"));
    console.log(dim(`  ${dest}`));
    console.log(dim(`  and add  "refreshInterval": ${REFRESH}  so the glyph animates.`));
    return;
  }
  settings.statusLine = { type: "command", command: dest, refreshInterval: REFRESH };
  try {
    if (!existsSync(getClaudeSettingsDir()))
      mkdirSync(getClaudeSettingsDir(), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log(success("statusLine registered in ~/.claude/settings.json"));
  } catch (err) {
    console.log(warn(`Could not write settings.json: ${err instanceof Error ? err.message : String(err)}`));
    console.log(dim(`  Add manually: "statusLine": { "type": "command", "command": "${dest}" }`));
  }
}
async function setup() {
  setDetectedHost("claude_code");
  console.log("");
  console.log(header("honcho setup"));
  console.log("");
  let apiKey = process.env.HONCHO_API_KEY;
  let keySource = "environment";
  if (!apiKey) {
    try {
      const { readFileSync: readFileSync2 } = await import("fs");
      const configRaw = readFileSync2(getConfigPath(), "utf-8");
      const configData = JSON.parse(configRaw);
      apiKey = configData.apiKey;
      keySource = "config";
    } catch {}
  }
  if (!apiKey) {
    console.log(warn("No API key found (checked env and config)"));
    console.log("");
    console.log("  1. Get a free key at https://app.honcho.dev");
    if (process.platform === "win32") {
      console.log("  2. Set it in PowerShell:");
      console.log(dim('     setx HONCHO_API_KEY "your-key-here"'));
    } else {
      console.log("  2. Add to ~/.zshrc or ~/.bashrc:");
      console.log(dim('     export HONCHO_API_KEY="your-key-here"'));
    }
    console.log("  3. Restart Claude Code and run /honcho:setup");
    process.exit(1);
  }
  console.log(success(`API key found (${keySource})`));
  console.log("");
  console.log(section("Validating connection"));
  const config = loadConfig() || loadConfigFromEnv();
  if (!config) {
    console.log(warn("Failed to build config from environment"));
    process.exit(1);
  }
  try {
    const honcho = new import_sdk.Honcho(getHonchoClientOptions(config));
    await honcho.workspaces();
    console.log(success("Connected to Honcho API"));
    console.log(`  ${label("Workspace")}: ${config.workspace}`);
    console.log(`  ${label("Peer")}:      ${config.peerName}`);
    console.log(`  ${label("AI Peer")}:   ${config.aiPeer}`);
    console.log("");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(warn(`Connection failed: ${msg}`));
    if (msg.includes("401") || msg.includes("auth")) {
      console.log(dim("  API key may be invalid. Get a new one at https://app.honcho.dev"));
    }
    process.exit(1);
  }
  if (!configExists()) {
    console.log(section("Creating config"));
    try {
      const { saveRootField: saveRootField2 } = await import("../chunk-6yybt92z.js");
      saveRootField2("apiKey", config.apiKey);
      saveRootField2("peerName", config.peerName);
      saveConfig({
        apiKey: config.apiKey,
        peerName: config.peerName,
        workspace: config.workspace,
        aiPeer: config.aiPeer,
        saveMessages: true,
        enabled: true,
        logging: true
      });
      console.log(success(`Written to ${getConfigPath()}`));
    } catch (err) {
      console.log(warn(`Failed to write config: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
    console.log("");
  } else {
    console.log(dim(`Config already exists at ${getConfigPath()}`));
    console.log("");
  }
  installStatusline();
  console.log("");
  try {
    const { findTranscripts } = await import("../chunk-wm6hvkcv.js");
    const transcripts = findTranscripts(30);
    if (transcripts.length > 0) {
      console.log(section("Import past sessions (optional)"));
      console.log(listItem(`Found ${transcripts.length} local Claude Code session(s) from the last 30 days.`));
      console.log(dim("  Run /honcho:import whenever you'd like to add your past work to Honcho."));
      console.log("");
    }
  } catch {}
  console.log(success("Setup complete -- Honcho memory is ready"));
  console.log("");
}
setup();

//# debugId=E44FDBA860D5B7D464756E2164756E21
//# sourceMappingURL=setup-runner.js.map

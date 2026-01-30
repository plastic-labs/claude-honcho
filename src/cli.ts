#!/usr/bin/env bun
import { createInterface } from "readline";
import {
  configExists,
  getConfigPath,
  getClaudeSettingsPath,
  loadConfig,
  saveConfig,
  getSessionForPath,
  setSessionForPath,
  getAllSessions,
  removeSessionForPath,
  getEndpointInfo,
  setEndpoint,
  getHonchoClientOptions,
  isPluginEnabled,
  setPluginEnabled,
  type HonchoCLAUDEConfig,
  type HonchoEnvironment,
} from "./config.js";
import { Honcho } from "@honcho-ai/sdk";
import { getHonchoBaseUrl } from "./config.js";
import { installHooks, uninstallHooks, checkHooksInstalled, verifyCommandAvailable } from "./install.js";
import { handleSessionStart } from "./hooks/session-start.js";
import { handleSessionEnd } from "./hooks/session-end.js";
import { handlePostToolUse } from "./hooks/post-tool-use.js";
import { handleUserPrompt } from "./hooks/user-prompt.js";
import { handlePreCompact } from "./hooks/pre-compact.js";
import { handleStop } from "./hooks/stop.js";
import * as s from "./styles.js";
import { previewAll as previewPixel } from "./pixel.js";
import { handleHandoff } from "./skills/handoff.js";
import { getRecentLogs, watchLogs, formatLogEntry, clearLogs, getLogPath, printLegend, LogFilter } from "./log.js";
import { loadIdCache, clearAllCaches, getClaudeInstanceId, loadContextCache } from "./cache.js";
// import { handleCerebras } from "./skills/cerebras.js";  // Disabled for now

const VERSION = "0.1.0";
const WORKSPACE_APP_TAG = "honcho-plugin"; // Used to identify honcho-plugin workspaces

function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function init(): Promise<void> {
  console.log("");
  console.log(s.header("honcho setup"));
  console.log("");
  console.log(s.dim("Configure persistent memory for Claude Code using Honcho."));
  console.log("");

  // Check for existing config
  if (configExists()) {
    const existing = loadConfig();
    console.log(`Existing configuration found for: ${existing?.peerName}`);
    const overwrite = await prompt("Overwrite? (y/N): ");
    if (overwrite.toLowerCase() !== "y") {
      console.log("Setup cancelled.");
      return;
    }
  }

  // Step 1: API Key (needed to connect and discover existing resources)
  console.log(s.section("Step 1: Honcho API Key"));
  console.log(s.dim("Get your API key from https://app.honcho.dev"));
  console.log(s.dim(`Type ${s.highlight("local")} to use a local Honcho instance (http://localhost:8000)`));
  const apiKeyInput = await prompt("Enter your Honcho API key: ");
  if (!apiKeyInput) {
    console.error("Error: API key is required.");
    process.exit(1);
  }

  // Check if user wants local mode
  const isLocal = apiKeyInput.toLowerCase() === "local";
  let apiKey: string;
  let endpointEnv: HonchoEnvironment = "production";

  if (isLocal) {
    console.log(s.success("Local mode enabled"));
    apiKey = await prompt("Enter local API key (or press enter for 'local'): ") || "local";
    endpointEnv = "local";
  } else {
    apiKey = apiKeyInput;
  }

  // Determine base URL for the new SDK
  const baseUrl = endpointEnv === "local"
    ? "http://localhost:8000/v3"
    : "https://api.honcho.dev/v3";

  console.log(`Connecting to Honcho ${isLocal ? "(local)" : "(SaaS)"}...`);

  // Step 2: Workspace - New SDK requires workspace at construction
  console.log("");
  console.log(s.section("Step 2: Workspace"));
  console.log(s.dim("Workspaces group your sessions and peers together."));

  // For setup, we need to list workspaces first (before we know which one to use)
  // Try to discover existing workspaces using a temporary client
  let existingWorkspaces: Array<{ id: string; name: string; sessions: number }> = [];
  try {
    // Create a temporary client with a placeholder workspace to list workspaces
    const tempHoncho = new Honcho({ apiKey, baseUrl, workspaceId: "_temp" });
    const workspaces = await tempHoncho.workspaces();
    if (workspaces && Array.isArray(workspaces)) {
      // Filter to only show honcho tagged workspaces
      for (const ws of workspaces) {
        const metadata = (ws as any).metadata || {};
        if (metadata.app === WORKSPACE_APP_TAG) {
          existingWorkspaces.push({ id: ws.id, name: ws.id, sessions: 0 });
        }
      }
    }
  } catch {
    // workspaces() may not be available, continue to manual entry
  }

  let workspace: string;
  if (existingWorkspaces.length > 0) {
    console.log(`\nExisting honcho workspaces found:`);
    existingWorkspaces.forEach((ws, i) => console.log(`  ${i + 1}. ${ws.name}`));
    console.log(`  ${existingWorkspaces.length + 1}. Create new workspace`);

    const wsChoice = await prompt(`\nSelect workspace (1-${existingWorkspaces.length + 1}) or enter name: `);
    const choiceNum = parseInt(wsChoice);

    if (choiceNum > 0 && choiceNum <= existingWorkspaces.length) {
      workspace = existingWorkspaces[choiceNum - 1].name;
      console.log(s.success(`Using existing workspace: ${s.highlight(workspace)}`));
    } else if (choiceNum === existingWorkspaces.length + 1 || !wsChoice) {
      workspace = await prompt("Enter new workspace name (default: claude_code): ") || "claude_code";
    } else {
      // They typed a name directly
      workspace = wsChoice;
    }
  } else {
    workspace = await prompt("Enter workspace name (default: claude_code): ") || "claude_code";
  }

  // Now create the real Honcho client with the chosen workspace
  let honcho: Honcho;
  let isExistingWorkspace = false;
  try {
    honcho = new Honcho({ apiKey, baseUrl, workspaceId: workspace });

    // The workspace is created lazily on first API call
    // Try to list peers to see if it's an existing workspace
    try {
      const peers = await honcho.peers();
      if (peers && Array.isArray(peers) && peers.length > 0) {
        isExistingWorkspace = true;
        console.log(s.success(`Connected to existing workspace ${s.highlight(workspace)}`));
      } else {
        console.log(s.success(`Created new workspace ${s.highlight(workspace)}`));
      }
    } catch {
      console.log(s.success(`Connected to workspace ${s.highlight(workspace)}`));
    }
  } catch (error) {
    console.error(`Error: Could not connect to Honcho. Check your API key.`);
    console.error(`Details: ${error}`);
    process.exit(1);
  }

  // Step 3: Peer - List existing peers if workspace has history
  console.log("");
  console.log(s.section("Step 3: Peer Identity"));
  console.log(s.dim("Your peer name is how Honcho identifies you across sessions."));

  let existingPeers: string[] = [];
  let peerName: string = "";

  if (isExistingWorkspace) {
    try {
      // Try to list peers from the workspace using new SDK
      const peers = await honcho.peers();
      if (peers && Array.isArray(peers)) {
        existingPeers = peers.map((p: any) => p.id).filter((id: string) => !id.includes('claude'));
        if (existingPeers.length > 0) {
          console.log(`\nExisting peers in workspace "${workspace}":`);
          existingPeers.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
          console.log(`  ${existingPeers.length + 1}. Create new peer`);

          const peerChoice = await prompt(`\nSelect peer (1-${existingPeers.length + 1}) or enter name: `);
          const choiceNum = parseInt(peerChoice);

          if (choiceNum > 0 && choiceNum <= existingPeers.length) {
            peerName = existingPeers[choiceNum - 1];
            console.log(s.success(`Using existing peer: ${s.highlight(peerName)}`));
          } else if (choiceNum === existingPeers.length + 1 || !peerChoice) {
            peerName = await prompt("Enter your name/peer ID: ");
          } else {
            // They typed a name directly
            peerName = peerChoice;
          }
        }
      }
    } catch {
      // peers() may not exist, fall through to manual entry
    }
  }

  // If we didn't get a peer name from selection, prompt for it
  if (!peerName) {
    peerName = await prompt("Enter your name/peer ID: ");
  }

  if (!peerName) {
    console.error("Error: Peer name is required.");
    process.exit(1);
  }

  // Verify/create the peer using new SDK fluent API
  try {
    await honcho.peer(peerName);
    if (!existingPeers.includes(peerName)) {
      console.log(s.success(`Created peer: ${s.highlight(peerName)}`));
    }
  } catch (error) {
    console.error(`Error creating peer: ${error}`);
    process.exit(1);
  }

  // Step 4: Claude's peer name
  console.log("");
  console.log(s.section("Step 4: Claude Configuration"));
  const claudePeer = await prompt("Enter Claude's peer name (default: claude): ") || "claude";

  // Create Claude's peer using new SDK
  try {
    await honcho.peer(claudePeer);
  } catch {
    // Ignore errors for Claude peer creation
  }

  // Step 5: Message saving preference
  console.log("");
  console.log(s.section("Step 5: Message Saving"));
  console.log(s.dim("Save conversation messages to Honcho for memory/context building."));
  const saveMessagesInput = await prompt("Enable message saving? (Y/n): ");
  const saveMessages = saveMessagesInput.toLowerCase() !== "n";

  // Save config
  const config: HonchoCLAUDEConfig = {
    peerName,
    apiKey,
    workspace,
    claudePeer,
    saveMessages,
    endpoint: {
      environment: endpointEnv,
    },
  };

  saveConfig(config);
  console.log(`\nConfiguration saved to: ${getConfigPath()}`);

  // Offer to install hooks
  console.log("");
  console.log(s.section("Install Hooks"));
  const installNow = await prompt("Install Claude Code hooks now? (Y/n): ");
  if (installNow.toLowerCase() !== "n") {
    const result = installHooks();
    if (result.success) {
      console.log(s.success(result.message));
    } else {
      console.log(s.error(result.message));
    }
  }

  console.log("");
  console.log(s.success("Setup complete!"));
  console.log("");
  console.log(s.dim(`Your sessions will now be saved to Honcho as ${s.highlight(peerName)}.`));
  console.log(s.dim(`Claude will be identified as ${s.highlight(claudePeer)}.`));
  console.log("");
  console.log("Start a new Claude Code session to begin saving memory.");
  console.log("");
}

function status(): void {
  console.log("");
  console.log(s.header("honcho status"));
  console.log("");

  const config = loadConfig();
  if (!config) {
    console.log(s.warn("Not configured"));
    console.log(s.dim("Run: honcho init"));
    return;
  }

  const enabled = isPluginEnabled();
  console.log(s.section("Plugin Status"));
  console.log(`  ${s.label("Status")}:        ${enabled ? s.success("enabled") : s.warn("disabled (run: honcho enable)")}`);
  console.log("");

  console.log(s.section("Configuration"));
  console.log(s.dim(getConfigPath()));
  console.log("");
  console.log(`  ${s.label("Peer name")}:     ${config.peerName}`);
  console.log(`  ${s.label("Claude peer")}:   ${config.claudePeer}`);
  console.log(`  ${s.label("Workspace")}:     ${config.workspace}`);
  console.log(`  ${s.label("Save messages")}: ${config.saveMessages !== false ? "enabled" : "disabled"}`);
  console.log(`  ${s.label("API key")}:       ${s.dim(config.apiKey.slice(0, 20) + "...")}`);

  const hooksInstalled = checkHooksInstalled();
  console.log("");
  console.log(s.section("Hooks"));
  console.log(`  ${s.label("Status")}:   ${hooksInstalled ? s.success("installed") : s.warn("not installed")}`);
  console.log(`  ${s.label("Location")}: ${s.dim(getClaudeSettingsPath())}`);

  // Check command verification
  const verification = verifyCommandAvailable();
  console.log("");
  console.log(s.section("Command"));
  console.log(`  ${s.label("Status")}: ${verification.ok ? s.success("OK") : s.error("problem detected")}`);
  if (!verification.ok) {
    console.log(`  ${s.label("Error")}: ${verification.error}`);
    if (verification.details) {
      console.log(`  ${s.dim(verification.details.split("\n").join("\n  "))}`);
    }
  }

  if (!hooksInstalled) {
    console.log("");
    console.log(s.dim("Run: honcho install"));
  }
  console.log("");
}

function install(): void {
  const config = loadConfig();
  if (!config) {
    console.log(s.error("Not configured. Run: honcho init"));
    process.exit(1);
  }

  const result = installHooks();
  if (result.success) {
    console.log(s.success(result.message));
    console.log(s.dim("Hooks will apply to all new Claude Code sessions."));
  } else {
    console.log(s.error(result.message));
    process.exit(1);
  }
}

function uninstall(): void {
  const result = uninstallHooks();
  if (result.success) {
    console.log(s.success(result.message));
  } else {
    console.log(s.error(result.message));
    process.exit(1);
  }
}

async function update(): Promise<void> {
  const { execSync } = require("child_process");
  const { dirname, join } = require("path");
  const { existsSync: fsExistsSync } = require("fs");

  // Find the package directory (where this CLI is installed from)
  const packageDir = join(dirname(dirname(Bun.main)));

  console.log("");
  console.log(s.header("honcho update"));
  console.log("");
  console.log(`${s.label("Package")}: ${s.path(packageDir)}`);
  console.log("");

  try {
    // Check if we're in the right directory
    const packageJsonPath = join(packageDir, "package.json");
    if (!fsExistsSync(packageJsonPath)) {
      console.log(s.error("Could not find package.json"));
      console.log(s.dim("Run this command from the honcho source directory,"));
      console.log(s.dim("or use: cd <honcho-dir> && bun run update"));
      process.exit(1);
    }

    console.log(s.dim("Removing bun.lockb..."));
    try {
      execSync("rm -f bun.lockb", { cwd: packageDir, stdio: "inherit" });
    } catch { /* ignore if doesn't exist */ }

    console.log(s.dim("Installing dependencies..."));
    execSync("bun install", { cwd: packageDir, stdio: "inherit" });

    console.log("");
    console.log(s.dim("Building..."));
    execSync("bun run build", { cwd: packageDir, stdio: "inherit" });

    console.log("");
    console.log(s.dim("Linking globally..."));
    execSync("bun link", { cwd: packageDir, stdio: "inherit" });

    console.log("");
    console.log(s.success("Update complete!"));
    console.log(s.dim("Run 'honcho status' to verify."));
  } catch (error) {
    console.log("");
    console.log(s.error(`Update failed: ${error}`));
    process.exit(1);
  }
}

async function handleHook(hookName: string): Promise<void> {
  switch (hookName) {
    case "session-start":
      await handleSessionStart();
      break;
    case "session-end":
      await handleSessionEnd();
      break;
    case "post-tool-use":
      await handlePostToolUse();
      break;
    case "user-prompt":
      await handleUserPrompt();
      break;
    case "pre-compact":
      await handlePreCompact();
      break;
    case "stop":
      await handleStop();
      break;
    default:
      console.error(`Unknown hook: ${hookName}`);
      process.exit(1);
  }
}

// Session management commands
async function sessionNew(name?: string): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.error("Not configured. Run: honcho init");
    process.exit(1);
  }

  const cwd = process.cwd();
  const { basename } = require("path");

  // Default to directory name if no name provided
  const fallbackSessionName = basename(cwd).toLowerCase().replace(/[^a-z0-9-_]/g, "-");
  const providedName = name?.trim();
  const sessionName = providedName?.length ? providedName : fallbackSessionName;
  if (!providedName?.length) {
    console.log(`Using directory name as session: ${sessionName}`);
  }

  // Validate session name
  const validName = sessionName.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
  if (validName !== sessionName) {
    console.log(`Note: Session name normalized to: ${validName}`);
  }

  try {
    // Connect to Honcho using new SDK
    const honcho = new Honcho(getHonchoClientOptions(config));

    // Use honcho.session() - this will find existing session or create new one
    const session = await honcho.session(validName);

    // Check if this is an existing session with history
    let isExisting = false;
    try {
      const summaries = await session.summaries();
      const sum = summaries as any;
      const shortSummary = sum?.shortSummary || sum?.short_summary;
      const longSummary = sum?.longSummary || sum?.long_summary;
      if (shortSummary?.content || longSummary?.content) {
        isExisting = true;
      }
    } catch {
      // No summaries = new session
    }

    // Ensure peers exist and configure observation
    const userPeer = await honcho.peer(config.peerName);
    const claudePeer = await honcho.peer(config.claudePeer);

    try {
      await Promise.all([
        session.setPeerConfiguration(userPeer, { observeMe: true, observeOthers: false }),
        session.setPeerConfiguration(claudePeer, { observeMe: false, observeOthers: true }),
      ]);
    } catch {
      // Session peers API may not be available
    }

    // Store in local config
    setSessionForPath(cwd, validName);

    if (isExisting) {
      console.log(s.success(`Connected to existing session: ${s.highlight(validName)}`));
      console.log(s.dim("  Continuing from previous context..."));
    } else {
      console.log(s.success(`Created new session: ${s.highlight(validName)}`));
    }
    console.log(`  ${s.label("Workspace")}: ${config.workspace}`);
    console.log(`  ${s.label("Directory")}: ${s.path(cwd)}`);
    console.log("");
    console.log(s.dim(`This directory will now use session "${validName}" for Honcho memory.`));
  } catch (error) {
    console.error(`Failed to create/connect session: ${error}`);
    process.exit(1);
  }
}

async function sessionList(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.error("Not configured. Run: honcho init");
    process.exit(1);
  }

  console.log("");
  console.log(s.header("Honcho Sessions"));
  console.log("");

  // Show local mappings
  const localSessions = getAllSessions();
  const localCount = Object.keys(localSessions).length;

  if (localCount > 0) {
    console.log(s.section("Local directory mappings"));
    for (const [p, sessionName] of Object.entries(localSessions)) {
      const isCurrent = p === process.cwd() ? ` ${s.current("current")}` : "";
      console.log(`  ${s.highlight(sessionName)}${isCurrent}`);
      console.log(`    ${s.dim(s.symbols.arrow)} ${s.path(p)}`);
    }
  } else {
    console.log(s.dim("No local session mappings yet."));
  }

  // Try to list sessions from Honcho using new SDK
  // Note: The new SDK doesn't have a direct sessions list method at the honcho level
  // For now, we just show local mappings
  // TODO: Check if there's a way to list all sessions in the new SDK

  console.log("");
}

function sessionCurrent(): void {
  const config = loadConfig();
  if (!config) {
    console.error("Not configured. Run: honcho init");
    process.exit(1);
  }

  const cwd = process.cwd();
  const currentSession = getSessionForPath(cwd);

  console.log("\nCurrent Honcho Session\n");
  console.log(`Directory: ${cwd}`);

  if (currentSession) {
    console.log(`Session: ${currentSession}`);
  } else {
    // Show what the default would be
    const dirName = require("path").basename(cwd).toLowerCase().replace(/[^a-z0-9-_]/g, "-");
    const defaultSession = dirName;
    console.log(`Session: ${defaultSession} (default)`);
    console.log("\nTip: Use 'honcho session new <name>' to set a custom session name.");
  }

  console.log(`Workspace: ${config.workspace}`);
  console.log(`User: ${config.peerName}`);
  console.log(`AI: ${config.claudePeer}`);
  console.log("");
}

function sessionSwitch(name: string): void {
  const config = loadConfig();
  if (!config) {
    console.error("Not configured. Run: honcho init");
    process.exit(1);
  }

  if (!name) {
    console.error("Usage: honcho session switch <session-name>");
    process.exit(1);
  }

  const cwd = process.cwd();
  const oldSession = getSessionForPath(cwd);

  setSessionForPath(cwd, name);

  console.log(s.success("Switched session for current directory"));
  if (oldSession) {
    console.log(`  ${s.label("From")}: ${oldSession}`);
  }
  console.log(`  ${s.label("To")}:   ${s.highlight(name)}`);
  console.log("");
  console.log(s.dim(`New Claude Code sessions in this directory will use "${name}".`));
}

function sessionClear(): void {
  const cwd = process.cwd();
  const currentSession = getSessionForPath(cwd);

  if (!currentSession) {
    console.log("No custom session set for this directory.");
    return;
  }

  removeSessionForPath(cwd);
  console.log(s.success("Cleared session mapping for this directory"));
  console.log(`  ${s.label("Was")}: ${currentSession}`);
  console.log("");
  console.log(s.dim("This directory will now use the default session name."));
}

// Workspace management commands
async function workspaceList(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.error("Not configured. Run: honcho init");
    process.exit(1);
  }

  console.log("");
  console.log(s.header("Workspaces"));
  console.log("");
  console.log(`${s.label("Current")}: ${s.highlight(config.workspace)}`);

  try {
    const honcho = new Honcho(getHonchoClientOptions(config));
    const workspaces = await honcho.workspaces();

    if (workspaces && Array.isArray(workspaces)) {
      const claudeWorkspaces = workspaces.filter((ws: any) =>
        ws.metadata?.app === WORKSPACE_APP_TAG
      );

      if (claudeWorkspaces.length > 0) {
        console.log("\nAvailable honcho workspaces:");
        for (const ws of claudeWorkspaces) {
          const isCurrent = ws.id === config.workspace ? " (current)" : "";
          console.log(`  - ${ws.id}${isCurrent}`);
        }
      }

      const otherWorkspaces = workspaces.filter((ws: any) =>
        ws.metadata?.app !== WORKSPACE_APP_TAG
      );
      if (otherWorkspaces.length > 0) {
        console.log("\nOther workspaces:");
        for (const ws of otherWorkspaces) {
          console.log(`  - ${ws.id}`);
        }
      }
    }
  } catch {
    console.log("\nCould not list remote workspaces.");
  }

  console.log("");
}

async function workspaceSwitch(name: string): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.error("Not configured. Run: honcho init");
    process.exit(1);
  }

  if (!name) {
    console.error("Usage: honcho workspace switch <workspace-name>");
    process.exit(1);
  }

  const oldWorkspace = config.workspace;

  try {
    // Just update config - workspace will be created lazily on first API call
    config.workspace = name;
    saveConfig(config);

    // Verify it works by making a simple API call
    const honcho = new Honcho(getHonchoClientOptions(config));
    await honcho.peers(); // This will create the workspace if needed

    console.log(s.success("Switched workspace"));
    console.log(`  ${s.label("From")}: ${oldWorkspace}`);
    console.log(`  ${s.label("To")}:   ${s.highlight(name)}`);
    console.log("");
    console.log(s.dim("New Claude Code sessions will use this workspace."));
  } catch (error) {
    // Revert config on failure
    config.workspace = oldWorkspace;
    saveConfig(config);
    console.error(`Error switching workspace: ${error}`);
    process.exit(1);
  }
}

async function workspaceRename(newName: string): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.error("Not configured. Run: honcho init");
    process.exit(1);
  }

  if (!newName) {
    console.error("Usage: honcho workspace rename <new-name>");
    console.error("\nNote: Workspace IDs in Honcho are immutable.");
    console.error("This command creates a new workspace and updates your config.");
    console.error("Your existing workspace data remains in the old workspace.");
    process.exit(1);
  }

  const oldWorkspace = config.workspace;

  if (oldWorkspace === newName) {
    console.log("Workspace name is already set to: " + newName);
    return;
  }

  try {
    // Update config with new workspace name
    config.workspace = newName;
    saveConfig(config);

    // Verify it works by making a simple API call (workspace created lazily)
    const honcho = new Honcho(getHonchoClientOptions(config));
    await honcho.peers();

    // Update config
    config.workspace = newName;
    saveConfig(config);

    console.log(s.success("Workspace renamed"));
    console.log(`  ${s.label("From")}: ${oldWorkspace}`);
    console.log(`  ${s.label("To")}:   ${s.highlight(newName)}`);
    console.log("");
    console.log(s.dim("Note: This creates a new workspace. Your old workspace data"));
    console.log(s.dim(`remains accessible at "${oldWorkspace}".`));
  } catch (error) {
    console.error(`Error renaming workspace: ${error}`);
    process.exit(1);
  }
}

async function handleWorkspace(subcommand: string, arg?: string): Promise<void> {
  switch (subcommand) {
    case "list":
      await workspaceList();
      break;
    case "switch":
      await workspaceSwitch(arg || "");
      break;
    case "rename":
      await workspaceRename(arg || "");
      break;
    default:
      console.log(`
Workspace Management Commands:
  honcho workspace list             List all workspaces
  honcho workspace switch <name>    Switch to a different workspace
  honcho workspace rename <name>    Create new workspace and switch to it
`);
  }
}

// Peer management commands
async function peerList(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.error("Not configured. Run: honcho init");
    process.exit(1);
  }

  console.log("");
  console.log(s.header("Peers in Workspace"));
  console.log("");

  try {
    const honcho = new Honcho(getHonchoClientOptions(config));
    const peers = await honcho.peers();

    if (peers && Array.isArray(peers)) {
      const userPeers = peers.filter((p: any) => !p.id.includes('claude'));
      const aiPeers = peers.filter((p: any) => p.id.includes('claude'));

      console.log(`Workspace: ${config.workspace}`);
      console.log(`Current peer: ${config.peerName}`);

      if (userPeers.length > 0) {
        console.log(`\nUser peers:`);
        for (const peer of userPeers) {
          const isCurrent = peer.id === config.peerName ? " (you)" : "";
          console.log(`  - ${peer.id}${isCurrent}`);
        }
      }

      if (aiPeers.length > 0) {
        console.log(`\nAI peers:`);
        for (const peer of aiPeers) {
          const isCurrent = peer.id === config.claudePeer ? " (configured)" : "";
          console.log(`  - ${peer.id}${isCurrent}`);
        }
      }

      if (peers.length === 0) {
        console.log("No peers found in workspace.");
      }
    } else {
      console.log("Could not list peers (API may not support this).");
    }
  } catch (error) {
    console.error(`Error listing peers: ${error}`);
    process.exit(1);
  }

  console.log("");
}

async function handlePeer(subcommand: string, _arg?: string): Promise<void> {
  switch (subcommand) {
    case "list":
      await peerList();
      break;
    default:
      console.log(`
Peer Management Commands:
  honcho peer list     List all peers in workspace
`);
  }
}

async function handleSession(subcommand: string, arg?: string): Promise<void> {
  switch (subcommand) {
    case "new":
      await sessionNew(arg || "");
      break;
    case "list":
      await sessionList();
      break;
    case "current":
      sessionCurrent();
      break;
    case "switch":
      sessionSwitch(arg || "");
      break;
    case "clear":
      sessionClear();
      break;
    default:
      console.log(`
Session Management Commands:
  honcho session new [name]     Create/connect session (defaults to dir name)
  honcho session list           List all sessions
  honcho session current        Show current session
  honcho session switch <name>  Switch to existing session
  honcho session clear          Remove custom session for current directory
`);
  }
}

// ============================================
// Cache Command - Inspect/Clear Cache
// ============================================

function handleCache(subcommand: string): void {
  switch (subcommand) {
    case "show":
    case "status":
    case undefined:
    case "": {
      const idCache = loadIdCache();
      const contextCache = loadContextCache();
      const instanceId = getClaudeInstanceId();

      console.log("");
      console.log(s.header("Honcho Cache"));
      console.log("");

      console.log(s.section("ID Cache"));
      if (idCache.workspace) {
        console.log(`  Workspace: ${idCache.workspace.name} → ${s.dim(idCache.workspace.id.slice(0, 8) + "...")}`);
      } else {
        console.log(`  Workspace: ${s.dim("(not cached)")}`);
      }

      if (idCache.sessions) {
        const sessionCount = Object.keys(idCache.sessions).length;
        console.log(`  Sessions: ${sessionCount} cached`);
        for (const [cwd, session] of Object.entries(idCache.sessions).slice(0, 5)) {
          const shortCwd = cwd.split("/").slice(-2).join("/");
          console.log(`    ${s.dim(shortCwd)}: ${session.name} (${s.dim(session.updatedAt?.slice(0, 10) || "?")})`);
        }
        if (sessionCount > 5) {
          console.log(`    ${s.dim(`...and ${sessionCount - 5} more`)}`);
        }
      }

      if (idCache.peers) {
        console.log(`  Peers: ${Object.keys(idCache.peers).join(", ")}`);
      }

      console.log("");
      console.log(s.section("Instance Tracking"));
      console.log(`  Claude Instance ID: ${instanceId ? instanceId.slice(0, 12) + "..." : s.dim("(not set)")}`);

      console.log("");
      console.log(s.section("Context Cache"));
      if (contextCache.userContext) {
        const age = Math.round((Date.now() - contextCache.userContext.fetchedAt) / 1000);
        console.log(`  User Context: ${age}s old`);
      } else {
        console.log(`  User Context: ${s.dim("(not cached)")}`);
      }
      if (contextCache.messageCount) {
        console.log(`  Message Count: ${contextCache.messageCount}`);
      }

      console.log("");
      console.log(s.dim("Run 'honcho cache clear' to reset all caches"));
      break;
    }
    case "clear": {
      clearAllCaches();
      console.log(s.success("All caches cleared"));
      console.log(s.dim("Next hook will re-fetch IDs from Honcho"));
      break;
    }
    default:
      console.log(`
Cache Commands:
  honcho cache [show]   Show current cache state
  honcho cache clear    Clear all cached IDs (forces re-fetch)
`);
  }
}

// ============================================
// Tail Command - Live Activity Log
// ============================================

async function handleTail(args: string[]): Promise<void> {
  // Filter out flags to find the actual subcommand
  const nonFlagArgs = args.filter(a => !a.startsWith("-"));
  const subcommand = nonFlagArgs[0];

  if (subcommand === "clear") {
    clearLogs();
    console.log(s.success("Activity log cleared"));
    return;
  }

  if (subcommand === "path") {
    console.log(getLogPath());
    return;
  }

  if (subcommand === "legend" || subcommand === "help") {
    printLegend();
    return;
  }

  // Live follow is the default behavior (the whole point of tail!)
  // Only disable with explicit --no-follow
  const noFollow = args.includes("--no-follow");
  const follow = !noFollow;
  const showAll = args.includes("-a") || args.includes("--all");
  const countArg = args.find(a => a.startsWith("-n"));
  const count = countArg ? parseInt(countArg.slice(2)) || 50 : 50;

  // Build filter - DEFAULT is current directory, -a for all
  const filter: LogFilter = {};
  if (!showAll) {
    filter.cwd = process.cwd();
  }

  const showSession = showAll; // Only show session tag when viewing all

  console.log("");
  console.log(s.header("honcho activity"));
  if (showAll) {
    console.log(s.dim("all sessions"));
  }

  console.log("");

  // Show recent logs first
  const recent = getRecentLogs(count, Object.keys(filter).length > 0 ? filter : undefined);
  if (recent.length === 0) {
    console.log(s.dim("No activity yet. Start a Claude session to see logs."));
    console.log("");
  } else {
    recent.forEach(entry => console.log(formatLogEntry(entry, { showSession })));
  }

  if (follow) {
    console.log("");
    console.log(s.dim("Watching for new activity... (Ctrl+C to stop)"));
    console.log("");

    // Watch for new entries
    const stopWatching = watchLogs((entries) => {
      // Apply filter to new entries
      let filtered = entries;
      if (filter.cwd) {
        filtered = filtered.filter(e => e.cwd === filter.cwd);
      }
      filtered.forEach(entry => console.log(formatLogEntry(entry, { showSession })));
    });

    // Handle Ctrl+C
    process.on("SIGINT", () => {
      stopWatching();
      console.log("");
      console.log(s.dim("Stopped watching."));
      process.exit(0);
    });

    // Keep process alive
    await new Promise(() => {});
  }
}

// ============================================
// Endpoint Commands (SaaS vs Local)
// ============================================

async function handleEndpoint(subcommand: string, arg?: string): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.error(s.error("Not configured. Run: honcho init"));
    process.exit(1);
  }

  switch (subcommand) {
    case "status":
    case undefined:
    case "": {
      const info = getEndpointInfo(config);
      console.log("");
      console.log(s.header("Honcho Endpoint"));
      console.log(`  ${s.label("Type")}:  ${info.type}`);
      console.log(`  ${s.label("URL")}:   ${info.url}`);
      console.log("");
      break;
    }

    case "saas":
    case "production": {
      setEndpoint("production");
      const info = getEndpointInfo(loadConfig()!);
      console.log(s.success(`Switched to SaaS: ${info.url}`));
      break;
    }

    case "local": {
      setEndpoint("local");
      const info = getEndpointInfo(loadConfig()!);
      console.log(s.success(`Switched to local: ${info.url}`));
      break;
    }

    case "custom": {
      if (!arg) {
        console.error(s.error("Usage: honcho endpoint custom <url>"));
        process.exit(1);
      }
      // Validate URL format
      try {
        new URL(arg);
      } catch {
        console.error(s.error(`Invalid URL: ${arg}`));
        process.exit(1);
      }
      setEndpoint(undefined, arg);
      console.log(s.success(`Switched to custom endpoint: ${arg}`));
      break;
    }

    case "test": {
      const info = getEndpointInfo(config);
      console.log(s.dim(`Testing connection to ${info.url}...`));
      try {
        const clientOpts = getHonchoClientOptions(config);
        const honcho = new Honcho(clientOpts);
        // Test by listing peers (workspace will be created lazily)
        await honcho.peers();
        console.log(s.success("Connection successful"));
      } catch (error: any) {
        console.error(s.error(`Connection failed: ${error.message}`));
        process.exit(1);
      }
      break;
    }

    default:
      console.log(`
${s.header("Endpoint Commands")}
  honcho endpoint           Show current endpoint
  honcho endpoint saas      Switch to SaaS (https://api.honcho.dev)
  honcho endpoint local     Switch to local (http://localhost:8000)
  honcho endpoint custom <url>  Use custom URL
  honcho endpoint test      Test connection to current endpoint
`);
  }
}

function showHelp(): void {
  console.log("");
  console.log(`${s.colors.orange}honcho${s.colors.reset} ${s.dim(`v${VERSION}`)}`);
  console.log(s.dim("Persistent memory for Claude Code sessions using Honcho"));
  console.log("");
  console.log(`${s.label("Usage")}: honcho <command>`);
  console.log("");
  console.log(s.section("Commands"));
  console.log(`  ${s.highlight("init")}        Configure honcho (name, API key, workspace)`);
  console.log(`  ${s.highlight("install")}     Install hooks to ~/.claude/settings.json`);
  console.log(`  ${s.highlight("uninstall")}   Remove hooks from Claude settings`);
  console.log(`  ${s.highlight("update")}      Rebuild and reinstall (removes lockfile, builds, links)`);
  console.log(`  ${s.highlight("status")}      Show current configuration and hook status`);
  console.log(`  ${s.highlight("enable")}      Enable honcho memory`);
  console.log(`  ${s.highlight("disable")}     Temporarily disable honcho (use Claude without memory)`);
  console.log(`  ${s.highlight("help")}        Show this help message`);
  console.log("");
  console.log(s.section("Session Commands"));
  console.log(`  ${s.highlight("session new")} [name]     Create/connect Honcho session`);
  console.log(`  ${s.highlight("session list")}           List all sessions`);
  console.log(`  ${s.highlight("session current")}        Show current session info`);
  console.log(`  ${s.highlight("session switch")} <name>  Switch to existing session`);
  console.log(`  ${s.highlight("session clear")}          Remove custom session mapping`);
  console.log("");
  console.log(s.section("Workspace Commands"));
  console.log(`  ${s.highlight("workspace list")}         List all workspaces`);
  console.log(`  ${s.highlight("workspace switch")} <n>   Switch to a different workspace`);
  console.log(`  ${s.highlight("workspace rename")} <n>   Create new workspace and switch to it`);
  console.log("");
  console.log(s.section("Endpoint Commands"));
  console.log(`  ${s.highlight("endpoint")}               Show current endpoint (SaaS/local)`);
  console.log(`  ${s.highlight("endpoint saas")}          Switch to SaaS (api.honcho.dev)`);
  console.log(`  ${s.highlight("endpoint local")}         Switch to local (localhost:8000)`);
  console.log(`  ${s.highlight("endpoint custom")} <url>  Use custom URL`);
  console.log(`  ${s.highlight("endpoint test")}          Test connection`);
  console.log("");
  console.log(s.section("Peer Commands"));
  console.log(`  ${s.highlight("peer list")}              List all peers in workspace`);
  console.log("");
  console.log(s.section("Skills"));
  console.log(`  ${s.highlight("handoff")}                Generate research handoff summary`);
  console.log(`  ${s.highlight("handoff")} --all          Include all instances (not just current)`);
  console.log("");
  console.log(s.section("Debugging"));
  console.log(`  ${s.highlight("tail")}                   Live activity log`);
  console.log(`  ${s.highlight("tail")} -a               All sessions`);
  console.log(`  ${s.highlight("tail")} clear            Clear log`);
  console.log("");
  console.log(s.dim("Learn more: https://docs.honcho.dev"));
  console.log("");
}

// Main
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case "init":
    await init();
    break;
  case "install":
    install();
    break;
  case "uninstall":
    uninstall();
    break;
  case "update":
    await update();
    break;
  case "status":
    status();
    break;
  case "enable":
    setPluginEnabled(true);
    console.log(s.success("Honcho enabled"));
    console.log(s.dim("Memory and context will be active in new sessions."));
    break;
  case "disable":
    setPluginEnabled(false);
    console.log(s.warn("Honcho disabled"));
    console.log(s.dim("Run 'honcho enable' to re-enable."));
    break;
  case "session":
    await handleSession(args[1], args[2]);
    break;
  case "peer":
    await handlePeer(args[1], args[2]);
    break;
  case "workspace":
    await handleWorkspace(args[1], args[2]);
    break;
  case "endpoint":
    await handleEndpoint(args[1], args[2]);
    break;
  case "hook":
    await handleHook(args[1]);
    break;
  case "help":
  case "--help":
  case "-h":
    showHelp();
    break;
  case "version":
  case "--version":
  case "-v":
    console.log(`honcho v${VERSION}`);
    break;
  case "pixel":
    previewPixel();
    break;
  case "handoff":
    await handleHandoff(args.slice(1));
    break;
  case "tail":
    await handleTail(args.slice(1));
    break;
  case "logs":
    await handleTail(args.slice(1));
    break;
  case "cache":
    handleCache(args[1]);
    break;
  // case "cerebras":
  // case "fast":
  //   await handleCerebras(args.slice(1));
  //   break;
  default:
    if (!command) {
      showHelp();
    } else {
      console.error(`Unknown command: ${command}`);
      console.log("Run: honcho help");
      process.exit(1);
    }
}

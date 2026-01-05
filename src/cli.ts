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
  type HonchoCLAWDConfig,
} from "./config.js";
import Honcho from "@honcho-ai/core";
import { installHooks, uninstallHooks, checkHooksInstalled, verifyCommandAvailable, checkLegacyBinaries } from "./install.js";
import { handleSessionStart } from "./hooks/session-start.js";
import { handleSessionEnd } from "./hooks/session-end.js";
import { handlePostToolUse } from "./hooks/post-tool-use.js";
import { handleUserPrompt } from "./hooks/user-prompt.js";

const VERSION = "0.1.0";
const WORKSPACE_APP_TAG = "honcho-clawd"; // Used to identify honcho-clawd workspaces

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
  console.log("\nhoncho-clawd setup\n");
  console.log("This will configure persistent memory for Claude Code using Honcho.\n");

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
  console.log("--- Step 1: Honcho API Key ---");
  console.log("Get your API key from https://app.honcho.dev");
  const apiKey = await prompt("Enter your Honcho API key: ");
  if (!apiKey) {
    console.error("Error: API key is required.");
    process.exit(1);
  }

  // Validate API key by connecting
  const client = new Honcho({
    apiKey,
    environment: "production",
  });

  console.log("Connecting to Honcho...");

  // Step 2: Workspace - Try to discover existing honcho-clawd workspaces first
  console.log("\n--- Step 2: Workspace ---");
  console.log("Workspaces group your sessions and peers together.");

  let existingWorkspaces: Array<{ id: string; name: string; sessions: number }> = [];
  try {
    // Try to list workspaces (may not be available in all API versions)
    const workspaces = await (client as any).workspaces.list();
    if (workspaces && Array.isArray(workspaces)) {
      // Filter to only show honcho-clawd tagged workspaces
      for (const ws of workspaces) {
        const metadata = (ws as any).metadata || {};
        if (metadata.app === WORKSPACE_APP_TAG) {
          let sessionCount = 0;
          try {
            const sessions = await client.workspaces.sessions.list(ws.id);
            sessionCount = Array.isArray(sessions) ? sessions.length : 0;
          } catch { /* ignore */ }
          existingWorkspaces.push({ id: ws.id, name: ws.id, sessions: sessionCount });
        }
      }
    }
  } catch {
    // workspaces.list may not be available, continue to manual entry
  }

  let workspace: string;
  if (existingWorkspaces.length > 0) {
    console.log(`\nExisting honcho-clawd workspaces found:`);
    existingWorkspaces.forEach((ws, i) => console.log(`  ${i + 1}. ${ws.name} (${ws.sessions} session${ws.sessions === 1 ? '' : 's'})`));
    console.log(`  ${existingWorkspaces.length + 1}. Create new workspace`);

    const wsChoice = await prompt(`\nSelect workspace (1-${existingWorkspaces.length + 1}) or enter name: `);
    const choiceNum = parseInt(wsChoice);

    if (choiceNum > 0 && choiceNum <= existingWorkspaces.length) {
      workspace = existingWorkspaces[choiceNum - 1].name;
      console.log(`✓ Using existing workspace: ${workspace}`);
    } else if (choiceNum === existingWorkspaces.length + 1 || !wsChoice) {
      workspace = await prompt("Enter new workspace name (default: claude_code): ") || "claude_code";
    } else {
      // They typed a name directly
      workspace = wsChoice;
    }
  } else {
    workspace = await prompt("Enter workspace name (default: claude_code): ") || "claude_code";
  }

  let workspaceId: string;
  let isExistingWorkspace = false;
  try {
    // Create workspace with honcho-clawd app tag in metadata
    const ws = await client.workspaces.getOrCreate({
      id: workspace,
      metadata: { app: WORKSPACE_APP_TAG },
    });
    workspaceId = ws.id;

    // If workspace existed but doesn't have our tag, update it
    const wsMetadata = (ws as any).metadata || {};
    if (wsMetadata.app !== WORKSPACE_APP_TAG) {
      try {
        await (client.workspaces as any).update(workspaceId, {
          metadata: { ...wsMetadata, app: WORKSPACE_APP_TAG },
        });
      } catch {
        // Update may not be available, continue anyway
      }
    }

    // Check if workspace has existing sessions to determine if it's "existing"
    try {
      const sessions = await client.workspaces.sessions.list(workspaceId);
      if (sessions && Array.isArray(sessions) && sessions.length > 0) {
        isExistingWorkspace = true;
        console.log(`✓ Connected to existing workspace "${workspace}" (${sessions.length} session${sessions.length === 1 ? '' : 's'})`);
      } else {
        console.log(`✓ Created new workspace "${workspace}"`);
      }
    } catch {
      console.log(`✓ Connected to workspace "${workspace}"`);
    }
  } catch (error) {
    console.error(`Error: Could not connect to Honcho. Check your API key.`);
    console.error(`Details: ${error}`);
    process.exit(1);
  }

  // Step 3: Peer - List existing peers if workspace has history
  console.log("\n--- Step 3: Peer Identity ---");
  console.log("Your peer name is how Honcho identifies you across sessions.");

  let existingPeers: string[] = [];
  let peerName: string = "";

  if (isExistingWorkspace) {
    try {
      // Try to list peers from the workspace
      const peers = await (client.workspaces as any).peers.list(workspaceId);
      if (peers && Array.isArray(peers)) {
        existingPeers = peers.map((p: any) => p.id).filter((id: string) => !id.includes('clawd') && !id.includes('claude'));
        if (existingPeers.length > 0) {
          console.log(`\nExisting peers in workspace "${workspace}":`);
          existingPeers.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
          console.log(`  ${existingPeers.length + 1}. Create new peer`);

          const peerChoice = await prompt(`\nSelect peer (1-${existingPeers.length + 1}) or enter name: `);
          const choiceNum = parseInt(peerChoice);

          if (choiceNum > 0 && choiceNum <= existingPeers.length) {
            peerName = existingPeers[choiceNum - 1];
            console.log(`✓ Using existing peer: ${peerName}`);
          } else if (choiceNum === existingPeers.length + 1 || !peerChoice) {
            peerName = await prompt("Enter your name/peer ID: ");
          } else {
            // They typed a name directly
            peerName = peerChoice;
          }
        }
      }
    } catch {
      // peers.list may not exist, fall through to manual entry
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

  // Verify/create the peer
  try {
    await client.workspaces.peers.getOrCreate(workspaceId, { id: peerName });
    if (!existingPeers.includes(peerName)) {
      console.log(`✓ Created peer: ${peerName}`);
    }
  } catch (error) {
    console.error(`Error creating peer: ${error}`);
    process.exit(1);
  }

  // Step 4: Claude's peer name
  console.log("\n--- Step 4: Claude Configuration ---");
  const claudePeer = await prompt("Enter Claude's peer name (default: clawd): ") || "clawd";

  // Create Claude's peer
  try {
    await client.workspaces.peers.getOrCreate(workspaceId, { id: claudePeer });
  } catch {
    // Ignore errors for Claude peer creation
  }

  // Step 5: Message saving preference
  console.log("\n--- Step 5: Message Saving ---");
  console.log("Save conversation messages to Honcho for memory/context building.");
  const saveMessagesInput = await prompt("Enable message saving? (Y/n): ");
  const saveMessages = saveMessagesInput.toLowerCase() !== "n";

  // Save config
  const config: HonchoCLAWDConfig = {
    peerName,
    apiKey,
    workspace,
    claudePeer,
    saveMessages,
  };

  saveConfig(config);
  console.log(`\nConfiguration saved to: ${getConfigPath()}`);

  // Offer to install hooks
  console.log("\n--- Install Hooks ---");
  const installNow = await prompt("Install Claude Code hooks now? (Y/n): ");
  if (installNow.toLowerCase() !== "n") {
    const result = installHooks();
    if (result.success) {
      console.log(`✓ ${result.message}`);
    } else {
      console.error(`✗ ${result.message}`);
    }
  }

  console.log("\n✓ Setup complete!");
  console.log(`\nYour sessions will now be saved to Honcho as "${peerName}".`);
  console.log(`Claude will be identified as "${claudePeer}".`);
  console.log("\nStart a new Claude Code session to begin saving memory.\n");
}

function status(): void {
  console.log("\nhoncho-clawd status\n");

  const config = loadConfig();
  if (!config) {
    console.log("Status: Not configured");
    console.log("Run: honcho-clawd init");
    return;
  }

  console.log(`Configuration: ${getConfigPath()}`);
  console.log(`  Peer name: ${config.peerName}`);
  console.log(`  Claude peer: ${config.claudePeer}`);
  console.log(`  Workspace: ${config.workspace}`);
  console.log(`  Save messages: ${config.saveMessages !== false ? "enabled" : "disabled"}`);
  console.log(`  API key: ${config.apiKey.slice(0, 20)}...`);

  const hooksInstalled = checkHooksInstalled();
  console.log(`\nHooks: ${hooksInstalled ? "Installed" : "Not installed"}`);
  console.log(`  Location: ${getClaudeSettingsPath()}`);

  // Check command verification
  const verification = verifyCommandAvailable();
  console.log(`\nCommand Status: ${verification.ok ? "✓ OK" : "✗ Problem detected"}`);
  if (!verification.ok) {
    console.log(`  Error: ${verification.error}`);
    if (verification.details) {
      console.log(`  ${verification.details.split("\n").join("\n  ")}`);
    }
  }

  // Check for legacy binaries
  const legacy = checkLegacyBinaries();
  if (legacy.found.length > 0) {
    console.log(`\n⚠️  Legacy binaries found (may conflict with shell aliases):`);
    for (const binary of legacy.found) {
      console.log(`  - ${binary}: ${legacy.paths[binary]}`);
    }
    console.log(`\n  Remove with: rm ${legacy.found.map(b => legacy.paths[b]).join(" ")}`);
  }

  if (!hooksInstalled) {
    console.log("\nRun: honcho-clawd install");
  }
}

function install(): void {
  const config = loadConfig();
  if (!config) {
    console.error("Not configured. Run: honcho-clawd init");
    process.exit(1);
  }

  const result = installHooks();
  if (result.success) {
    console.log(`✓ ${result.message}`);
    console.log("\nHooks will apply to all new Claude Code sessions.");
  } else {
    console.error(`✗ ${result.message}`);
    process.exit(1);
  }
}

function uninstall(): void {
  const result = uninstallHooks();
  if (result.success) {
    console.log(`✓ ${result.message}`);
  } else {
    console.error(`✗ ${result.message}`);
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
    default:
      console.error(`Unknown hook: ${hookName}`);
      process.exit(1);
  }
}

// Session management commands
async function sessionNew(name?: string): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.error("Not configured. Run: honcho-clawd init");
    process.exit(1);
  }

  const cwd = process.cwd();
  const { basename } = require("path");

  // Default to directory name if no name provided
  let sessionName = name;
  if (!sessionName) {
    sessionName = basename(cwd).toLowerCase().replace(/[^a-z0-9-_]/g, "-");
    console.log(`Using directory name as session: ${sessionName}`);
  }

  // Validate session name
  const validName = sessionName.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
  if (validName !== sessionName) {
    console.log(`Note: Session name normalized to: ${validName}`);
  }

  try {
    // Connect to Honcho
    const client = new Honcho({
      apiKey: config.apiKey,
      environment: "production",
    });

    const workspace = await client.workspaces.getOrCreate({
      id: config.workspace,
      metadata: { app: WORKSPACE_APP_TAG },
    });

    // Use getOrCreate - this will find existing session or create new one
    const session = await client.workspaces.sessions.getOrCreate(workspace.id, {
      id: validName,
      metadata: { cwd, updated_at: new Date().toISOString() },
    });

    // Check if this is an existing session with history
    let isExisting = false;
    try {
      const summaries = await client.workspaces.sessions.summaries(workspace.id, session.id);
      const s = summaries as any;
      if (s?.short_summary?.content || s?.long_summary?.content) {
        isExisting = true;
      }
    } catch {
      // No summaries = new session
    }

    // Ensure peers exist and configure observation
    await client.workspaces.peers.getOrCreate(workspace.id, { id: config.peerName });
    await client.workspaces.peers.getOrCreate(workspace.id, { id: config.claudePeer });

    try {
      await client.workspaces.sessions.peers.set(workspace.id, session.id, {
        [config.peerName]: { observe_me: true, observe_others: false },
        [config.claudePeer]: { observe_me: false, observe_others: true },
      });
    } catch {
      // Session peers API may not be available
    }

    // Store in local config
    setSessionForPath(cwd, validName);

    if (isExisting) {
      console.log(`✓ Connected to existing session: ${validName}`);
      console.log(`  Continuing from previous context...`);
    } else {
      console.log(`✓ Created new session: ${validName}`);
    }
    console.log(`  Workspace: ${config.workspace}`);
    console.log(`  Directory: ${cwd}`);
    console.log(`\nThis directory will now use session "${validName}" for Honcho memory.`);
  } catch (error) {
    console.error(`Failed to create/connect session: ${error}`);
    process.exit(1);
  }
}

async function sessionList(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.error("Not configured. Run: honcho-clawd init");
    process.exit(1);
  }

  console.log("\n📋 Honcho Sessions\n");

  // Show local mappings
  const localSessions = getAllSessions();
  const localCount = Object.keys(localSessions).length;

  if (localCount > 0) {
    console.log("Local directory mappings:");
    for (const [path, sessionName] of Object.entries(localSessions)) {
      const isCurrent = path === process.cwd() ? " (current)" : "";
      console.log(`  ${sessionName}${isCurrent}`);
      console.log(`    → ${path}`);
    }
  } else {
    console.log("No local session mappings yet.");
  }

  // Try to list sessions from Honcho
  try {
    const client = new Honcho({
      apiKey: config.apiKey,
      environment: "production",
    });

    const workspace = await client.workspaces.getOrCreate({
      id: config.workspace,
      metadata: { app: WORKSPACE_APP_TAG },
    });
    const sessions = await client.workspaces.sessions.list(workspace.id);

    if (sessions && Array.isArray(sessions)) {
      console.log(`\nAll sessions in workspace "${config.workspace}":`);
      for (const session of sessions.slice(0, 20)) {
        const s = session as any;
        console.log(`  - ${s.id}`);
      }
      if (sessions.length > 20) {
        console.log(`  ... and ${sessions.length - 20} more`);
      }
    }
  } catch {
    // Could not list from Honcho, just show local
  }

  console.log("");
}

function sessionCurrent(): void {
  const config = loadConfig();
  if (!config) {
    console.error("Not configured. Run: honcho-clawd init");
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
    console.log("\nTip: Use 'honcho-clawd session new <name>' to set a custom session name.");
  }

  console.log(`Workspace: ${config.workspace}`);
  console.log(`User: ${config.peerName}`);
  console.log(`AI: ${config.claudePeer}`);
  console.log("");
}

function sessionSwitch(name: string): void {
  const config = loadConfig();
  if (!config) {
    console.error("Not configured. Run: honcho-clawd init");
    process.exit(1);
  }

  if (!name) {
    console.error("Usage: honcho-clawd session switch <session-name>");
    process.exit(1);
  }

  const cwd = process.cwd();
  const oldSession = getSessionForPath(cwd);

  setSessionForPath(cwd, name);

  console.log(`✓ Switched session for current directory`);
  if (oldSession) {
    console.log(`  From: ${oldSession}`);
  }
  console.log(`  To: ${name}`);
  console.log(`\nNew Claude Code sessions in this directory will use "${name}".`);
}

function sessionClear(): void {
  const cwd = process.cwd();
  const currentSession = getSessionForPath(cwd);

  if (!currentSession) {
    console.log("No custom session set for this directory.");
    return;
  }

  removeSessionForPath(cwd);
  console.log(`✓ Cleared session mapping for this directory`);
  console.log(`  Was: ${currentSession}`);
  console.log("\nThis directory will now use the default session name.");
}

// Peer management commands
async function peerList(): Promise<void> {
  const config = loadConfig();
  if (!config) {
    console.error("Not configured. Run: honcho-clawd init");
    process.exit(1);
  }

  console.log("\n👥 Peers in Workspace\n");

  try {
    const client = new Honcho({
      apiKey: config.apiKey,
      environment: "production",
    });

    const workspace = await client.workspaces.getOrCreate({
      id: config.workspace,
      metadata: { app: WORKSPACE_APP_TAG },
    });
    const peers = await (client.workspaces as any).peers.list(workspace.id);

    if (peers && Array.isArray(peers)) {
      const userPeers = peers.filter((p: any) => !p.id.includes('clawd') && !p.id.includes('claude'));
      const aiPeers = peers.filter((p: any) => p.id.includes('clawd') || p.id.includes('claude'));

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
  honcho-clawd peer list     List all peers in workspace
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
  honcho-clawd session new [name]     Create/connect session (defaults to dir name)
  honcho-clawd session list           List all sessions
  honcho-clawd session current        Show current session
  honcho-clawd session switch <name>  Switch to existing session
  honcho-clawd session clear          Remove custom session for current directory
`);
  }
}

function showHelp(): void {
  console.log(`
honcho-clawd v${VERSION}
Persistent memory for Claude Code sessions using Honcho

Usage:
  honcho-clawd <command>

Commands:
  init        Configure honcho-clawd (name, API key, workspace)
  install     Install hooks to ~/.claude/settings.json
  uninstall   Remove hooks from Claude settings
  status      Show current configuration and hook status
  help        Show this help message

Session Commands:
  session new [name]     Create/connect Honcho session (defaults to dir name)
  session list           List all sessions
  session current        Show current session info
  session switch <name>  Switch to existing session
  session clear          Remove custom session mapping

Peer Commands:
  peer list              List all peers in workspace

Hook Commands (internal):
  hook session-start    Handle SessionStart event
  hook session-end      Handle SessionEnd event
  hook post-tool-use    Handle PostToolUse event
  hook user-prompt      Handle UserPromptSubmit event

Examples:
  honcho-clawd init                  # First-time setup
  honcho-clawd status                # Check if configured
  honcho-clawd session new           # Create session from dir name
  honcho-clawd session new myproject # Create named session

Learn more: https://docs.honcho.dev
`);
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
  case "status":
    status();
    break;
  case "session":
    await handleSession(args[1], args[2]);
    break;
  case "peer":
    await handlePeer(args[1], args[2]);
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
    console.log(`honcho-clawd v${VERSION}`);
    break;
  default:
    if (!command) {
      showHelp();
    } else {
      console.error(`Unknown command: ${command}`);
      console.log("Run: honcho-clawd help");
      process.exit(1);
    }
}

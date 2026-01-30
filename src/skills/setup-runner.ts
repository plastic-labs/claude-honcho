#!/usr/bin/env bun
/**
 * Runner script for the honcho-setup skill.
 * Interactive configuration for Honcho memory.
 */
import { createInterface } from "readline";
import {
  configExists,
  getConfigPath,
  loadConfig,
  saveConfig,
  type HonchoCLAUDEConfig,
  type HonchoEnvironment,
} from "../config.js";
import { Honcho } from "@honcho-ai/sdk";
import * as s from "../styles.js";

const WORKSPACE_APP_TAG = "honcho-plugin";

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

async function setup(): Promise<void> {
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

  // Step 1: API Key
  console.log(s.section("Step 1: Honcho API Key"));
  console.log(s.dim("Get your API key from https://app.honcho.dev"));
  console.log(s.dim(`Type ${s.highlight("local")} to use a local Honcho instance (http://localhost:8000)`));
  const apiKeyInput = await prompt("Enter your Honcho API key: ");
  if (!apiKeyInput) {
    console.error("Error: API key is required.");
    process.exit(1);
  }

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

  const baseUrl = endpointEnv === "local"
    ? "http://localhost:8000/v3"
    : "https://api.honcho.dev/v3";

  console.log(`Connecting to Honcho ${isLocal ? "(local)" : "(SaaS)"}...`);

  // Step 2: Workspace
  console.log("");
  console.log(s.section("Step 2: Workspace"));
  console.log(s.dim("Workspaces group your sessions and peers together."));

  let existingWorkspaces: Array<{ id: string; name: string }> = [];
  try {
    const tempHoncho = new Honcho({ apiKey, baseUrl, workspaceId: "_temp" });
    const workspaces = await tempHoncho.workspaces();
    if (workspaces && Array.isArray(workspaces)) {
      for (const ws of workspaces) {
        const metadata = (ws as any).metadata || {};
        if (metadata.app === WORKSPACE_APP_TAG) {
          existingWorkspaces.push({ id: ws.id, name: ws.id });
        }
      }
    }
  } catch {
    // workspaces() may not be available
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
      workspace = wsChoice;
    }
  } else {
    workspace = await prompt("Enter workspace name (default: claude_code): ") || "claude_code";
  }

  // Step 3: Peer Identity
  console.log("");
  console.log(s.section("Step 3: Peer Identity"));
  console.log(s.dim("Your peer name is how Honcho identifies you across sessions."));

  const defaultPeerName = process.env.USER || "user";
  const peerName = await prompt(`Enter your name/peer ID (default: ${defaultPeerName}): `) || defaultPeerName;

  if (!peerName) {
    console.error("Error: Peer name is required.");
    process.exit(1);
  }

  // Step 4: Claude's peer name
  console.log("");
  console.log(s.section("Step 4: Claude Configuration"));
  const claudePeer = await prompt("Enter Claude's peer name (default: claude): ") || "claude";

  // Step 5: Message saving
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

  console.log("");
  console.log(s.success("Setup complete!"));
  console.log("");
  console.log(s.dim(`Your sessions will now be saved to Honcho as ${s.highlight(peerName)}.`));
  console.log(s.dim(`Claude will be identified as ${s.highlight(claudePeer)}.`));
  console.log("");
  console.log("Start a new Claude Code session to begin using Honcho memory.");
  console.log("");
}

await setup();

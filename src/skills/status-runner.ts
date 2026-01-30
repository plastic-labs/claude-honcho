#!/usr/bin/env bun
/**
 * Runner script for the honcho-status skill.
 * Shows current Honcho memory status and configuration.
 */
import {
  loadConfig,
  getConfigPath,
  getEndpointInfo,
  isPluginEnabled,
  getClaudeSettingsPath,
} from "../config.js";
import { checkHooksInstalled, verifyCommandAvailable } from "../install.js";
import { loadIdCache, loadContextCache, getClaudeInstanceId } from "../cache.js";
import * as s from "../styles.js";

function status(): void {
  console.log("");
  console.log(s.header("honcho status"));
  console.log("");

  const config = loadConfig();
  if (!config) {
    console.log(s.warn("Not configured"));
    console.log(s.dim("Run: /honcho-setup or set HONCHO_API_KEY environment variable"));
    return;
  }

  const enabled = isPluginEnabled();
  console.log(s.section("Plugin Status"));
  console.log(`  ${s.label("Status")}:        ${enabled ? s.success("enabled") : s.warn("disabled")}`);
  console.log("");

  console.log(s.section("Configuration"));
  console.log(s.dim(getConfigPath()));
  console.log("");
  console.log(`  ${s.label("Peer name")}:     ${config.peerName}`);
  console.log(`  ${s.label("Claude peer")}:   ${config.claudePeer}`);
  console.log(`  ${s.label("Workspace")}:     ${config.workspace}`);
  console.log(`  ${s.label("Save messages")}: ${config.saveMessages !== false ? "enabled" : "disabled"}`);
  console.log(`  ${s.label("API key")}:       ${s.dim(config.apiKey.slice(0, 20) + "...")}`);

  // Endpoint info
  const endpointInfo = getEndpointInfo(config);
  console.log("");
  console.log(s.section("Endpoint"));
  console.log(`  ${s.label("Type")}:  ${endpointInfo.type}`);
  console.log(`  ${s.label("URL")}:   ${endpointInfo.url}`);

  // Cache status
  const idCache = loadIdCache();
  const contextCache = loadContextCache();
  const instanceId = getClaudeInstanceId();

  console.log("");
  console.log(s.section("Cache"));
  console.log(`  ${s.label("Instance ID")}: ${instanceId ? instanceId.slice(0, 12) + "..." : s.dim("(not set)")}`);
  if (idCache.workspace) {
    console.log(`  ${s.label("Workspace ID")}: ${idCache.workspace.id.slice(0, 8)}...`);
  }
  if (contextCache.userContext) {
    const age = Math.round((Date.now() - contextCache.userContext.fetchedAt) / 1000);
    console.log(`  ${s.label("Context age")}: ${age}s`);
  }

  // Hooks status (only relevant if using CLI mode)
  const hooksInstalled = checkHooksInstalled();
  console.log("");
  console.log(s.section("Hooks (CLI mode)"));
  console.log(`  ${s.label("Status")}:   ${hooksInstalled ? s.success("installed") : s.dim("not installed (using plugin mode)")}`);
  console.log(`  ${s.label("Location")}: ${s.dim(getClaudeSettingsPath())}`);

  console.log("");
}

status();

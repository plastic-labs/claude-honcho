#!/usr/bin/env bun
/**
 * Runner script for the status skill.
 * Minimal: connection, queue, conclusions.
 */
import { Honcho } from "@honcho-ai/sdk";
import { loadConfig, getHonchoClientOptions, getEndpointInfo } from "../config.js";
import * as s from "../styles.js";

async function status(): Promise<void> {
  console.log("");
  console.log(s.header("honcho status"));
  console.log("");

  const config = loadConfig();
  if (!config) {
    console.log(s.warn("Not configured"));
    console.log(s.dim("Set HONCHO_API_KEY environment variable"));
    return;
  }

  const endpointInfo = getEndpointInfo(config);

  try {
    const honcho = new Honcho(getHonchoClientOptions(config));
    const pingStart = Date.now();

    const [queueResult, conclusionsResult] = await Promise.allSettled([
      honcho.queueStatus(),
      honcho.peer(config.peerName).then((peer) => peer.conclusions.list()),
    ]);

    const latency = Date.now() - pingStart;
    console.log(`  ${s.label("Connection")}:  ${s.success("connected")} ${s.dim(`(${latency}ms)`)}`);
    console.log(`  ${s.label("Workspace")}:   ${config.workspace} ${s.dim(`@ ${endpointInfo.url}`)}`);
    console.log(`  ${s.label("Peers")}:       ${config.peerName} / ${config.aiPeer}`);

    // Observation queue — messages being processed into conclusions
    if (queueResult.status === "fulfilled") {
      const q = queueResult.value as any;
      const total = q.totalWorkUnits ?? 0;
      const completed = q.completedWorkUnits ?? 0;
      const inProgress = q.inProgressWorkUnits ?? 0;
      const sessionCount = q.sessions ? Object.keys(q.sessions).length : 0;
      if (total > 0) {
        const pct = Math.round((completed / total) * 100);
        let detail = `${completed}/${total} messages observed (${pct}%)`;
        if (inProgress > 0) detail += `, ${inProgress} active`;
        if (sessionCount > 0) detail += ` across ${sessionCount} sessions`;
        console.log(`  ${s.label("Observing")}:   ${detail}`);
      } else {
        console.log(`  ${s.label("Observing")}:   ${s.dim("idle")}`);
      }
    }

    // Conclusions
    if (conclusionsResult.status === "fulfilled") {
      const page = conclusionsResult.value as any;
      const total = page.total ?? page.items?.length ?? "?";
      console.log(`  ${s.label("Conclusions")}: ${total} ${s.dim(`(${config.peerName})`)}`);
    }
  } catch (err: any) {
    const message = err?.message || String(err);
    if (message.includes("401") || message.includes("Unauthorized")) {
      console.log(`  ${s.label("Connection")}:  ${s.error("auth failed")} ${s.dim("check API key")}`);
    } else if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
      console.log(`  ${s.label("Connection")}:  ${s.error("unreachable")} ${s.dim(endpointInfo.url)}`);
    } else {
      console.log(`  ${s.label("Connection")}:  ${s.error("failed")} ${s.dim(message.slice(0, 60))}`);
    }
  }

  console.log("");
}

status();

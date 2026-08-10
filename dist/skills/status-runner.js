#!/usr/bin/env bun
import {
  dim,
  error,
  header,
  label,
  require_dist,
  success,
  warn
} from "../chunk-d2gc13m0.js";
import"../chunk-xdntcesh.js";
import {
  __toESM,
  getEndpointInfo,
  getHonchoClientOptions,
  getSessionName,
  loadConfig
} from "../chunk-gnp95nzg.js";

// src/skills/status-runner.ts
var import_sdk = __toESM(require_dist(), 1);
async function status() {
  console.log("");
  console.log(header("honcho status"));
  console.log("");
  const config = loadConfig();
  if (!config) {
    console.log(warn("Not configured"));
    console.log(dim("Set HONCHO_API_KEY environment variable"));
    return;
  }
  const endpointInfo = getEndpointInfo(config);
  try {
    const honcho = new import_sdk.Honcho(getHonchoClientOptions(config));
    const pingStart = Date.now();
    const [queueResult, conclusionsResult] = await Promise.allSettled([
      honcho.queueStatus(),
      honcho.peer(config.peerName).then((peer) => peer.conclusions.list())
    ]);
    const latency = Date.now() - pingStart;
    if (queueResult.status === "rejected" && conclusionsResult.status === "rejected") {
      throw queueResult.reason;
    }
    console.log(`  ${label("Connection")}:  ${success("connected")} ${dim(`(${latency}ms)`)}`);
    console.log(`  ${label("Workspace")}:   ${config.workspace} ${dim(`@ ${endpointInfo.url}`)}`);
    console.log(`  ${label("Session")}:     ${getSessionName(process.cwd())}`);
    console.log(`  ${label("Peers")}:       ${config.peerName} / ${config.aiPeer}`);
    if (queueResult.status === "fulfilled") {
      const q = queueResult.value;
      const total = q.totalWorkUnits ?? 0;
      const completed = q.completedWorkUnits ?? 0;
      const inProgress = q.inProgressWorkUnits ?? 0;
      const sessionCount = q.sessions ? Object.keys(q.sessions).length : 0;
      if (total > 0) {
        const pct = Math.round(completed / total * 100);
        let detail = `${completed}/${total} messages observed (${pct}%)`;
        if (inProgress > 0)
          detail += `, ${inProgress} active`;
        if (sessionCount > 0)
          detail += ` across ${sessionCount} sessions`;
        console.log(`  ${label("Observing")}:   ${detail}`);
      } else {
        console.log(`  ${label("Observing")}:   ${dim("idle")}`);
      }
    }
    if (conclusionsResult.status === "fulfilled") {
      const page = conclusionsResult.value;
      const total = page.total ?? page.items?.length ?? "?";
      console.log(`  ${label("Conclusions")}: ${total} ${dim(`(${config.peerName})`)}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("401") || message.includes("Unauthorized")) {
      console.log(`  ${label("Connection")}:  ${error("auth failed")} ${dim("check API key")}`);
    } else if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
      console.log(`  ${label("Connection")}:  ${error("unreachable")} ${dim(endpointInfo.url)}`);
    } else {
      console.log(`  ${label("Connection")}:  ${error("failed")} ${dim(message.slice(0, 60))}`);
    }
  }
  console.log("");
}
status();

//# debugId=673F0FFE57BCD94064756E2164756E21
//# sourceMappingURL=status-runner.js.map

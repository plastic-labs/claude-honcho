// Pane data for hooks/register.tsx, which has no Node. Prints one JSON object.
import { loadConfig, getSessionName, getHonchoBaseUrl, getTelemetryHeaders, refreshCredential } from "../config.js";
import { createHonchoClient } from "../honcho-client.js";
import { honchoSessionUrl } from "../styles.js";
import { state, connectExisting, beginSignIn, pollSignIn, saveApiKey, saveName } from "./setup.js";

type Reply = { ok: true; [k: string]: unknown } | { ok: false; status?: number; error: string };

async function overview(): Promise<Reply> {
  const config = loadConfig();
  if (!config) return { ok: false, error: "Honcho is not configured; run /honcho setup" };
  const sessionName = getSessionName();
  try {
    const peer = await (await createHonchoClient(config)).peer(config.peerName);
    const card = await peer.getCard().catch(() => null);
    return {
      ok: true,
      session: sessionName,
      sessionUrl: sessionName ? honchoSessionUrl(config, sessionName) : null,
      card: card ?? [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = Number(message.match(/\b([45]\d\d)\b/)?.[1]) || undefined;
    return { ok: false, status, error: message.slice(0, 300) };
  }
}

// No SDK client for dreams yet, so call the API directly.
async function dreams(path: string, init: RequestInit = {}): Promise<Reply> {
  const config = loadConfig();
  if (!config) return { ok: false, error: "Honcho is not configured; run /honcho setup" };
  await refreshCredential(config);
  const base = getHonchoBaseUrl(config);
  let res: Response;
  try {
    res = await fetch(`${base}/workspaces/${encodeURIComponent(config.workspace)}${path}`, {
      ...init,
      headers: { ...getTelemetryHeaders(), Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    return { ok: false, error: `unreachable: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!res.ok) return { ok: false, status: res.status, error: (await res.text()).slice(0, 300) };
  return { ok: true, workspace: config.workspace, peer: config.peerName, data: await res.json() };
}

/** Runs one pane command and prints its reply as JSON. */
export async function run(cmd?: string, arg?: string): Promise<void> {
  const peerName = loadConfig()?.peerName;
  const reply =
    cmd === "overview" ? await overview()
    : cmd === "dreams-list"
      ? await dreams("/dreams/list?page=1&size=20", { method: "POST", body: JSON.stringify(peerName ? { observed_id: peerName } : {}) })
    : cmd === "dreams-get" && arg ? await dreams(`/dreams/${encodeURIComponent(arg)}`)
    : cmd === "setup-state" ? { ok: true, ...(await state()) }
    : cmd === "setup-connect" ? await connectExisting()
    : cmd === "signin-start" ? await beginSignIn()
    : cmd === "signin-check" ? await pollSignIn()
    // The key arrives on stdin so it never shows in a process list.
    : cmd === "setup-key" ? await saveApiKey(await new Response(process.stdin as any).text())
    : cmd === "setup-name" ? await saveName(await new Response(process.stdin as any).text())
    : { ok: false, error: `unknown command: ${cmd ?? ""}` };
  console.log(JSON.stringify(reply));
}

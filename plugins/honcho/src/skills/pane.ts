// Pane data for hooks/register.tsx, which has no Node. Prints one JSON object.
import { HonchoError, type Honcho } from "@honcho-ai/sdk";
import { loadConfig, getSessionName } from "../config.js";
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

// Dream history (Representation History). The pane renders the API's JSON as is.
async function dreams(read: (honcho: Honcho) => Promise<unknown>): Promise<Reply> {
  const config = loadConfig();
  if (!config) return { ok: false, error: "Honcho is not configured; run /honcho setup" };
  try {
    const data = await read(await createHonchoClient(config, { timeout: 15000 }));
    return { ok: true, workspace: config.workspace, peer: config.peerName, data };
  } catch (err) {
    // Timeouts and connection failures carry status 0.
    const status = err instanceof HonchoError && err.status > 0 ? err.status : undefined;
    return { ok: false, status, error: (err instanceof Error ? err.message : String(err)).slice(0, 300) };
  }
}

/** Runs one pane command and prints its reply as JSON. */
export async function run(cmd?: string, arg?: string): Promise<void> {
  const peerName = loadConfig()?.peerName;
  const reply =
    cmd === "overview" ? await overview()
    : cmd === "dreams-list"
      ? await dreams(async (honcho) => ({ items: (await honcho.dreams({ observed: peerName, page: 1, size: 20 })).items }))
    : cmd === "dreams-get" && arg ? await dreams((honcho) => honcho.getDream(arg))
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

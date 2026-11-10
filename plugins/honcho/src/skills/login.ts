import { spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { pollForToken, requestDeviceCode, saveGrant, OAuthError, type DeviceCode } from "@honcho-ai/harness-plugin-core";
import { getConfigDir, getConfigPath } from "../config.js";

const HOST = "claude_code";
const CLIENT_ID = "claude-honcho";
const SOURCE = "claude-code";
// Each check waits this long for approval; the pane keeps checking until it lands.
const CHECK_SECONDS = 15;

/** A sign-in started by one runner call and finished by a later one. */
interface Pending extends DeviceCode {
  expiresAt: number;
}

export type SignInStatus = "approved" | "waiting" | "denied" | "expired" | "error" | "none";

const pendingPath = () => join(getConfigDir(), "claude-honcho-signin.json");

function readPending(): Pending | null {
  try {
    const p = JSON.parse(readFileSync(pendingPath(), "utf-8")) as Pending;
    return p.expiresAt > Date.now() / 1000 ? p : null;
  } catch {
    return null;
  }
}

function clearPending(): void {
  if (existsSync(pendingPath())) unlinkSync(pendingPath());
}

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {
    // headless is expected; the pane shows the link
  }
}

/** Get a code and open the browser, without waiting for approval. */
export async function startSignIn(): Promise<{ url: string; code: string; expiresIn: number }> {
  const device = await requestDeviceCode({ clientId: CLIENT_ID, source: SOURCE });
  const pending: Pending = { ...device, expiresAt: Math.floor(Date.now() / 1000) + device.expiresIn };
  mkdirSync(getConfigDir(), { recursive: true }); // first run: ~/.honcho may not exist yet
  writeFileSync(pendingPath(), JSON.stringify(pending), { mode: 0o600 });
  openBrowser(device.verificationUriComplete);
  return { url: device.verificationUriComplete, code: device.userCode, expiresIn: device.expiresIn };
}

/** Wait briefly for approval and save the grant once it lands. */
export async function checkSignIn(): Promise<SignInStatus> {
  const pending = readPending();
  if (!pending) return "none";
  const remaining = pending.expiresAt - Math.floor(Date.now() / 1000);
  try {
    const tokens = await pollForToken(
      { ...pending, expiresIn: Math.min(remaining, CHECK_SECONDS) },
      { clientId: CLIENT_ID }
    );
    await saveGrant(getConfigPath(), HOST, tokens);
  } catch (e) {
    if (!(e instanceof OAuthError)) return "error";
    const code = e.code;
    if (code === "expired_token" && remaining > CHECK_SECONDS) return "waiting";
    clearPending();
    return code === "access_denied" ? "denied" : "expired";
  }
  clearPending();
  return "approved";
}

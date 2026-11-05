import { spawn } from "child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { isCloud, pollForToken, requestDeviceCode, saveGrant, OAuthError, type DeviceCode } from "@honcho-ai/harness-plugin-core";
import { getConfigDir, getConfigPath } from "../config.js";
import * as s from "../styles.js";

const HOST = "claude_code";
const CLIENT_ID = "claude-honcho";
const SOURCE = "claude-code";
// The finishing run only checks for approval briefly; the user approves first.
const FINISH_WAIT_SECONDS = 20;

/** A sign-in started by one setup run and finished by the next. */
interface Pending extends DeviceCode {
  expiresAt: number;
}

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

export function hasPendingSignIn(): boolean {
  return readPending() !== null;
}

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {
    // headless is expected; the link is printed
  }
}

/** Step 1: get a code, open the browser, print the link, and return without waiting. */
export async function startSignIn(origin: string): Promise<boolean> {
  if (!isCloud(origin)) {
    console.log(s.warn(`Browser sign-in only works with Honcho cloud; this plugin points at ${origin}.`));
    console.log(s.dim("  Use an API key instead."));
    return false;
  }
  let device: DeviceCode;
  try {
    device = await requestDeviceCode({ clientId: CLIENT_ID, source: SOURCE });
  } catch (e) {
    console.log(s.warn(`Could not start sign-in: ${e instanceof Error ? e.message : String(e)}`));
    return false;
  }
  const pending: Pending = { ...device, expiresAt: Math.floor(Date.now() / 1000) + device.expiresIn };
  writeFileSync(pendingPath(), JSON.stringify(pending), { mode: 0o600 });
  openBrowser(device.verificationUriComplete);

  console.log(s.section("Sign in to Honcho"));
  console.log(`  1. Open ${device.verificationUriComplete}`);
  console.log(`  2. Check the code matches: ${device.userCode}`);
  console.log("  3. Approve, then run /honcho:setup again to finish.");
  console.log(s.dim(`  The code expires in ${Math.round(device.expiresIn / 60)} minutes.`));
  return true;
}

/** Step 2: collect the approved sign-in and save it. False if it isn't approved yet. */
export async function finishSignIn(): Promise<boolean> {
  const pending = readPending();
  if (!pending) return false;
  const remaining = pending.expiresAt - Math.floor(Date.now() / 1000);
  try {
    const tokens = await pollForToken(
      { ...pending, expiresIn: Math.min(remaining, FINISH_WAIT_SECONDS) },
      { clientId: CLIENT_ID }
    );
    await saveGrant(getConfigPath(), HOST, tokens);
  } catch (e) {
    const code = e instanceof OAuthError ? e.code : "";
    if (code === "access_denied") {
      clearPending();
      console.log(s.warn("Sign-in was denied. Run /honcho:setup to choose again."));
    } else if (code === "expired_token" && remaining > FINISH_WAIT_SECONDS) {
      // our short wait ran out, but the code is still valid
      console.log(s.warn("Not approved yet."));
      console.log(`  Approve at ${pending.verificationUriComplete} (code ${pending.userCode}), then run /honcho:setup again.`);
    } else if (code === "expired_token" || code === "invalid_grant") {
      clearPending();
      console.log(s.warn("The sign-in code expired. Run /honcho:setup to start again."));
    } else {
      console.log(s.warn(`Sign-in failed: ${e instanceof Error ? e.message : String(e)}`));
    }
    return false;
  }
  clearPending();
  console.log(s.success("Signed in to Honcho"));
  console.log("");
  return true;
}

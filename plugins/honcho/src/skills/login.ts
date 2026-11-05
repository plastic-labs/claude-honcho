import { spawn } from "child_process";
import { isCloud, pollForToken, requestDeviceCode, saveGrant, OAuthError } from "@honcho-ai/harness-plugin-core";
import { getConfigPath } from "../config.js";
import * as s from "../styles.js";

const HOST = "claude_code";
const CLIENT_ID = "claude-honcho";
const SOURCE = "claude-code";
// Setup runs as one Bash call; stay under its default 2-minute timeout.
const WAIT_SECONDS = 110;

function openBrowser(url: string): void {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
  } catch {
    // headless is expected; the URL is printed
  }
}

/**
 * Device sign-in, like `honcho init`: print the code, open the browser, wait for
 * approval, store the grant in hosts.claude_code.oauth. Returns false if it did
 * not complete.
 */
export async function signIn(origin: string): Promise<boolean> {
  if (!isCloud(origin)) return false;

  let device;
  try {
    device = await requestDeviceCode({ clientId: CLIENT_ID, source: SOURCE });
  } catch (e) {
    console.log(s.warn(`Could not start sign-in: ${e instanceof Error ? e.message : String(e)}`));
    return false;
  }

  console.log(s.section("Sign in to Honcho"));
  console.log(`  Enter this code to authorize: ${device.userCode}`);
  console.log(`  at ${device.verificationUriComplete}`);
  openBrowser(device.verificationUriComplete);

  try {
    const tokens = await pollForToken({ ...device, expiresIn: Math.min(device.expiresIn, WAIT_SECONDS) }, { clientId: CLIENT_ID });
    await saveGrant(getConfigPath(), HOST, tokens);
  } catch (e) {
    const code = e instanceof OAuthError ? e.code : "";
    if (code === "access_denied") console.log(s.warn("Authorization denied."));
    // the server purges expired device codes, so a late poll gets invalid_grant
    else if (code === "expired_token" || code === "invalid_grant") console.log(s.warn("Not approved in time. Run /honcho:setup to try again."));
    else console.log(s.warn(`Sign-in failed: ${e instanceof Error ? e.message : String(e)}`));
    return false;
  }
  console.log(s.success("Signed in"));
  console.log("");
  return true;
}

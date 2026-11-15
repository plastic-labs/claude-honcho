import { Honcho, type Session } from "@honcho-ai/sdk";
import { getHonchoClientOptions, refreshCredential, type HonchoCLAUDEConfig, type HonchoClientOptions } from "./config.js";

/** Build a Honcho client after refreshing an OAuth token that is near expiry. */
export async function createHonchoClient(
  config: HonchoCLAUDEConfig,
  overrides: Partial<HonchoClientOptions> = {}
): Promise<Honcho> {
  await refreshCredential(config);
  return new Honcho({ ...getHonchoClientOptions(config), ...overrides });
}

/**
 * Get or create a session, joining `scopes` when given. A chat's own session
 * joins them when it is created. A session that a repo-local config shares
 * between chats can already hold messages, and sending scopes for such a
 * session again queues a backfill of all of them, so it joins only the scopes
 * it is not in yet.
 */
export async function openSession(honcho: Honcho, name: string, scopes?: string[], shared = false): Promise<Session> {
  if (!scopes) return honcho.session(name);
  if (!shared) return honcho.session(name, { scopes });
  const page = await honcho.sessions({ filters: { id: name }, includeScopes: true, size: 1 });
  const existing = page.items.find((s) => s.id === name);
  if (!existing) return honcho.session(name, { scopes });
  const missing = scopes.filter((s) => !(existing.scopes ?? []).includes(s));
  return missing.length ? honcho.session(name, { scopes: missing }) : honcho.session(name);
}

/**
 * Swap the bearer on an existing client. Peers and sessions keep a reference to
 * the client's HTTP object, so they pick it up too; building a new client
 * instead would leave them sending the old token.
 */
export function setClientApiKey(honcho: Honcho, token: string): void {
  (honcho.http as unknown as { apiKey: string }).apiKey = token;
}

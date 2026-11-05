import { Honcho } from "@honcho-ai/sdk";
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
 * Swap the bearer on an existing client. Peers and sessions keep a reference to
 * the client's HTTP object, so they pick it up too; building a new client
 * instead would leave them sending the old token.
 */
export function setClientApiKey(honcho: Honcho, token: string): void {
  (honcho.http as unknown as { apiKey: string }).apiKey = token;
}

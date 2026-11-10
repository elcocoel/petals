// A person's agent key (Elco, 9 Nov; agent-links.ts in @petal/agent makes them): it takes and reports that
// person's jobs and keeps layers in their projects, nothing else, and it's revocable. The wait over HTTP
// and take_job over MCP check it the same way, here.
import { createHash } from 'node:crypto';
import type { Store } from '@petal/store';

export const AGENT_KEY = /^petal_agent_[A-Za-z0-9_-]{43}$/;
/** A name an agent goes by: as join gives it, lower case with hyphens (claude-code, claude-app, chatgpt). */
export const AGENT_NAME_MAX = 60;

export const agentKeyHash = (token: string) =>
  createHash('sha256').update(token, 'utf8').digest('hex');

export const DISCONNECTED =
  'This agent was disconnected in Petals. To connect it again, the person copies the prompt from Petals into it again.';

/** A key's owner and when it was made; null for a bad, unknown or revoked one. */
export async function agentKeyOf(
  store: Store,
  token: string,
): Promise<{ owner: string; made: string } | null> {
  const t = token.trim();
  const link = AGENT_KEY.test(t) ? await store.agentLink.byTokenHash(agentKeyHash(t)) : null;
  return link && !link.revoked_at ? { owner: link.owner, made: link.created_at } : null;
}

/**
 * Whether the person disconnected this agent after this key was made (10 Nov). A key made after the
 * disconnection connects it again, and says so here.
 */
export async function disconnectedFor(
  store: Store,
  key: { owner: string; made: string },
  name: string,
  o: { reconnect?: boolean } = {},
): Promise<boolean> {
  const at = (await store.agent.get(key.owner, name))?.disconnected_at;
  if (!at) return false;
  if (at >= key.made) return true;
  if (o.reconnect) await store.agent.setDisconnected(key.owner, name, null);
  return false;
}

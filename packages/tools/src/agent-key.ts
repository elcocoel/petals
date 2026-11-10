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

/** Whose key this is; null for a bad, unknown or revoked one. */
export async function ownerOfAgentKey(store: Store, token: string): Promise<string | null> {
  const t = token.trim();
  const link = AGENT_KEY.test(t) ? await store.agentLink.byTokenHash(agentKeyHash(t)) : null;
  return link && !link.revoked_at ? link.owner : null;
}

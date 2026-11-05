// The first thing anyone sees: the agent, already talking (M-Talk). `/` and `/make` are the same
// page; ?run=<id> reopens a stored conversation.
import { headers } from 'next/headers';
import { agentPrompt, originFrom } from '../lib/agent-prompt.ts';
import { api } from '../lib/api.ts';
import type { ApiHealth } from '../lib/api-label.ts';
import { type OpeningFlower, openingMessage } from '../lib/opening.ts';
import { Chat } from './Chat.tsx';
import { CopyPrompt } from './CopyPrompt.tsx';

export async function AgentHome({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const run = Array.isArray(q.run) ? q.run[0] : q.run;
  const [health, listed] = await Promise.all([
    api<ApiHealth>('/api/v1/health'),
    api<{ flowers: OpeningFlower[] }>('/api/v1/flowers'),
  ]);
  const recorded = health.ok && health.value.llm === 'recorded';
  const origin = originFrom(await headers());
  return (
    <>
      {recorded && (
        <p style={{ border: '2px solid currentColor', padding: '0.75rem' }}>
          <strong>Recorded demo. No AI is running.</strong> This plays back one saved run about
          NEAR’s validators. It can’t read a question yet, so there’s nothing to type. The real
          agent switches on once a NEAR AI key is set.
        </p>
      )}
      <details>
        <summary>Use your own agent</summary>
        <p>Paste this into your own agent. It can use Petal with nothing to install:</p>
        <CopyPrompt prompt={agentPrompt(origin)} />
        <p className="muted">
          Agents that can make web requests can start straight away. Chat apps without that may need
          a connector: add <code>{origin}/mcp</code> in their settings.
        </p>
        <p className="muted">
          From a terminal, in a clone of Petal: <code>pnpm petal connect claude</code> or{' '}
          <code>pnpm petal connect codex</code>. <code>--dry-run</code> shows what it would change,
          and <code>--remove</code> undoes it.
        </p>
      </details>
      <Chat
        initialRun={run}
        recorded={recorded}
        opening={openingMessage(listed.ok ? listed.value.flowers : [])}
      />
    </>
  );
}

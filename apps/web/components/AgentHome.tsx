// The first thing anyone sees: the agent, already talking (M-Talk). `/` and `/make` are the same
// page; ?run=<id> reopens a stored conversation.
import { api } from '../lib/api.ts';
import type { ApiHealth } from '../lib/api-label.ts';
import { type OpeningFlower, openingMessage } from '../lib/opening.ts';
import { Chat } from './Chat.tsx';

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
        <p>
          Claude Code or Codex can run this search instead of this chat. In a clone of Petal, run:
        </p>
        <pre>
          <code>pnpm petal connect claude</code>
        </pre>
        <p className="muted">
          Or <code>pnpm petal connect codex</code>. It gives your agent Petal’s skill and tools.
          Then ask it who stands behind NEAR’s validators. <code>--dry-run</code> shows what it
          would change, and <code>--remove</code> undoes it.
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

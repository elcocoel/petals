// The workspace's page: the agent, already talking (M-Talk). ?run=<id> reopens a stored conversation,
// and the rest of the address says what the panel held (lib/workspace-url.ts).
import { api } from '../lib/api.ts';
import type { ApiHealth } from '../lib/api-label.ts';
import type { ListedFlower } from '../lib/flower-view.ts';
import { openingMessage } from '../lib/opening.ts';
import { openFromParams } from '../lib/workspace-url.ts';
import { Workspace } from './Workspace.tsx';

export async function AgentHome({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const run = Array.isArray(q.run) ? q.run[0] : q.run;
  const [health, listed] = await Promise.all([
    api<ApiHealth>('/api/v1/health'),
    api<{ flowers: ListedFlower[] }>('/api/v1/flowers'),
  ]);
  const recorded = health.ok && health.value.llm === 'recorded';
  const flowers = listed.ok ? listed.value.flowers : [];
  const { open, petal } = openFromParams(q);
  return (
    <Workspace
      initialRun={run}
      recorded={recorded}
      opening={openingMessage(flowers)}
      shelf={flowers}
      initialOpen={open}
      initialPetal={petal}
    />
  );
}

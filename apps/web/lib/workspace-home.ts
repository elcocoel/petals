// Server only. What a page holding the conversation needs before the first paint: whether a model is
// answering, what's on the shelf, and what its address asked to bring back (lib/workspace-url.ts).
import { api } from './api.ts';
import type { ApiHealth } from './api-label.ts';
import type { ListedFlower } from './flower-view.ts';
import { openingMessage } from './opening.ts';
import { openFromParams } from './workspace-url.ts';

export async function workspaceHome(q: Record<string, string | string[] | undefined>) {
  const run = Array.isArray(q.run) ? q.run[0] : q.run;
  const [health, listed] = await Promise.all([
    api<ApiHealth>('/api/v1/health'),
    api<{ flowers: ListedFlower[] }>('/api/v1/flowers'),
  ]);
  const recorded = health.ok && health.value.llm === 'recorded';
  const flowers = listed.ok ? listed.value.flowers : [];
  const { open, petal } = openFromParams(q);
  return {
    initialRun: run,
    recorded,
    opening: openingMessage(flowers),
    shelf: flowers,
    initialOpen: open,
    initialPetal: petal,
  };
}

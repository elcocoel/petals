// Server only. What a page holding the conversation needs before the first paint: whether a model is
// answering, what's on the shelf, and what its address asked to bring back (lib/workspace-url.ts). Nothing
// stands on the canvas until the conversation draws its own flower (Elco, 8 Nov: no flower hard-coded in).
import { type ApiResult, api } from './api.ts';
import type { ApiHealth } from './api-label.ts';
import type { Catalogue } from './composer-options.ts';
import type { ListedFlower } from './flower-view.ts';
import { type OpeningView, openingMessage } from './opening.ts';
import { openFromParams, questionFromParams } from './workspace-url.ts';

/**
 * Whether this site runs Petals' own agent for whoever signs in. On 8 Nov it stopped (STATUS.md, Decisions):
 * a person's own agent does the work. The one place that reads it. Assumed until SYSTEMS' public mode lands:
 * the health says agent_access none. An unreadable health keeps what the page did before.
 */
export const agentForVisitors = (health: ApiResult<ApiHealth>): boolean =>
  !(health.ok && health.value.agent_access === 'none');

export async function workspaceHome(q: Record<string, string | string[] | undefined>) {
  const run = Array.isArray(q.run) ? q.run[0] : q.run;
  const elsewhere = Array.isArray(q.elsewhere) ? q.elsewhere[0] : q.elsewhere;
  const [health, listed, catalogue, map] = await Promise.all([
    api<ApiHealth>('/api/v1/health'),
    api<{ flowers: ListedFlower[] }>('/api/v1/flowers'),
    api<Catalogue>('/api/v1/catalogue'),
    api<{ views: OpeningView[] }>('/api/v1/map/views'),
  ]);
  const recorded = health.ok && health.value.llm === 'recorded';
  const flowers = listed.ok ? listed.value.flowers : [];
  const { open, petal } = openFromParams(q);
  return {
    initialRun: run,
    agentForVisitors: agentForVisitors(health),
    initialElsewhere: elsewhere,
    catalogue: catalogue.ok ? catalogue.value : null,
    initialQuestion: questionFromParams(q),
    recorded,
    opening: openingMessage(map.ok ? map.value.views : []),
    shelf: flowers,
    initialOpen: open,
    initialPetal: petal,
  };
}

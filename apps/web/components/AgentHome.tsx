// The workspace's page: the agent, already talking (M-Talk). ?run=<id> reopens a stored conversation,
// and the rest of the address says what the panel held (lib/workspace-url.ts).
import { workspaceHome } from '../lib/workspace-home.ts';
import { Workspace } from './Workspace.tsx';

export async function AgentHome({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <Workspace {...(await workspaceHome(await searchParams))} />;
}

// The workspace: the flower is the page and the conversation floats over it. Runs link here
// (run.resume_url), and the landing's questions arrive here as ?q=. The rest of the address says what
// the conversation held (lib/workspace-url.ts).
import { headers } from 'next/headers';
import { InteractionSurface } from '../../flower/InteractionSurface.tsx';
import { agentPrompt, originFrom } from '../../lib/agent-prompt.ts';
import { workspaceHome } from '../../lib/workspace-home.ts';

export const dynamic = 'force-dynamic';

type Query = Record<string, string | string[] | undefined>;

export default async function MakePage({ searchParams }: { searchParams: Promise<Query> }) {
  const q = await searchParams;
  return (
    <InteractionSurface
      {...(await workspaceHome(q))}
      agentPrompt={agentPrompt(originFrom(await headers()))}
      // Elco's open choices, read from the address until they're chosen: ?box=ink and ?order=scatter.
      surface={q.box === 'ink' ? 'ink' : 'ground'}
      scatter={q.order === 'scatter'}
      // W10's proof: the person's own agent in a terminal on their computer, through the Petals helper.
      terminal={q.terminal === '1'}
      // An instrument for checking by script. It stays out of production, like the lab.
      probe={
        q.probe === '1' && (process.env.NODE_ENV !== 'production' || process.env.PETAL_LAB === '1')
      }
    />
  );
}

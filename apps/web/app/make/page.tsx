// The workspace: the flower is the page and the conversation floats over it. Runs link here
// (run.resume_url), and the landing's questions arrive here as ?q=. The rest of the address says what
// the conversation held (lib/workspace-url.ts).
import { InteractionSurface } from '../../flower/InteractionSurface.tsx';
import { workspaceHome } from '../../lib/workspace-home.ts';

export const dynamic = 'force-dynamic';

type Query = Record<string, string | string[] | undefined>;

export default async function MakePage({ searchParams }: { searchParams: Promise<Query> }) {
  const q = await searchParams;
  return (
    <InteractionSurface
      {...(await workspaceHome(q))}
      // Elco's open choices, read from the address until they're chosen: ?box=ink and ?order=scatter.
      surface={q.box === 'ink' ? 'ink' : 'ground'}
      scatter={q.order === 'scatter'}
      // An instrument for checking by script. It stays out of production, like the lab.
      probe={
        q.probe === '1' && (process.env.NODE_ENV !== 'production' || process.env.PETAL_LAB === '1')
      }
    />
  );
}

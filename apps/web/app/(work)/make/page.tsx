// The workspace: the flower is the page and the conversation floats over it. Runs link here
// (run.resume_url), and the landing's questions arrive here as ?q=. The rest of the address says what
// the conversation held (lib/workspace-url.ts).
import { headers } from 'next/headers';
import { InteractionSurface } from '../../../flower/InteractionSurface.tsx';
import { api } from '../../../lib/api.ts';
import type { ApiHealth } from '../../../lib/api-label.ts';
import { viewerView } from '../../../lib/viewer-view.ts';
import { workspaceHome } from '../../../lib/workspace-home.ts';
import { conversationAt, questionFromParams } from '../../../lib/workspace-url.ts';
import { OpenedConversation } from './OpenedConversation.tsx';
import { SignedOut } from './SignedOut.tsx';

export const dynamic = 'force-dynamic';

type Query = Record<string, string | string[] | undefined>;

/** A server that plays a recorded run plays it for anyone, signed in or not. */
async function recordedHere(): Promise<boolean> {
  const health = await api<ApiHealth>('/api/v1/health');
  return health.ok && health.value.llm === 'recorded';
}

export default async function MakePage({ searchParams }: { searchParams: Promise<Query> }) {
  const q = await searchParams;
  // Signed out, /make is the oops page (Elco, 11 Nov, #78: "i dont think signed out make has a reason to
  // exist?"). /api/v1/me answers only for a person with a wallet. Another door's conversation (?elsewhere=)
  // needs no wallet here, and a recorded run plays for anyone.
  const me = await api<{ person_id: string }>('/api/v1/me', {
    cookie: (await headers()).get('cookie'),
  });
  if (!me.ok && !q.elsewhere && !(await recordedHere())) {
    return <SignedOut question={questionFromParams(q) ?? ''} />;
  }
  const person = await viewerView();
  return (
    // A conversation opened by a move (a link, New, back or forward) starts clean (design/minimally-good.md,
    // rule 3), inside the panel that stays; a refresh of this page's data keeps the one that's open.
    <OpenedConversation opens={conversationAt(q)}>
      <InteractionSurface
        {...(await workspaceHome(q, person.hash))}
        // Elco's open choices, read from the address until they're chosen: ?box=ink and ?order=scatter.
        surface={q.box === 'ink' ? 'ink' : 'ground'}
        scatter={q.order === 'scatter'}
        // An instrument for checking by script. It stays out of production, like the lab.
        probe={
          q.probe === '1' &&
          (process.env.NODE_ENV !== 'production' || process.env.PETAL_LAB === '1')
        }
      />
    </OpenedConversation>
  );
}

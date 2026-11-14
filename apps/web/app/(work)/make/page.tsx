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

/** The session holds an invite that can still pay (GET /api/v1/auth/invite). */
async function inviteActive(cookie: string | null): Promise<boolean> {
  const got = await api<{ invite: { status: string } | null }>('/api/v1/auth/invite', { cookie });
  return got.ok && got.value.invite?.status === 'active';
}

/** A server that plays a recorded run plays it for anyone, signed in or not. */
async function recordedHere(): Promise<boolean> {
  const health = await api<ApiHealth>('/api/v1/health');
  return health.ok && health.value.llm === 'recorded';
}

export default async function MakePage({ searchParams }: { searchParams: Promise<Query> }) {
  const q = await searchParams;
  // Signed out, /make is the oops page. /api/v1/me answers only for a person with a wallet. Another door's
  // conversation (?elsewhere=) needs no wallet here, and a recorded run plays for anyone. A visitor whose
  // session holds a funded invite (POST /api/v1/auth/invite) is let in with no wallet: the invite pays for their
  // chats, as the server's chat admits them, and the session keeps their work.
  const cookie = (await headers()).get('cookie');
  const me = await api<{ person_id: string }>('/api/v1/me', { cookie });
  const invited = !me.ok && (await inviteActive(cookie));
  if (!me.ok && !invited && !q.elsewhere && !(await recordedHere())) {
    return <SignedOut question={questionFromParams(q) ?? ''} />;
  }
  const person = await viewerView();
  return (
    // A conversation opened by a move (a link, New, back or forward) starts clean, inside the
    // panel that stays; a refresh of this page's data keeps the one that's open.
    <OpenedConversation opens={conversationAt(q)}>
      <InteractionSurface
        {...(await workspaceHome(q, person.hash))}
        invited={invited}
        // Open choices of look, read from the address: ?box=ink and ?order=scatter.
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

'use client';
// /make for someone not logged in (#78, 11 Nov): the oops page, wired to signing in. Connecting reloads the
// page, which then holds the conversation, with a question that came with the link waiting in it.
import { NotSignedIn } from '../../../components/workspace/NotSignedIn.tsx';
import { useSession } from '../../../viewmodels/useSession.ts';

export function SignedOut({ question }: { question: string }) {
  const session = useSession(false);
  return (
    <div className="flex min-h-dvh flex-col">
      <NotSignedIn
        question={question}
        busy={session.busy}
        failed={session.failed}
        onConnect={session.connect}
        // an Ethereum wallet's way in, beside NEAR's (wave 5, LOBBY's connectEvm)
        onConnectEvm={session.connectEvm}
        // and a Solana wallet's (wave 5, LOBBY's connectSolana)
        onConnectSolana={session.connectSolana}
      />
    </div>
  );
}

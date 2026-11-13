'use client';
// /make for someone not logged in: the oops page, wired to signing in. Connecting reloads the
// page, which then holds the conversation, with a question that came with the link waiting in it.
import { NotSignedIn } from '../../../components/workspace/NotSignedIn.tsx';
import { WalletAsk } from '../../../components/workspace/WalletAsk.tsx';
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
        // an Ethereum wallet's way in, beside NEAR's
        onConnectEvm={() => session.connectEvm()}
        // and a Solana wallet's
        onConnectSolana={() => session.connectSolana()}
        ask={
          <WalletAsk
            pick={session.pick?.wallets ?? null}
            qr={session.qr}
            waitingFor={session.waitingFor}
            onChoose={session.choose}
            onStop={session.stop}
          />
        }
      />
    </div>
  );
}

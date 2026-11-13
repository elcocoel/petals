// The front door (T206): the wallet opens on the front page when someone asks, and
// connecting lands in their own lobby, not in a conversation. Every way into the app from the landing is
// the door: Ask Petals, the Ask box and its questions. Signed in, they go straight through. Closing the
// picker leaves them where they were. The picker is near-connect's, so nothing here draws.
import { useEffect } from 'react';
import { sessionClient } from '../lib/agent-client.ts';
import { siteLinks } from '../lib/site-links.ts';
import { SIGN_IN_NETWORK, signPrepared } from '../lib/wallet.ts';
import { signIn } from './useSession.ts';

const intoApp = (url: URL) =>
  url.origin === window.location.origin &&
  (url.pathname === siteLinks.make || url.pathname === siteLinks.lobby);

export function useFrontDoor(): void {
  useEffect(() => {
    // null until the server says: a click before then goes through, and the lobby sends a visitor back here.
    let signedIn: boolean | null = null;
    let busy = false;
    void sessionClient.me().then(
      (a) => {
        signedIn = Boolean(a);
      },
      () => {
        signedIn = false;
      },
    );
    // Connecting lands in the lobby, whatever link asked: a question from the landing has no conversation
    // to wait in on a site that runs no agent for visitors.
    const enter = () => {
      if (busy) return;
      busy = true;
      void signIn({
        client: sessionClient,
        sign: (challenge) => signPrepared({ ...challenge, entry_sha256: '' }, SIGN_IN_NETWORK),
        arrived: () => window.location.assign(siteLinks.lobby),
        // Where a failure shows on the front page is an open question.
        failed: (words) => console.warn(words),
      }).finally(() => {
        busy = false;
      });
    };
    const onClick = (e: MouseEvent) => {
      if (signedIn !== false || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (!(a instanceof HTMLAnchorElement)) return;
      const url = new URL(a.href);
      if (!intoApp(url)) return;
      e.preventDefault();
      enter();
    };
    const onSubmit = (e: SubmitEvent) => {
      if (signedIn !== false || !(e.target instanceof HTMLFormElement)) return;
      const url = new URL(e.target.action);
      if (!intoApp(url)) return;
      e.preventDefault();
      enter();
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('submit', onSubmit, true);
    };
  }, []);
}

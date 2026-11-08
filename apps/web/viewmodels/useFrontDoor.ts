// A proposal for Elco (8 Nov), on m-face/fe-frontdoor only, not merged: the wallet opens on the front page
// when someone asks, and they arrive in the app signed in. Every way into /make from the landing is the
// door: Ask Petals, the Ask box and its questions. Signed in, they go straight through. Closing the picker
// leaves them where they were. The picker is near-connect's, so nothing here draws.
import { useEffect } from 'react';
import { sessionClient } from '../lib/agent-client.ts';
import { SIGN_IN_NETWORK, signPrepared } from '../lib/wallet.ts';
import { signIn } from './useSession.ts';

const intoApp = (url: URL) => url.origin === window.location.origin && url.pathname === '/make';

export function useFrontDoor(): void {
  useEffect(() => {
    // null until the server says: a click before then goes through, to /make's own Connect wallet.
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
    const enter = (to: string) => {
      if (busy) return;
      busy = true;
      void signIn({
        client: sessionClient,
        sign: (challenge) => signPrepared({ ...challenge, entry_sha256: '' }, SIGN_IN_NETWORK),
        arrived: () => window.location.assign(to),
        // Where a failure shows on the front page is an open question (design/journey-strings.md).
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
      enter(url.pathname + url.search);
    };
    const onSubmit = (e: SubmitEvent) => {
      if (signedIn !== false || !(e.target instanceof HTMLFormElement)) return;
      const url = new URL(e.target.action);
      if (!intoApp(url)) return;
      e.preventDefault();
      const query = new URLSearchParams();
      for (const [k, v] of new FormData(e.target)) if (typeof v === 'string') query.append(k, v);
      enter(`${url.pathname}?${query}`);
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('submit', onSubmit, true);
    };
  }, []);
}

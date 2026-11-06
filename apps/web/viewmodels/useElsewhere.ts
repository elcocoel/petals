// A conversation happening in another agent, read from the browser. It reads when the page opens, when
// the person comes back to this tab, and when the server signals a change, while the tab is visible.
// There is no timer: the server pushes only when the agent did something.
// A link's token is claimed first if it can be, which puts the work in their list and leaves the token out
// of the address from then on.
import { useEffect, useRef, useState } from 'react';
import { claimElsewhere, listenElsewhere, readElsewhere } from '../lib/agent-client.ts';
import { type ElsewhereRead, isOwnId } from '../lib/elsewhere.ts';

export function useElsewhere(from: string | null): {
  ref: string | null;
  read: ElsewhereRead | null;
} {
  const [ref, setRef] = useState(from);
  const [read, setRead] = useState<ElsewhereRead | null>(null);
  // A link is claimed once. A second try, before the first has set its session, would be refused.
  const claims = useRef(new Map<string, Promise<string | null>>());
  useEffect(() => {
    if (!ref) return;
    let gone = false;
    const look = () =>
      void readElsewhere(ref).then(
        (next) => {
          if (!gone) setRead(next);
        },
        (e) => {
          if (!gone) setRead({ failed: e instanceof Error ? e.message : String(e) });
        },
      );
    // Its first signal comes on connecting, so a page that was away reads what it missed.
    let stop = () => {};
    const listen = () => {
      stop();
      stop = () => {};
      if (document.visibilityState === 'visible' && isOwnId(ref)) stop = listenElsewhere(ref, look);
    };
    const back = () => {
      if (document.visibilityState === 'visible') look();
      listen();
    };
    if (isOwnId(ref)) listen();
    else {
      const claim = claims.current.get(ref) ?? claimElsewhere(ref);
      claims.current.set(ref, claim);
      void claim.then(
        (id) => {
          if (gone) return;
          if (id) setRef(id);
          else look();
        },
        () => {
          if (!gone) look();
        },
      );
    }
    const focused = () => look();
    window.addEventListener('focus', focused);
    document.addEventListener('visibilitychange', back);
    return () => {
      gone = true;
      stop();
      window.removeEventListener('focus', focused);
      document.removeEventListener('visibilitychange', back);
    };
  }, [ref]);
  return { ref, read };
}

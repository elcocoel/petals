// A conversation happening in another agent, read from the browser. It reads when the page opens and when
// the person comes back to this tab: there is no timer, so a window left beside the agent stays as it was.
// A link's token is claimed first if it can be, which puts the work in their list and leaves the token out
// of the address from then on.
import { useEffect, useRef, useState } from 'react';
import { claimElsewhere, readElsewhere } from '../lib/agent-client.ts';
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
    const back = () => {
      if (document.visibilityState === 'visible') look();
    };
    if (isOwnId(ref)) look();
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
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);
    return () => {
      gone = true;
      window.removeEventListener('focus', back);
      document.removeEventListener('visibilitychange', back);
    };
  }, [ref]);
  return { ref, read };
}

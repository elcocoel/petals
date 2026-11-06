// A conversation happening in another agent, read from the browser. It reads when the page opens and when
// the person comes back to this tab: there is no timer, so a window left beside the agent stays as it was.
import { useEffect, useState } from 'react';
import { readElsewhere } from '../lib/agent-client.ts';
import type { ElsewhereRead } from '../lib/elsewhere.ts';

export function useElsewhere(ref: string | null): ElsewhereRead | null {
  const [read, setRead] = useState<ElsewhereRead | null>(null);
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
    look();
    window.addEventListener('focus', back);
    document.addEventListener('visibilitychange', back);
    return () => {
      gone = true;
      window.removeEventListener('focus', back);
      document.removeEventListener('visibilitychange', back);
    };
  }, [ref]);
  return read;
}

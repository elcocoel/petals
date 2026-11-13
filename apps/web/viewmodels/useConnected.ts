// Who's connected, for a page that only needs to know: the session's account, read once from the server and
// shared by every caller on the page, so the nav's Connect and the hero's ask once. A visitor, or a server that
// doesn't answer, reads as no one; the signing flow lives in useSession and isn't loaded for this.
import { useEffect, useState } from 'react';
import { sessionClient } from '../lib/agent-client.ts';

let asked: Promise<string | null> | null = null;

/**
 * The connected account, or null while it's being read and when no one is connected. A person holding several
 * wallets is named by the first, since a button has room for one.
 */
export function useConnected(): string | null {
  const [account, setAccount] = useState<string | null>(null);
  useEffect(() => {
    let gone = false;
    asked ??= sessionClient
      .me()
      .then((who) => who?.split('  ·  ')[0] || null)
      .catch(() => null);
    void asked.then((who) => {
      if (!gone) setAccount(who);
    });
    return () => {
      gone = true;
    };
  }, []);
  return account;
}

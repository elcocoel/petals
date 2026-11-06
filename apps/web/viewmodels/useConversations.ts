// A person's conversations, read from the browser, where their session is. `when` says when to read again:
// it changes because a person did something, and null means there's nothing to read. There is no timer.
import { useEffect, useState } from 'react';
import { listConversations } from '../lib/agent-client.ts';
import type { ListedConversation } from '../lib/conversation-list.ts';

export function useConversations(when: string | null): ListedConversation[] {
  const [listed, setListed] = useState<ListedConversation[]>([]);
  useEffect(() => {
    if (when === null) return;
    let gone = false;
    void listConversations().then(
      (next) => {
        if (!gone) setListed(next);
      },
      // no answer leaves the list as it was
      () => {},
    );
    return () => {
      gone = true;
    };
  }, [when]);
  return listed;
}

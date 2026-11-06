// A conversation's stored settings and which model answered last, for the composer. Read when it opens and
// when a turn ends here: nothing runs on a timer.
import { useEffect, useState } from 'react';
import { type ConversationFacts, readConversationFacts } from '../lib/agent-client.ts';

export function useConversationFacts(id: string | null, busy: boolean): ConversationFacts | null {
  const [facts, setFacts] = useState<ConversationFacts | null>(null);
  useEffect(() => {
    if (!id || busy) return;
    let gone = false;
    void readConversationFacts(id).then(
      (next) => {
        if (!gone) setFacts(next);
      },
      // no answer leaves what's shown as it was
      () => {},
    );
    return () => {
      gone = true;
    };
  }, [id, busy]);
  return facts;
}

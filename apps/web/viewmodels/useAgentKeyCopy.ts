// The one prompt's door on /connect (Elco's fix 1, 10 Nov): who's here, and the copy the menu's "Copy for
// your agents" makes, agentWords.prompt with a fresh agent key. Each copy mints a key of its own, so pasting
// into one more agent never cuts off another.
import { useState } from 'react';
import { mintAgentLink } from '../lib/agent-client.ts';
import { agentWords } from '../lib/agents.ts';
import { useSession } from './useSession.ts';

export function useAgentKeyCopy() {
  const session = useSession(true);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const { token } = await mintAgentLink();
    await navigator.clipboard.writeText(agentWords.prompt(window.location.origin, token));
    setCopied(true);
  };
  return {
    known: session.known,
    signedIn: Boolean(session.account),
    busy: session.busy,
    failed: session.failed,
    copied,
    connect: session.connect,
    copy: () => void copy().catch(() => {}),
  };
}

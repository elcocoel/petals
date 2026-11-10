// The work menu's own state, the same on the lobby and the workspace (WorkMenu): open or folded, the
// person's agents and what each is doing, and the one prompt that connects another (Elco, 9 Nov, the first
// full test). The agents are read when the page opens and again whenever `fresh` changes: a run ending, or
// a conversation's change signal. No timer.
import { useCallback, useEffect, useState } from 'react';
import { disconnectAgent, mintAgentLink, readAgents } from '../lib/agent-client.ts';
import { agentRows, agentWords, type ConnectedAgent } from '../lib/agents.ts';

export function useWorkMenu(signedIn: boolean, fresh: unknown = null) {
  // box.fold: the menu starts open, as an IDE's does, and folds away by hand
  const [open, setOpen] = useState(true);
  const [agents, setAgents] = useState<ConnectedAgent[]>([]);
  const [copied, setCopied] = useState(false);
  // a read again after a disconnect, so the list says what's true
  const [reads, setReads] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `fresh` is the signal to read again
  useEffect(() => {
    if (!signedIn) return;
    let gone = false;
    void readAgents().then(
      (list) => {
        if (!gone) setAgents(list);
      },
      () => {},
    );
    return () => {
      gone = true;
    };
  }, [signedIn, fresh, reads]);

  // each copy carries a new link of its own, so pasting into one more agent never cuts off another
  const copy = useCallback(async () => {
    const { token } = await mintAgentLink();
    await navigator.clipboard.writeText(agentWords.prompt(window.location.origin, token));
    setCopied(true);
  }, []);

  const disconnect = useCallback(async (name: string) => {
    await disconnectAgent(name).catch(() => null);
    setReads((n) => n + 1);
  }, []);

  return {
    open,
    fold: () => setOpen(false),
    unfold: () => setOpen(true),
    agents: agentRows(agents),
    copied,
    copy: () => void copy().catch(() => {}),
    disconnect: (name: string) => void disconnect(name),
  };
}

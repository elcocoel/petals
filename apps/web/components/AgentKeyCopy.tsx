'use client';
// The one prompt's door on /connect (Elco's fix 1, 10 Nov): what the menu's "Copy for your agents" copies,
// with a fresh agent key (useAgentKeyCopy), so an agent connected from here joins the account. The key
// belongs to someone, so a visitor connects first; signing in reloads the page, and the button is here.
import { agentWords } from '../lib/agents.ts';
import { doorWords } from '../lib/door-words.ts';
import { useAgentKeyCopy } from '../viewmodels/useAgentKeyCopy.ts';
import { Button } from './ui/Button.tsx';

export function AgentKeyCopy() {
  const door = useAgentKeyCopy();
  // Until the server has said who's here, nothing offers to copy or to connect.
  if (!door.known) return null;
  if (!door.signedIn) {
    return (
      <>
        <Button disabled={door.busy} onClick={door.connect}>
          {doorWords.connect}
        </Button>
        {door.failed && <p className="error">{door.failed}</p>}
      </>
    );
  }
  return <Button onClick={door.copy}>{door.copied ? agentWords.copied : agentWords.copy}</Button>;
}

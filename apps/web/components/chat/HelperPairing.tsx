// Before the person's own agent is on the page: one click per agent through Petals Helper.app, the
// first-time paste that sets the helper up, and a field for a code the helper printed. Props only:
// viewmodels/useAgentChat.ts holds the line. Words from lib/terminal-pass.ts, proposed.
import { AGENTS, type AgentId, type TermPhase, terminalWords } from '../../lib/terminal-pass.ts';
import { CopyPrompt } from '../CopyPrompt.tsx';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';

export function HelperPairing({
  command,
  phase,
  code,
  failed,
  ended,
  onCode,
  onPair,
  onStart,
}: {
  /** The one line that fetches Petals' file and starts the helper (lib/agent-prompt.ts). */
  command: string;
  phase: TermPhase;
  code: string;
  /** Why the last try didn't work. */
  failed: string | null;
  /** Said when the agent has stopped. */
  ended: string;
  onCode: (code: string) => void;
  onPair: () => void;
  onStart: (agent: AgentId) => void;
}) {
  return (
    <form
      className="flex flex-col items-start gap-text-gap px-block-gap pt-text-gap pb-block-gap"
      onSubmit={(e) => {
        e.preventDefault();
        onPair();
      }}
    >
      {phase === 'ended' && <p className="my-0 type-body">{ended}</p>}
      <p className="my-0 type-label">{terminalWords.startButton}</p>
      <ActionRow gap="tight">
        {AGENTS.map((a, i) => (
          <Button
            key={a.id}
            variant={i === 0 ? 'primary' : 'secondary'}
            disabled={phase === 'connecting'}
            onClick={() => onStart(a.id)}
          >
            {a.name}
          </Button>
        ))}
      </ActionRow>
      {failed && <p className="my-0 type-caption text-muted">{failed}</p>}
      <p className="my-0 type-body">{terminalWords.start}</p>
      <CopyPrompt prompt={command} label={terminalWords.copy} />
      <p className="my-0 type-caption text-muted">{terminalWords.orCode}</p>
      <label className="flex items-center gap-text-gap">
        <span className="type-label">{terminalWords.code}</span>
        <input
          value={code}
          onChange={(e) => onCode(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="border border-hairline bg-transparent px-space-8 py-space-4 type-mono text-primary"
        />
      </label>
      <Button type="submit" disabled={phase === 'connecting'}>
        {terminalWords.connect}
      </Button>
    </form>
  );
}

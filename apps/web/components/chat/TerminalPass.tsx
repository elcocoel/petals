// The terminal in the page (lib/terminal-pass.ts): the person's own agent, running on their own computer
// under the Petals helper, shown in a box over the canvas. Until it's paired: one click per agent, the
// first-time paste, and a field for a code. Props only: viewmodels/useTerminalPass.ts holds the terminal
// and the line.
import '@xterm/xterm/css/xterm.css';
import type { RefCallback } from 'react';
import { AGENTS, type AgentId, type TermPhase, terminalWords } from '../../lib/terminal-pass.ts';
import { CopyPrompt } from '../CopyPrompt.tsx';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';

export function TerminalPass({
  command,
  phase,
  code,
  failed,
  mount,
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
  /** Where the terminal is drawn. */
  mount: RefCallback<HTMLDivElement>;
  onCode: (code: string) => void;
  onPair: () => void;
  /** One click: Petals Helper.app starts this agent, once the first paste has put it on this computer. */
  onStart: (agent: AgentId) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {phase !== 'open' && (
        <form
          className="flex flex-col items-start gap-text-gap px-block-gap pt-text-gap pb-block-gap"
          onSubmit={(e) => {
            e.preventDefault();
            onPair();
          }}
        >
          {phase === 'ended' && <p className="my-0 type-body">{terminalWords.ended}</p>}
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
      )}
      {/* Set in Mono code, so the terminal takes Petals' type (packages/tokens/terminal.ts). */}
      <div
        ref={mount}
        className="min-h-0 flex-1 px-block-gap pt-text-gap pb-block-gap type-mono-code"
      />
    </div>
  );
}

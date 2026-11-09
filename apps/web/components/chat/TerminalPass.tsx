// The terminal in the page (lib/terminal-pass.ts): the person's own agent, running on their own computer
// under the Petals helper, shown in a box over the canvas. Until it's paired, the way to start the helper
// and a field for its code. Props only: viewmodels/useTerminalPass.ts holds the terminal and the line.
import '@xterm/xterm/css/xterm.css';
import type { RefCallback } from 'react';
import { type TermPhase, terminalWords } from '../../lib/terminal-pass.ts';
import { Button } from '../ui/Button.tsx';
import { Mono } from '../ui/Mono.tsx';

export function TerminalPass({
  command,
  phase,
  code,
  failed,
  mount,
  onCode,
  onPair,
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
          <p className="my-0 type-body">
            {phase === 'ended' ? terminalWords.ended : terminalWords.start}
          </p>
          <span className="wrap-anywhere">
            <Mono>{command}</Mono>
          </span>
          {failed && <p className="my-0 type-caption text-muted">{failed}</p>}
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
      <div ref={mount} className="min-h-0 flex-1 px-text-gap pb-text-gap" />
    </div>
  );
}

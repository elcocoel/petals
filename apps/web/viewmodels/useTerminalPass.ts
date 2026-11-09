// The terminal in the page (lib/terminal-pass.ts): it holds the terminal drawing and the line to the Petals
// helper on the person's own computer. Each connection is a new session with a fresh code from the
// person's terminal: the helper ends the agent when the line closes, and never reattaches (CONNECTORS's
// seam, 9 Nov). Nothing here reaches Petals' server. It connects when the helper opened this page with its
// code in the address, or when a person types the code and presses Connect.
import type { Terminal } from '@xterm/xterm';
import { type RefCallback, useCallback, useRef, useState } from 'react';
import { openTerminalLine, type TerminalLine } from '../lib/agent-client.ts';
import {
  helloFrame,
  helperUrl,
  pairFromHash,
  pairingCode,
  readControl,
  resizeFrame,
  type TermPhase,
  terminalWords,
} from '../lib/terminal-pass.ts';

export function useTerminalPass() {
  const [phase, setPhase] = useState<TermPhase>('pair');
  const [code, setCode] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const term = useRef<Terminal | null>(null);
  const line = useRef<TerminalLine | null>(null);
  const live = useRef(false);

  const connect = useCallback((pair: string, port?: number) => {
    const t = term.current;
    if (!t) return;
    line.current?.close();
    live.current = false;
    setPhase('connecting');
    setFailed(null);
    let answered = false;
    const next = openTerminalLine(
      helperUrl(port),
      helloFrame(pair, { cols: t.cols, rows: t.rows }),
      {
        bytes: (b) => t.write(b),
        text: (text) => {
          const m = readControl(text);
          if (!m) return;
          answered = true;
          if (m.kind === 'paired') {
            live.current = true;
            setPhase('open');
            t.focus();
          } else if (m.kind === 'exit') {
            live.current = false;
            setPhase('ended');
          } else {
            // a wrong or used code: ask for the next one
            setFailed(terminalWords.refused);
            setPhase('pair');
          }
        },
        closed: () => {
          live.current = false;
          if (!answered) {
            setFailed(terminalWords.noHelper);
            setPhase('pair');
          } else setPhase((p) => (p === 'open' ? 'ended' : p));
        },
      },
    );
    line.current = next;
  }, []);

  // The terminal is drawn once its box is on the page, and gone with it (React 19 calls the cleanup).
  const mount: RefCallback<HTMLDivElement> = useCallback(
    (el) => {
      if (!el) return;
      let gone = false;
      let watching: ResizeObserver | null = null;
      void Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]).then(
        ([{ Terminal }, { FitAddon }]) => {
          if (gone || term.current) return;
          // the box's own type and colours, from the tokens, so the terminal sits in the system
          const css = getComputedStyle(el);
          const v = (name: string) => css.getPropertyValue(name).trim();
          const t = new Terminal({
            fontFamily: v('--font-mono') || 'monospace',
            fontSize: Number.parseFloat(css.fontSize),
            cursorBlink: true,
            theme: {
              background: v('--color-surface'),
              foreground: v('--color-primary'),
              cursor: v('--color-accent'),
            },
          });
          const fit = new FitAddon();
          t.loadAddon(fit);
          t.open(el);
          fit.fit();
          t.onData((d) => {
            if (live.current) line.current?.send(d);
          });
          t.onResize((size) => {
            if (live.current) line.current?.send(resizeFrame(size));
          });
          watching = new ResizeObserver(() => fit.fit());
          watching.observe(el);
          term.current = t;
          // The helper opened this page with its code in the fragment: connect with nothing typed, and take
          // the code out of the address at once, so it isn't kept or shared.
          const fromLink = pairFromHash(window.location.hash);
          if (fromLink) {
            window.history.replaceState(
              null,
              '',
              window.location.pathname + window.location.search,
            );
            connect(fromLink.code, fromLink.port);
          }
        },
      );
      return () => {
        gone = true;
        watching?.disconnect();
        line.current?.close();
        line.current = null;
        live.current = false;
        term.current?.dispose();
        term.current = null;
      };
    },
    [connect],
  );

  return {
    phase,
    code,
    failed,
    mount,
    setCode,
    pair: () => {
      const c = pairingCode(code);
      if (c) {
        setCode('');
        connect(c);
      }
    },
  };
}

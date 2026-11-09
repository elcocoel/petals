// The terminal in the page (lib/terminal-pass.ts): it holds the terminal drawing and the line to the Petals
// helper on the person's own computer. A token the helper gave back is kept in this browser, so a reload
// pairs again without a new code while the helper runs. Each connection is a new session: the helper ends
// the agent when the line closes, and never reattaches (CONNECTORS's seam, 9 Nov). Nothing here reaches
// Petals' server. Reads and connects only because a person did something: opening the page, or Connect.
import type { Terminal } from '@xterm/xterm';
import { type RefCallback, useCallback, useRef, useState } from 'react';
import { openTerminalLine, type TerminalLine } from '../lib/agent-client.ts';
import {
  helloFrame,
  helperUrl,
  type Pass,
  pairingCode,
  readControl,
  resizeFrame,
  type TermPhase,
  terminalWords,
} from '../lib/terminal-pass.ts';

const TOKEN_KEY = 'petals-helper-token';

const kept = {
  read: (): string | null => {
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  write: (token: string | null) => {
    try {
      if (token) window.localStorage.setItem(TOKEN_KEY, token);
      else window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      // a browser that keeps nothing asks for a code each time
    }
  },
};

export function useTerminalPass() {
  const [phase, setPhase] = useState<TermPhase>('pair');
  const [code, setCode] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const term = useRef<Terminal | null>(null);
  const line = useRef<TerminalLine | null>(null);
  const live = useRef(false);

  const connect = useCallback((pass: Pass) => {
    const t = term.current;
    if (!t) return;
    line.current?.close();
    live.current = false;
    setPhase('connecting');
    setFailed(null);
    let answered = false;
    const next = openTerminalLine(helperUrl(), helloFrame(pass, { cols: t.cols, rows: t.rows }), {
      bytes: (b) => t.write(b),
      text: (text) => {
        const m = readControl(text);
        if (!m) return;
        answered = true;
        if (m.kind === 'paired') {
          kept.write(m.token);
          live.current = true;
          setPhase('open');
          t.focus();
        } else if (m.kind === 'exit') {
          live.current = false;
          setPhase('ended');
        } else {
          // a token the helper doesn't know (it restarted) or a wrong code: ask for a code
          kept.write(null);
          setFailed('token' in pass ? null : terminalWords.refused);
          setPhase('pair');
        }
      },
      closed: () => {
        live.current = false;
        if (!answered) {
          setFailed('token' in pass ? null : terminalWords.noHelper);
          setPhase('pair');
        } else setPhase((p) => (p === 'open' ? 'ended' : p));
      },
    });
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
          const token = kept.read();
          if (token) connect({ token });
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
      const token = kept.read();
      if (c) connect({ pair: c });
      else if (token) connect({ token });
    },
  };
}

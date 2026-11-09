// The terminal in the page (lib/terminal-pass.ts): it holds the terminal drawing and the line to the Petals
// helper on the person's own computer. Each connection is a new session with a fresh code from the
// person's terminal: the helper ends the agent when the line closes, and never reattaches (CONNECTORS's
// seam, 9 Nov). It connects when the helper opened this page with its code in the address, or when a
// person types the code and presses Connect.
//
// The agent writes into the page's own conversation, so its flowers land on the canvas behind the box
// (Elco, 9 Nov). A signed-in person's first pairing starts a conversation of theirs and reloads the page
// on it (`?elsewhere=`, the same following the page already does for another agent), with the code kept in
// the fragment; from then on each pairing hands the helper a continue link to that conversation. With
// nobody signed in, the agent starts its own and says where it is.
import { terminalCursor, terminalTheme } from '@petal/tokens';
import type { Terminal } from '@xterm/xterm';
import { type RefCallback, useCallback, useEffect, useRef, useState } from 'react';
import {
  continueLinkFor,
  openTerminalLine,
  startOwnConversation,
  type TerminalLine,
} from '../lib/agent-client.ts';
import {
  type AgentId,
  codeFrom,
  HELPER_PORT,
  helloFrame,
  helperUrl,
  pairFromHash,
  pairingCode,
  readControl,
  resizeFrame,
  START_RETRY_MS,
  START_WAIT_MS,
  startAddress,
  startFromHash,
  startLink,
  type TermPhase,
  terminalAddress,
  terminalWords,
} from '../lib/terminal-pass.ts';

export function useTerminalPass({
  conversation,
  known,
  signedIn,
}: {
  /** The conversation this page follows (`?elsewhere=`), if any. */
  conversation: string | null;
  /** The server has said who's here. */
  known: boolean;
  signedIn: boolean;
}) {
  const [phase, setPhase] = useState<TermPhase>('pair');
  const [code, setCode] = useState('');
  const [failed, setFailed] = useState<string | null>(null);
  const [drawn, setDrawn] = useState(false);
  const term = useRef<Terminal | null>(null);
  const line = useRef<TerminalLine | null>(null);
  const live = useRef(false);
  // A code from the address waits here until the terminal is drawn and the server has said who's here.
  const waiting = useRef<
    { kind: 'pair'; code: string; port: number } | { kind: 'start'; agent: AgentId } | null
  >(null);

  const connect = useCallback(
    (pair: string, port: number, exploration: string | null, absent?: () => void) => {
      const t = term.current;
      if (!t) return;
      line.current?.close();
      live.current = false;
      setPhase('connecting');
      setFailed(null);
      let answered = false;
      const next = openTerminalLine(
        helperUrl(port),
        helloFrame(pair, { cols: t.cols, rows: t.rows }, exploration),
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
            if (answered) setPhase((p) => (p === 'open' ? 'ended' : p));
            else if (absent) absent();
            else {
              setFailed(terminalWords.noHelper);
              setPhase('pair');
            }
          },
        },
      );
      line.current = next;
    },
    [],
  );

  const begin = useCallback(
    async (pair: string, port: number) => {
      setPhase('connecting');
      setFailed(null);
      if (!conversation && signedIn) {
        const id = await startOwnConversation(terminalWords.conversation, terminalWords.client);
        if (id) {
          // the same page on that conversation, with the code still in the fragment
          window.location.replace(terminalAddress(window.location.pathname, id, pair, port));
          return;
        }
      }
      const link = conversation ? await continueLinkFor(conversation) : null;
      connect(pair, port, link);
    },
    [conversation, signedIn, connect],
  );

  // One click: the page makes the code, opens petals:// so Petals Helper.app starts the helper with it, and
  // keeps trying the line while it starts. Nothing answering for a few seconds means the app isn't on this
  // computer yet, and the first-time paste is the way. A signed-in page with no conversation makes one
  // first and reloads onto it, then starts.
  const start = useCallback(
    async (agent: AgentId) => {
      setPhase('connecting');
      setFailed(null);
      if (!conversation && signedIn) {
        const id = await startOwnConversation(terminalWords.conversation, terminalWords.client);
        if (id) {
          window.location.replace(startAddress(window.location.pathname, id, agent));
          return;
        }
      }
      const pair = codeFrom(crypto.getRandomValues(new Uint8Array(20)));
      const link = conversation ? await continueLinkFor(conversation) : null;
      window.location.assign(startLink(pair, agent));
      const until = Date.now() + START_WAIT_MS;
      const attempt = () =>
        connect(pair, HELPER_PORT, link, () => {
          if (Date.now() < until) window.setTimeout(attempt, START_RETRY_MS);
          else {
            setFailed(terminalWords.notInstalled);
            setPhase('pair');
          }
        });
      attempt();
    },
    [conversation, signedIn, connect],
  );

  useEffect(() => {
    const w = waiting.current;
    if (!w || !drawn || !known) return;
    waiting.current = null;
    if (w.kind === 'pair') void begin(w.code, w.port);
    else void start(w.agent);
  }, [drawn, known, begin, start]);

  // The terminal is drawn once its box is on the page, and gone with it (React 19 calls the cleanup).
  const mount: RefCallback<HTMLDivElement> = useCallback((el) => {
    if (!el) return;
    let gone = false;
    let watching: ResizeObserver | null = null;
    // The helper opened this page with its code in the fragment: take it out of the address at once, so
    // it isn't kept or shared, and connect with nothing typed.
    const fromLink = pairFromHash(window.location.hash);
    const toStart = startFromHash(window.location.hash);
    if (fromLink) waiting.current = { kind: 'pair', ...fromLink };
    else if (toStart) waiting.current = { kind: 'start', agent: toStart };
    if (fromLink || toStart) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    void Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]).then(
      ([{ Terminal }, { FitAddon }]) => {
        if (gone || term.current) return;
        // Petals' look, from the tokens (packages/tokens/terminal.ts): the type the box is set in, and
        // each colour from its role on the box's own surface.
        const css = getComputedStyle(el);
        const size = Number.parseFloat(css.fontSize);
        const theme = Object.fromEntries(
          Object.entries(terminalTheme).map(([key, role]) => [
            key,
            // the role's own variable, which a surface flips where it's set
            css.getPropertyValue(`--${role}`).trim(),
          ]),
        );
        const t = new Terminal({
          fontFamily: css.fontFamily,
          fontSize: size,
          lineHeight: Number.parseFloat(css.lineHeight) / size,
          cursorStyle: terminalCursor.style,
          cursorBlink: terminalCursor.blink,
          theme,
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
        setDrawn(true);
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
      setDrawn(false);
    };
  }, []);

  return {
    phase,
    code,
    failed,
    mount,
    setCode,
    start: (agent: AgentId) => void start(agent),
    pair: () => {
      const c = pairingCode(code);
      if (c) {
        setCode('');
        void begin(c, HELPER_PORT);
      }
    },
  };
}

// The chat in the box (lib/agent-chat.ts): the line to the Petals helper on the person's own computer, and
// what the person's agent said, folded into a chat. It replaced the raw terminal (Elco, 9 Nov). Each
// connection is a new session with a fresh code: one click opens petals:// with a code the page makes, the
// helper's own link opens this page with its code, or a person types the code the helper printed.
//
// The agent writes into the page's own conversation, so its flowers land on the canvas behind the box. A
// signed-in person's first pairing starts a conversation of theirs and reloads the page on it
// (`?elsewhere=`), asking again from the fragment; from then on each pairing hands the helper a continue
// link to that conversation. With nobody signed in, the agent starts its own and says where it is.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  answered,
  asked,
  type ChatState,
  chatHello,
  emptyChat,
  foldChat,
  helperChatUrl,
  toHelper,
} from '../lib/agent-chat.ts';
import {
  continueLinkFor,
  openTerminalLine,
  startOwnConversation,
  type TerminalLine,
} from '../lib/agent-client.ts';
import { isOwnId } from '../lib/elsewhere.ts';
import {
  type AgentId,
  codeFrom,
  HELPER_PORT,
  pairFromHash,
  pairingCode,
  START_RETRY_MS,
  START_WAIT_MS,
  startAddress,
  startFromHash,
  startLink,
  type TermPhase,
  terminalAddress,
  terminalWords,
} from '../lib/terminal-pass.ts';

export function useAgentChat({
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
  const [chat, setChat] = useState<ChatState>(emptyChat);
  const [draft, setDraft] = useState('');
  // the model list under the input, open or not
  const [picking, setPicking] = useState(false);
  const line = useRef<TerminalLine | null>(null);
  const thread = useRef<HTMLDivElement | null>(null);
  const following = useRef(true);
  // A code or a start from the address waits here until the server has said who's here.
  const waiting = useRef<
    { kind: 'pair'; code: string; port: number } | { kind: 'start'; agent: AgentId } | null
  >(null);

  const connect = useCallback(
    (pair: string, port: number, exploration: string | null, absent?: () => void) => {
      line.current?.close();
      setPhase('connecting');
      setFailed(null);
      setChat(emptyChat);
      let answeredOnce = false;
      const own = conversation && isOwnId(conversation) ? conversation : null;
      line.current = openTerminalLine(helperChatUrl(port), chatHello(pair, exploration, own), {
        bytes: () => {},
        text: (text) => {
          answeredOnce = true;
          setChat((s) => {
            const next = foldChat(s, text);
            if (next.paired && !s.paired) setPhase('open');
            return next;
          });
        },
        closed: (codeOf) => {
          if (answeredOnce) {
            setChat((s) => ({ ...s, busy: false, permission: null }));
            // closed after pairing is the end of the session; refused before it is a code that didn't work
            setPhase((p) => (p === 'open' ? 'ended' : 'pair'));
            if (codeOf === 4401) setFailed(terminalWords.refused);
          } else if (absent) absent();
          else {
            setFailed(terminalWords.noHelper);
            setPhase('pair');
          }
        },
      });
    },
    [conversation],
  );

  const begin = useCallback(
    async (pair: string, port: number) => {
      setPhase('connecting');
      setFailed(null);
      if (!conversation && signedIn) {
        const id = await startOwnConversation(terminalWords.conversation, terminalWords.client);
        if (id) {
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
  // keeps trying the line while it starts (a bounded retry after a click, not a timer that stays). Nothing
  // answering for a few seconds means the app isn't on this computer yet, and the first-time paste is the way.
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

  // The helper opened this page with its code, or the page reloaded onto a new conversation to start: take
  // it out of the address at once, so it isn't kept or shared, and go on once the server says who's here.
  // Read before any effect runs: the workspace writes the address in its own, and that drops the fragment.
  useLayoutEffect(() => {
    const fromLink = pairFromHash(window.location.hash);
    const toStart = startFromHash(window.location.hash);
    if (fromLink) waiting.current = { kind: 'pair', ...fromLink };
    else if (toStart) waiting.current = { kind: 'start', agent: toStart };
    if (fromLink || toStart) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    // No clean-up closes the line: the page holding the chat doesn't go away while it's used, and a
    // development double mount would close the line the first mount had just opened.
  }, []);

  useEffect(() => {
    const w = waiting.current;
    if (!w || !known) return;
    waiting.current = null;
    if (w.kind === 'pair') void begin(w.code, w.port);
    else void start(w.agent);
  }, [known, begin, start]);

  return {
    phase,
    code,
    failed,
    chat,
    draft,
    picking,
    refs: { thread, following },
    setCode,
    setDraft,
    pair: () => {
      const c = pairingCode(code);
      if (c) {
        setCode('');
        void begin(c, HELPER_PORT);
      }
    },
    start: (agent: AgentId) => void start(agent),
    send: () => {
      const text = draft.trim();
      if (!text || chat.busy || phase !== 'open') return;
      line.current?.send(toHelper.prompt(text));
      setChat((s) => asked(s, text));
      setDraft('');
      following.current = true;
    },
    stop: () => line.current?.send(toHelper.cancel()),
    answer: (optionId: string | null) => {
      const p = chat.permission;
      if (!p) return;
      line.current?.send(toHelper.permission(p.id, optionId));
      setChat(answered);
    },
    setMode: (id: string) => line.current?.send(toHelper.mode(id)),
    togglePicking: () => setPicking((p) => !p),
    setModel: (id: string) => {
      line.current?.send(toHelper.model(id));
      setPicking(false);
    },
  };
}

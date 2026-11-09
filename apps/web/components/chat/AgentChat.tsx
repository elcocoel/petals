// The chat in the box (lib/agent-chat.ts; Elco, 9 Nov: "an input box, the chat above it, proper
// typography, show context"): the person's own agent, typeset in Petals' type. What it says, its thinking
// and its tool calls kept quiet and open for anyone who wants them, its plan, a question about a tool as
// buttons, and the input at the foot with the model, the context used and the mode. Props only:
// viewmodels/useAgentChat.ts holds the line and the chat.
import type { RefObject } from 'react';
import {
  agentName,
  type ChatItem,
  type ChatState,
  chatWords,
  contextUsed,
} from '../../lib/agent-chat.ts';
import { parseMarkdown } from '../../lib/markdown.ts';
import { Markdown } from '../Markdown.tsx';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';
import { Composer } from './Composer.tsx';
import { Speech } from './Speech.tsx';
import { useFollowScroll } from './useFollowScroll.ts';

function Row({ item, speaker }: { item: ChatItem; speaker: string | undefined }) {
  switch (item.kind) {
    case 'user':
      return <Speech speaker={speaker}>{item.text}</Speech>;
    case 'agent':
      return (
        <Speech speaker={speaker} agent>
          <Markdown blocks={parseMarkdown(item.text)} />
        </Speech>
      );
    case 'thought':
      return (
        <details data-quiet className="type-caption text-muted">
          <summary>{chatWords.thinking}</summary>
          <p className="my-0 whitespace-pre-wrap">{item.text}</p>
        </details>
      );
    case 'tool':
      return (
        <details data-quiet className="type-mono text-muted">
          <summary>
            {item.title} · {item.status}
          </summary>
          {item.detail && (
            <pre className="my-0 whitespace-pre-wrap wrap-anywhere">{item.detail}</pre>
          )}
        </details>
      );
    case 'plan':
      return (
        <ol data-quiet className="my-0 type-mono text-muted">
          {item.entries.map((e, k) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a plan is replaced whole, never reordered
            <li key={k}>
              {e.content} · {e.status.replace('_', ' ')}
            </li>
          ))}
        </ol>
      );
  }
}

/** Who speaks, said once where the same one goes on speaking. */
function speakers(items: ChatItem[], agent: string): (string | undefined)[] {
  let last = '';
  return items.map((it) => {
    const who = it.kind === 'user' ? chatWords.you : it.kind === 'agent' ? agent : '';
    if (!who) return undefined;
    const said = who === last ? undefined : who;
    last = who;
    return said;
  });
}

export function AgentChat({
  chat,
  draft,
  threadRef,
  following,
  onDraft,
  onSend,
  onStop,
  onAnswer,
  onMode,
  onModel,
}: {
  chat: ChatState;
  draft: string;
  threadRef: RefObject<HTMLDivElement | null>;
  /** Whether the reader is at the newest line, so the chat keeps them there. */
  following: RefObject<boolean>;
  onDraft: (text: string) => void;
  onSend: () => void;
  onStop: () => void;
  /** An option's id, or null to say no to the whole question. */
  onAnswer: (optionId: string | null) => void;
  onMode: (id: string) => void;
  onModel: (id: string) => void;
}) {
  // follows the newest line from when the chat is on the page, unless the reader scrolled up
  useFollowScroll(threadRef, following);
  const name = agentName(chat.agent);
  const who = speakers(chat.items, name);
  const pct = contextUsed(chat.usage);
  const modes = chat.mode.available;
  const at = modes.findIndex((m) => m.id === chat.mode.current);
  const nextMode = modes.length > 1 ? modes[(at + 1) % modes.length] : undefined;
  const models = chat.models.available;
  const atModel = models.findIndex((m) => m.id === chat.models.current);
  const nextModel = models.length > 1 ? models[(atModel + 1) % models.length] : undefined;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto overscroll-none px-block-gap">
        <div className="flex flex-col gap-block-gap py-block-gap">
          {chat.items.map((item, i) => (
            <Row key={item.key} item={item} speaker={who[i]} />
          ))}
          {chat.permission && (
            <div className="flex flex-col gap-text-gap border border-hairline p-text-gap">
              <p className="my-0 type-label">
                {chatWords.asks}: {chat.permission.title}
              </p>
              <ActionRow gap="tight">
                {chat.permission.options.map((o) => (
                  <Button
                    key={o.optionId}
                    variant={o.kind.startsWith('allow') ? 'primary' : 'secondary'}
                    onClick={() => onAnswer(o.optionId)}
                  >
                    {o.name}
                  </Button>
                ))}
              </ActionRow>
            </div>
          )}
          {chat.error && <p className="my-0 type-caption text-muted">{chat.error}</p>}
        </div>
      </div>
      <Composer
        view={{
          value: draft,
          readOnly: false,
          label: chatWords.placeholder,
          placeholder: chatWords.placeholder,
          button: chat.busy ? chatWords.stop : chatWords.send,
          disabled: !chat.busy && !draft.trim(),
        }}
        className="px-block-gap pt-text-gap pb-block-gap"
        controls={
          <span className="flex flex-wrap items-center gap-space-8">
            {nextModel ? (
              <Button variant="pill" onClick={() => onModel(nextModel.id)}>
                {chat.model}
              </Button>
            ) : (
              chat.model && <span className="type-mono text-muted">{chat.model}</span>
            )}
            {pct !== null && <span className="type-mono text-muted">{chatWords.context(pct)}</span>}
            {nextMode && (
              <Button variant="pill" onClick={() => onMode(nextMode.id)}>
                {modes[at]?.name ?? chat.mode.current}
              </Button>
            )}
          </span>
        }
        onChange={onDraft}
        onSend={chat.busy ? onStop : onSend}
      />
    </div>
  );
}

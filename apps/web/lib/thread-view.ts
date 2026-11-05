// The thread as a person reads it: pure projection from the chat's state to rows, with every
// decision made and every word chosen. The views under components/chat only lay these out, so a
// redesign replaces them without touching a decision.
import type { FlowerResult, ModelSignature } from '@petal/core/types';
import { type Block as MarkdownBlock, parseMarkdown } from './markdown.ts';
import { blocksOf, type ChatState, type Done, type Step } from './thread.ts';

/** What the recorded run (fixtures/transcripts/skeleton.json) was really asked. */
export const RECORDED_QUESTION =
  "Who stands behind NEAR's validators? Make me a fresh flower with their backers, not an existing one.";

/** A line with its small marks: which words are code, which are a link. */
export type Segment =
  | { t: 'text'; v: string }
  | { t: 'code'; v: string }
  | { t: 'a'; v: string; href: string };

const text = (v: string): Segment => ({ t: 'text', v });
const code = (v: string): Segment => ({ t: 'code', v });

/** T168: which model really answered, and whether the answer has an enclave signature. */
export function answeredBy(done: Done, signature: ModelSignature | null): Segment[] {
  if (done.model === 'recorded') return [text('Recorded run: no model answered just now.')];
  if (done.turns === 0) return [text('No model answered.')];
  const report = signature?.attestation?.report_url;
  const enclave: Segment[] =
    signature?.signature_kind === 'provider_tee'
      ? [
          text(`Enclave signature: yes (${signature.signature_kind}, signer `),
          code(signature.signing_address),
          ...(report
            ? [text(', '), { t: 'a', v: 'attestation report', href: report } as const]
            : []),
          text(').'),
        ]
      : signature
        ? [
            text(
              'Enclave signature: no. It has only a gateway signature, which does not prove which model answered.',
            ),
          ]
        : [
            text(
              'Enclave signature: no. NEAR AI gave no signature for this answer, so nothing proves which model wrote it. Only models with enclave attestation get one.',
            ),
          ];
  return [
    text('Answered by '),
    code(done.model),
    text(`${done.fallback_used ? ' (a fallback: the first-choice model did not answer)' : ''}. `),
    ...enclave,
    text(
      ` ${done.turns} model ${done.turns === 1 ? 'call' : 'calls'}, $${done.cost_usd.toFixed(4)}.`,
    ),
  ];
}

export type StepRow =
  | { kind: 'stage'; stage: string; message: string }
  | { kind: 'progress'; text: string }
  | { kind: 'tool'; name: string; status: string; args: string };

function stepRow(s: Step): StepRow {
  switch (s.kind) {
    case 'stage':
      return { kind: 'stage', stage: s.stage, message: s.message };
    case 'progress':
      return {
        kind: 'progress',
        text: `${s.message}${s.total ? ` (${s.done ?? 0}/${s.total})` : ''}`,
      };
    case 'tool':
      return {
        kind: 'tool',
        name: s.name,
        status: s.result
          ? `${s.result.ok ? 'ok' : 'failed'}: ${s.result.summary} (${s.result.ms} ms)`
          : '…',
        args: JSON.stringify(s.args, null, 2),
      };
  }
}

export interface FlowerRow {
  kind: 'flower';
  key: string;
  flower: FlowerResult;
  signature: ModelSignature | null;
  /** what the signature line says when there is no signature */
  model?: string;
  /** the answer has no link to this flower, so the card gives it */
  showLink: boolean;
  /** only on the run's latest flower: publishing takes the run's draft */
  publishUrl?: string;
  checks: string;
}

export interface TurnRow {
  kind: 'turn';
  key: string;
  stage: ChatState['turn'];
  text: string;
  /** a lost turn offers to follow its run again */
  refollow?: { label: string; disabled: boolean };
}

export type Row =
  | { kind: 'user' | 'note' | 'error'; key: string; text: string }
  | { kind: 'steps'; key: string; summary: string; steps: StepRow[] }
  | { kind: 'message'; key: string; blocks: MarkdownBlock[] }
  | { kind: 'done'; key: string; line: Segment[] }
  | FlowerRow
  | TurnRow;

export type ThreadInput = Pick<ChatState, 'items' | 'busy' | 'runId' | 'turn' | 'lostAgain'> & {
  recorded: boolean;
};

/** Plain words for the stages that need them. A turn at rest has its own rows, so it shows nothing. */
function turnRow(v: Pick<ThreadInput, 'turn' | 'busy' | 'lostAgain'>): TurnRow | null {
  const row = (text: string): TurnRow => ({ kind: 'turn', key: 'turn', stage: v.turn, text });
  switch (v.turn) {
    case 'sending':
      return row('Sending your question…');
    case 'accepted':
      return row('Your question landed. The agent is about to start…');
    case 'working':
      return row('The agent is working on it. This can take a while.');
    case 'lost':
      return {
        ...row(
          v.lostAgain
            ? 'Followed it again, and the connection ended before the run said it finished. It may have stopped on the server. You can try again, or ask again.'
            : 'The connection ended before this turn finished, so the rest of it isn’t on this page. The run may still be going on the server.',
        ),
        refollow: {
          label: v.busy ? 'Following…' : 'Follow the run again',
          disabled: v.busy,
        },
      };
    default:
      return null;
  }
}

export function threadView(v: ThreadInput): Row[] {
  const blocks = blocksOf(v.items);
  const lastFlower = blocks.findLastIndex((b) => b.kind === 'flower');
  // one link per flower per turn: a fresh Set at each question
  let seen = new Set<string>();
  const rows: Row[] = [];
  blocks.forEach((b, i) => {
    const key = `${i}-${b.kind}`;
    switch (b.kind) {
      case 'user':
        seen = new Set();
        rows.push({ kind: 'user', key, text: b.text });
        break;
      case 'note':
        rows.push({ kind: 'note', key, text: b.text });
        break;
      case 'steps': {
        const tools = b.steps.filter((s) => s.kind === 'tool').length;
        const latest = b.steps.findLast((s) => s.kind === 'stage' || s.kind === 'progress');
        const running = v.busy && i === blocks.length - 1;
        if (!tools && !running) break;
        const now = running && latest ? `${(latest as { message: string }).message}… ` : '';
        rows.push({
          kind: 'steps',
          key,
          summary: `${now}${tools} ${tools === 1 ? 'tool call' : 'tool calls'}`,
          steps: b.steps.map(stepRow),
        });
        break;
      }
      case 'message':
        rows.push({ kind: 'message', key, blocks: parseMarkdown(b.text, seen) });
        break;
      case 'flower': {
        // does this turn's own text link to it?
        const from = blocks.findLastIndex((x, n) => n <= i && x.kind === 'user');
        const next = blocks.findIndex((x, n) => n > i && x.kind === 'user');
        const linked = blocks
          .slice(Math.max(from, 0), next === -1 ? undefined : next)
          .some((x) => x.kind === 'message' && x.text.includes(b.flower.view_url));
        const { valid, warnings } = b.flower.validation;
        rows.push({
          kind: 'flower',
          key,
          flower: b.flower,
          signature: b.signature,
          model: v.recorded ? 'recorded' : b.signature?.model,
          showLink: !linked,
          ...(i === lastFlower && v.runId
            ? { publishUrl: `/publish/${encodeURIComponent(v.runId)}` }
            : {}),
          checks: `Valid: ${String(valid)}${
            warnings.length > 0 ? ` (${warnings.map((w) => w.message).join('; ')})` : ''
          }`,
        });
        break;
      }
      case 'error':
        rows.push({
          kind: 'error',
          key,
          text: `${b.code}: ${b.message}${b.hint ? ` (${b.hint})` : ''}`,
        });
        break;
      case 'done':
        rows.push({ kind: 'done', key, line: answeredBy(b.done, b.signature) });
        break;
    }
  });
  const turn = turnRow(v);
  if (turn) rows.push(turn);
  return rows;
}

export interface ComposerView {
  value: string;
  readOnly: boolean;
  label: string;
  placeholder: string;
  button: string;
  disabled: boolean;
  /** the run's own link, once there is one */
  run?: { id: string; href: string };
}

export function composerView(
  v: Pick<ChatState, 'question' | 'runId' | 'busy'> & { recorded: boolean },
): ComposerView {
  return {
    value: v.recorded ? RECORDED_QUESTION : v.question,
    readOnly: v.recorded,
    label: v.recorded ? 'The saved question' : 'Ask Petal’s agent about a network',
    placeholder: v.runId
      ? 'Ask a follow-up…'
      : 'A DAO, a token, a contract address, or a question…',
    button: v.busy ? 'Working…' : v.recorded ? 'Play the recorded run' : 'Send',
    disabled: v.busy,
    ...(v.runId ? { run: { id: v.runId, href: `/make?run=${encodeURIComponent(v.runId)}` } } : {}),
  };
}

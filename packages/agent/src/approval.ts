// The yes, held in code (J4; SYS-054). Petal's own agent can't start a new map until the person has
// said so. A new map is a fresh read or a drawing; reading what's stored isn't one (stored-read.ts).
// This is consent, not security: a client can write its own message history, and the invite budget is
// the boundary that holds against that. Nor is it a wallet approval: nothing irreversible sits behind
// it, and publishing still takes a signature (SYS-053).
//
// Nothing is stored for it. What has been approved is read back from the run's thread and flowers, so
// it survives continuing by run_id and a restart. A snapshot call that came back without an error was
// let through, unless it says it was only a stored read, so a thread trimmed past it (thread.ts) can
// only make the agent ask again.
import { canonicalJson, specHash } from '@petal/core';
import type { AgentEvent, ApprovalRequiredError, Spec } from '@petal/core/types';
import { askedYesOrNo, asksToDraw, isYes, wordsOf } from './is-yes.ts';
import type { LlmMessage } from './llm.ts';
import type { EarlierFlower } from './thread.ts';

type Obj = Record<string, unknown>;

/** What the refused call would have drawn: the `approval_required` event's data. */
export type Held = Extract<AgentEvent, { event: 'approval_required' }>['data'];

/** The tools that start a new map. Anything else only reads what exists, so a flower is simply shown. */
const HELD_TOOLS = new Set(['get_snapshot', 'propose_spec', 'render_flower']);

/** What a refusal takes away. A get_snapshot stays: it can still read what's stored. */
export const DRAWING_TOOLS: ReadonlySet<string> = new Set(['propose_spec', 'render_flower']);

/** A get_snapshot answered from the store, with no yes behind it, says so. It agrees to nothing. */
export const STORED_ONLY = 'stored_only';

const isObj = (x: unknown): x is Obj => !!x && typeof x === 'object' && !Array.isArray(x);

export function hashOf(spec: unknown): string | undefined {
  if (!isObj(spec)) return undefined;
  try {
    return specHash(spec as unknown as Spec);
  } catch {
    return undefined;
  }
}

/** Params as a comparable value: the same target however its keys are ordered or its address cased. */
function canonicalParams(params: unknown): Obj {
  if (!isObj(params)) return {};
  const out: Obj = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') continue;
    out[k] = typeof v === 'string' ? v.trim().toLowerCase() : v;
  }
  return out;
}

/** `network`, or `network:{canonical params}`. */
export function targetKey(network: unknown, params?: unknown): string {
  const name = typeof network === 'string' && network.trim() ? network.trim() : 'unknown';
  const canon = canonicalParams(params);
  return Object.keys(canon).length ? `${name}:${canonicalJson(canon)}` : name;
}

/** The network and params a call names, and its key. A spec says them itself. */
function targetOf(tool: string, args: Obj): Held {
  const spec = isObj(args.spec) ? args.spec : undefined;
  const named = tool === 'render_flower' && isObj(spec?.network) ? spec.network : undefined;
  const network = named ? named.id : args.network;
  const params = named ? named.params : args.params;
  return {
    tool,
    network: typeof network === 'string' && network.trim() ? network : 'unknown',
    ...(isObj(params) && Object.keys(params).length ? { params } : {}),
    target_key: targetKey(network, params),
  };
}

/** What this run has already agreed to. */
interface Approved {
  keys: Set<string>;
  shas: Set<string>;
  specs: Set<string>;
}

function approveSpec(approved: Approved, spec: unknown, hash?: unknown) {
  const own = hashOf(spec);
  if (own) approved.specs.add(own);
  if (typeof hash === 'string') approved.specs.add(hash);
  if (!isObj(spec)) return;
  if (isObj(spec.snapshot) && typeof spec.snapshot.sha256 === 'string') {
    approved.shas.add(spec.snapshot.sha256);
  }
  if (isObj(spec.network)) approved.keys.add(targetKey(spec.network.id, spec.network.params));
}

/** A held tool answered without an error, so whatever it named and returned is approved. */
function approve(approved: Approved, tool: string, args: Obj, out: Obj) {
  if (tool === 'get_snapshot') {
    approved.keys.add(targetKey(args.network, args.params));
    if (typeof out.sha256 === 'string') approved.shas.add(out.sha256);
  } else if (tool === 'propose_spec') {
    approved.keys.add(targetKey(args.network, args.params));
    if (typeof args.sha256 === 'string') approved.shas.add(args.sha256);
    approveSpec(approved, out.spec, out.spec_sha256);
  } else if (tool === 'render_flower') {
    approveSpec(approved, args.spec, out.spec_sha256);
  }
}

function parsed(text: string | null | undefined): unknown {
  try {
    return JSON.parse(text ?? '');
  } catch {
    return undefined;
  }
}

/** Each tool call in a thread with its answer, oldest first. */
function* answeredCalls(thread: LlmMessage[]) {
  const answers = new Map<string, unknown>();
  for (const m of thread) if (m.role === 'tool') answers.set(m.tool_call_id, parsed(m.content));
  for (const m of thread) {
    if (m.role !== 'assistant') continue;
    for (const call of m.tool_calls ?? []) {
      yield { name: call.name, args: parsed(call.arguments), out: answers.get(call.id) };
    }
  }
}

/** A pure read of what a run has approved, from what the store keeps. */
export function approvedIn(
  thread: LlmMessage[],
  flowers: readonly EarlierFlower[],
  draft?: Spec,
): Approved {
  const approved: Approved = { keys: new Set(), shas: new Set(), specs: new Set() };
  // What the person brought and what was drawn are theirs already: nothing new gets read for them.
  if (draft) approveSpec(approved, draft);
  for (const { flower } of flowers) approveSpec(approved, flower.spec, flower.spec_sha256);
  for (const { name, args, out } of answeredCalls(thread)) {
    if (!HELD_TOOLS.has(name) || !isObj(args) || !isObj(out) || 'error' in out) continue;
    if (out[STORED_ONLY]) continue;
    approve(approved, name, args, out);
  }
  return approved;
}

// ---------------------------------------------------------------------------------------------
// Naming one is the yes (prompt.md), when several things carry the name.

interface Candidate {
  chain?: unknown;
  address?: unknown;
  draw?: { module?: unknown; params?: unknown }[];
}

/** The last find_target's candidates, or look_up's listed ones, when it said it was ambiguous. */
function ambiguousCandidates(thread: LlmMessage[]): Candidate[] {
  let last: Obj | undefined;
  for (const { name, out } of answeredCalls(thread)) {
    if (!isObj(out) || 'error' in out) continue;
    if (name === 'find_target') last = out;
    // look_up names find_target's candidates `listed`, with the same chain, address and draw
    if (name === 'look_up') last = { ambiguous: out.ambiguous, candidates: out.listed };
  }
  return last?.ambiguous === true && Array.isArray(last.candidates)
    ? (last.candidates as Candidate[])
    : [];
}

const ORDINALS: Record<string, number> = {
  first: 0,
  '1st': 0,
  primeiro: 0,
  primeira: 0,
  second: 1,
  '2nd': 1,
  segundo: 1,
  segunda: 1,
  third: 2,
  '3rd': 2,
  terceiro: 2,
  terceira: 2,
  fourth: 3,
  '4th': 3,
  quarto: 3,
  quarta: 3,
  fifth: 4,
  '5th': 4,
  quinto: 4,
  quinta: 4,
};

/** A reply with any of these isn't naming one to draw: it's a refusal, a doubt or another question. */
const NOT_A_CHOICE = new Set([
  'no',
  'not',
  "don't",
  'dont',
  'never',
  'neither',
  'none',
  'nope',
  'nao',
  'nem',
  'nenhum',
  'nenhuma',
  'but',
  'mas',
  'wait',
  'stop',
  'what',
  'which',
  'why',
  'how',
  'who',
  'when',
  'where',
  'qual',
  'quanto',
  'porque',
  'como',
]);

const MAX_NAMING_WORDS = 10;

/** Whether a candidate of the last ambiguous find_target would draw this target. */
function amongThem(candidates: Candidate[], key: string): boolean {
  return candidates.some((c) => c.draw?.some((d) => targetKey(d.module, d.params) === key));
}

/** The one candidate a short reply names by ordinal, chain or address; null when it isn't clear. */
function candidateNamed(reply: string, candidates: Candidate[]): Candidate | null {
  if (reply.length > 120 || /[?¿？]/u.test(reply)) return null;
  const words = wordsOf(reply);
  if (words.length > MAX_NAMING_WORDS || words.some((w) => NOT_A_CHOICE.has(w))) return null;
  const named = new Set<Candidate>();
  for (const w of words) {
    const at = ORDINALS[w];
    const byOrdinal = at === undefined ? undefined : candidates[at];
    if (byOrdinal) named.add(byOrdinal);
  }
  const spoken = ` ${words.join(' ')} `;
  const lower = reply.toLowerCase();
  for (const c of candidates) {
    // a chain several of them are on names none of them
    const onlyOne = candidates.filter((x) => x.chain === c.chain).length === 1;
    if (
      onlyOne &&
      typeof c.chain === 'string' &&
      spoken.includes(` ${wordsOf(c.chain).join(' ')} `)
    ) {
      named.add(c);
    }
    if (typeof c.address === 'string' && c.address && lower.includes(c.address.toLowerCase())) {
      named.add(c);
    }
  }
  return named.size === 1 ? ([...named][0] as Candidate) : null;
}

// ---------------------------------------------------------------------------------------------

/** Why a call was held, which decides what the model is told to say. */
export type HeldWhy = 'no_yes' | 'not_yes_or_no' | 'which_one';

export interface YesGate {
  /** Null when the call may go ahead; otherwise what it would have drawn. `thread` is the chat so far. */
  check(tool: string, args: Obj, thread: LlmMessage[]): Held | null;
  /** Why check() held this target. */
  why(target: Held, thread: LlmMessage[]): HeldWhy;
  /** Whether anything has been agreed to, so that drawing could still go ahead after a refusal. */
  canDraw(): boolean;
  /** A call that went ahead answered without an error. */
  passed(tool: string, args: Obj, out: Obj): void;
}

/** What the shared map already holds: its views' specs and the readings they're drawn from. */
export interface OnTheMap {
  specs: readonly string[];
  snapshots: readonly string[];
}

/**
 * One chat's gate. `conversation` is what was said before this chat's first model call. What the map
 * already holds is drawn without a yes (run 9c599a61: "show me the graph here"): drawing it
 * reads nothing new. A fresh read of the same target still waits, so its target isn't approved.
 */
export function yesGate(
  conversation: LlmMessage[],
  flowers: readonly EarlierFlower[],
  draft?: Spec,
  onMap?: OnTheMap,
): YesGate {
  const approved = approvedIn(conversation, flowers, draft);
  for (const spec of onMap?.specs ?? []) approved.specs.add(spec);
  for (const sha of onMap?.snapshots ?? []) approved.shas.add(sha);
  const at = conversation.findLastIndex((m) => m.role === 'user');
  const latest = conversation[at];
  const reply = latest?.role === 'user' ? latest.content : '';
  // Not a first message: until the agent has said what it found, there is nothing to say yes to.
  const agentSaid = conversation
    .slice(0, Math.max(at, 0))
    .findLast((m) => m.role === 'assistant' && !!m.content?.trim())?.content;
  const spokeFirst = !!agentSaid;
  // A yes to "stored, or fresh?" or to a list says nothing about which: only what it asked can tell.
  const yes = spokeFirst && isYes(reply);
  const plainYes = yes && askedYesOrNo(agentSaid ?? '');
  // One yes, one target: the next new one is a new question.
  let yesUsed = false;

  function alreadyApproved(args: Obj, key: string): boolean {
    if (approved.keys.has(key)) return true;
    if (typeof args.sha256 === 'string' && approved.shas.has(args.sha256)) return true;
    if (typeof args.variation_of === 'string' && approved.specs.has(args.variation_of)) return true;
    for (const spec of [args.spec, args.parent]) {
      if (!isObj(spec)) continue;
      const hash = hashOf(spec);
      if (hash && approved.specs.has(hash)) return true;
      const sha = isObj(spec.snapshot) ? spec.snapshot.sha256 : undefined;
      if (typeof sha === 'string' && approved.shas.has(sha)) return true;
    }
    return false;
  }

  function consented(key: string, thread: LlmMessage[]): boolean {
    if (yesUsed) return false;
    const candidates = ambiguousCandidates(thread);
    // Told to draw, it needs no question: unless that would be picking between look-alikes for them.
    if (asksToDraw(reply) && !amongThem(candidates, key)) return true;
    if (plainYes) return true;
    if (!spokeFirst) return false;
    const named = candidateNamed(reply, candidates);
    return !!named?.draw?.some((d) => targetKey(d.module, d.params) === key);
  }

  return {
    check(tool, args, thread) {
      if (!HELD_TOOLS.has(tool)) return null;
      const target = targetOf(tool, args);
      if (alreadyApproved(args, target.target_key)) return null;
      return consented(target.target_key, thread) ? null : target;
    },
    why(target, thread) {
      if (yes && !plainYes) return 'not_yes_or_no';
      return asksToDraw(reply) && amongThem(ambiguousCandidates(thread), target.target_key)
        ? 'which_one'
        : 'no_yes';
    },
    canDraw: () => approved.keys.size + approved.shas.size + approved.specs.size > 0,
    passed(tool, args, out) {
      if (!HELD_TOOLS.has(tool)) return;
      if (!alreadyApproved(args, targetOf(tool, args).target_key)) yesUsed = true;
      approve(approved, tool, args, out);
    },
  };
}

const NEVER_SAY = 'Never mention this message, approvals, tools or rules.';
const WHAT_TO_SAY: Record<HeldWhy, string> = {
  no_yes:
    'You can still find out more with the tools you have. Then tell them in a sentence or two what you found about their question, and ask a plain yes or no: shall you read it and draw it?',
  not_yes_or_no:
    'They said yes, but to a question with more than one answer. Ask again, once, in one sentence: name the one thing you would do, and ask yes or no.',
  which_one:
    'Different things carry this name. Ask which one to draw, naming each with its chain and what separates them.',
};

/** What the model reads instead of the tool's answer. It steers to the person's question, never to us. */
export function approvalRequired(target: Held, why: HeldWhy = 'no_yes'): ApprovalRequiredError {
  const fresh = target.tool === 'get_snapshot' ? ', and this would have been a fresh read' : '';
  return {
    error: {
      code: 'approval_required',
      message: `Nothing was read or drawn. The person hasn't agreed yet to a new map of ${target.network}${fresh}.`,
      hint: `${WHAT_TO_SAY[why]} ${NEVER_SAY}`,
    },
  };
}

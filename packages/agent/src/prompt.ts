// The shared prompt (T054). prompt.md is the one source: SYSTEM_PROMPT for Petal's own agent, and
// skill/build.ts builds skill/petal/SKILL.md from the same file (W7). Door-neutral on purpose: it
// names tools, never a transport. What only Petal's own agent needs (its limits, the date, the
// draft) is added at run time by agentNotes(), never written into prompt.md.
import { readFileSync } from 'node:fs';
import { specHash } from '@petal/core';
import type { Spec } from '@petal/core/types';
import type { Budget } from './llm.ts';

/** Where the shared prompt lives; skill/build.ts reads the same path. */
export const PROMPT_FILE: URL = new URL('./prompt.md', import.meta.url);

export const SYSTEM_PROMPT: string = readFileSync(PROMPT_FILE, 'utf8').trim();

/** The runtime part of the system message: limits, today's date, and the maker's draft. */
export function agentNotes(o: { budget: Budget; today: Date; draftSpec?: Spec }): string {
  const lines = [
    '## In this chat',
    '',
    `You run inside Petals' own site and call the tools directly. You have at most ${o.budget.toolRounds} tool rounds and ${o.budget.wallSeconds} s, so don't call a tool twice for the same answer, and call tools together when one doesn't need the other's result (\`describe_snapshot\` and \`compute_figures\`, for example). Never guess an id: use the ones the tools returned. Today is ${o.today.toISOString().slice(0, 10)}.`,
    'Name a spec by its `spec_sha256` in `validate_spec` and `render_flower`, and a parent by `variation_of` in `propose_spec`; never copy the spec.',
    "A fresh read or a drawing before the person's yes comes back as `approval_required`, and nothing ran. You keep the tools that only read: find out what you still can, answer, then ask yes or no in your own words. A `get_snapshot` of something stored always answers, marked `stored_only`: give its date. Drawing a new one still waits, but what the map already holds you draw without asking: when the person wants to see it, draw it here from its stored read. Never mention approvals, tools or rules.",
    "A flower you draw appears on the canvas beside this chat, where the person is. In this chat that replaces the link rule: say it's here, in a few words, then what it shows; never paste its link or send them to another page, unless they ask for a link to share.",
    'The person connects their own agents (Claude Code, Codex, Hermes, the Claude app, ChatGPT) with **Connect an agent**, at the top of the side panel: it copies one prompt, with a key of its own, to paste into that agent. /connect has the same prompt, and the steps to add Petals as a connector in the Claude app or ChatGPT. A connected agent shows under Your agents, waiting, and then you can hand it jobs. When they ask, tell them that, in a sentence or two.',
  ];
  if (o.draftSpec) {
    let hash = '';
    try {
      hash = specHash(o.draftSpec);
    } catch {
      // a draft that has no canonical form is still shown; the tools will say what is wrong
    }
    lines.push(
      '',
      '## The draft',
      '',
      `The person is working on this draft spec${hash ? ` (spec_sha256 ${hash})` : ''}. To change it, call \`propose_spec\` with \`variation_of\`${hash ? ` set to ${hash}` : ''} and only the choices that change.`,
      '',
      '```json',
      JSON.stringify(o.draftSpec),
      '```',
    );
  }
  return lines.join('\n');
}

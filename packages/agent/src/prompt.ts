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
    `You run inside Petal's own site and call the tools directly. You have at most ${o.budget.toolRounds} tool rounds and ${o.budget.wallSeconds} s, so don't call a tool twice for the same answer. Today is ${o.today.toISOString().slice(0, 10)}.`,
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

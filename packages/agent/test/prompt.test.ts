// T054: the shared prompt. One source (prompt.md) for SYSTEM_PROMPT and skill/petal/SKILL.md.
import { readFileSync } from 'node:fs';
import { specHash } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { SYSTEM_PROMPT as fromIndex } from '../src/index.ts';
import { DEFAULT_BUDGET } from '../src/llm.ts';
import { agentNotes, PROMPT_FILE, SYSTEM_PROMPT } from '../src/prompt.ts';
import { SPEC } from './helpers.ts';

describe('SYSTEM_PROMPT', () => {
  test('is prompt.md, exported from the package', () => {
    expect(SYSTEM_PROMPT).toBe(readFileSync(PROMPT_FILE, 'utf8').trim());
    expect(fromIndex).toBe(SYSTEM_PROMPT);
    expect(SYSTEM_PROMPT).not.toMatch(/not_implemented/);
  });

  test('came out shorter, because every byte is resent each turn', () => {
    // 8,122 before the cut, which came to about 8,100; the section on investigating adds about 450.
    expect(Buffer.byteLength(readFileSync(PROMPT_FILE, 'utf8'))).toBeLessThan(9000);
  });

  test('walks the six steps in the skill order, list_flowers first', () => {
    const steps = SYSTEM_PROMPT.slice(SYSTEM_PROMPT.indexOf('## The six steps'));
    const numbered = steps.split('\n## ')[0]?.match(/^\d\. /gm) ?? [];
    expect(numbered).toEqual(['1. ', '2. ', '3. ', '4. ', '5. ', '6. ']);
    const order = [
      'look_up',
      'find_target',
      'list_networks',
      'list_flowers',
      'get_snapshot',
      'describe_snapshot',
      'compute_figures',
      'propose_spec',
      'validate_spec',
      'render_flower',
      'prepare_publish',
      'sign_url',
    ];
    const at = order.map((t) => steps.indexOf(`\`${t}\``));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  test('says what T054 asks: tool figures only, sources, unknowns, unavailable primitives, keys', () => {
    expect(SYSTEM_PROMPT).toMatch(/Quote only numbers these two tools return/);
    expect(SYSTEM_PROMPT).toMatch(/Every mapping in the interpretation cites a source id/);
    expect(SYSTEM_PROMPT).toMatch(/`unknowns`: .*Never empty/);
    expect(SYSTEM_PROMPT).toMatch(/not available yet/);
    expect(SYSTEM_PROMPT).toMatch(/unless the person asks for a fresh analysis/);
    expect(SYSTEM_PROMPT).toMatch(/Never ask anyone for a key/);
  });

  test('steers T165: a name goes through look_up first, and nothing ends in a dead end', () => {
    expect(SYSTEM_PROMPT).toMatch(/`look_up` with their words is the first look/);
    expect(SYSTEM_PROMPT).toMatch(
      /a flower, one clear question, or a refusal that says what would work/,
    );
    expect(SYSTEM_PROMPT).toMatch(/`ambiguous: true`.*Never pick for the person/);
    expect(SYSTEM_PROMPT).toMatch(/If you remember an address, pass it to `find_target`/);
    expect(SYSTEM_PROMPT).not.toMatch(/and stop\./);
  });

  test('a new map starts only after a plain yes; a flower that exists is simply shown', () => {
    expect(SYSTEM_PROMPT).toMatch(/Never go from a question straight to a new map/);
    expect(SYSTEM_PROMPT).toMatch(/ask a plain yes or no before starting a new read and drawing/);
    expect(SYSTEM_PROMPT).toMatch(/Propose and validate, after the yes/);
    expect(SYSTEM_PROMPT).toMatch(/is simply shown, with its link/);
  });

  test('being told to draw is the yes, and a yes needs a yes-or-no question', () => {
    expect(SYSTEM_PROMPT).toMatch(/Being told to draw is the yes/);
    expect(SYSTEM_PROMPT).toMatch(/unless `ambiguous: true`/);
    expect(SYSTEM_PROMPT).toMatch(/A yes counts only after a true yes-or-no question/);
    expect(SYSTEM_PROMPT).toMatch(/ask again, once, in a sentence/);
  });

  test('talks: answers first, plain words, reads what is stored, picks a reading', () => {
    expect(SYSTEM_PROMPT).toMatch(/Answer first, in sentences/);
    expect(SYSTEM_PROMPT).toMatch(/"one line" means one line/);
    expect(SYSTEM_PROMPT).toMatch(/No source ids, `fig:` ids, tool or module names, hashes/);
    expect(SYSTEM_PROMPT).toMatch(/Read what's stored, then answer/);
    expect(SYSTEM_PROMPT).toMatch(/Pick a reading/);
    expect(SYSTEM_PROMPT).toMatch(/say no, then what's close/);
    expect(SYSTEM_PROMPT).toMatch(/Never offer a payment quote/);
  });

  test('the report shape is gone: a flower is a link, a sentence, and what it can not tell', () => {
    expect(SYSTEM_PROMPT).not.toMatch(/\*\*Flower\*\*|\*\*Mapping\*\*|\*\*What you'll see\*\*/);
    expect(SYSTEM_PROMPT).toMatch(/the one thing it can't tell you/);
    expect(SYSTEM_PROMPT).toMatch(/The mapping is on the page with the flower/);
    expect(SYSTEM_PROMPT).toMatch(/A follow-up never repeats the mapping or a caveat/);
    expect(SYSTEM_PROMPT).toMatch(/under 60 words/);
    expect(SYSTEM_PROMPT).toMatch(/under 40 words/);
  });

  test('what was working stays: nothing invented, no keys, addresses are not people', () => {
    expect(SYSTEM_PROMPT).toMatch(/Never invent data, numbers, sources or options/);
    expect(SYSTEM_PROMPT).toMatch(/Never ask anyone for a key, a seed phrase or a signature/);
    expect(SYSTEM_PROMPT).toMatch(/Addresses are not people/);
    expect(SYSTEM_PROMPT).toMatch(/Never call an inferred identity proven/);
    expect(SYSTEM_PROMPT).toMatch(/Publish, only when asked/);
  });

  test('a token is a ledger of holdings; Moloch shares are one, transferable or not', () => {
    expect(SYSTEM_PROMPT).toMatch(
      /A token is a ledger of holdings, and transferability is a property/,
    );
    expect(SYSTEM_PROMPT).toMatch(/Moloch shares are a token/);
    expect(SYSTEM_PROMPT).not.toMatch(/Moloch[^.]*(isn't|is not|not) a token/i);
  });

  test('keeps the six rules of the 7/7 skill', () => {
    const rules = SYSTEM_PROMPT.slice(SYSTEM_PROMPT.indexOf('## Rules'));
    expect(rules.match(/^\d\. /gm)).toHaveLength(6);
    expect(rules).toMatch(/Addresses are not people/);
    expect(rules).toMatch(/Never call an inferred identity proven/);
    expect(rules).toMatch(/under 60 words/);
  });

  test('marks the shared text for skill/build.ts: one begin line, one end line, steps to rules between', () => {
    const lines = SYSTEM_PROMPT.split('\n');
    const begin = lines.indexOf('<!-- petal:shared:begin -->');
    const end = lines.indexOf('<!-- petal:shared:end -->');
    expect(lines.filter((l) => l.includes('petal:shared:'))).toHaveLength(2);
    expect(begin).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(begin);
    const block = lines.slice(begin + 1, end);
    expect(block[0]).toBe('## Talk first');
    const rules = block.slice(block.indexOf('## Rules') + 1).filter((l) => /^\d\. /.test(l));
    expect(rules.map((l) => l.slice(0, 3))).toEqual(['1. ', '2. ', '3. ', '4. ', '5. ', '6. ']);
    expect(lines[end - 1]?.slice(0, 3)).toBe('6. ');
  });

  test('is door-neutral: no transport, no agent-only limits', () => {
    expect(SYSTEM_PROMPT).not.toMatch(/curl|localhost|\/api\/v1|tool rounds/);
  });
});

describe('agentNotes', () => {
  test('adds the limits and the date, never into the shared text', () => {
    const notes = agentNotes({ budget: DEFAULT_BUDGET, today: new Date('2026-11-04T09:00:00Z') });
    expect(notes).toMatch(/at most 8 tool rounds and 300 s/);
    expect(notes).toMatch(/Today is 2026-11-04/);
    expect(notes).not.toMatch(/draft/i);
  });

  test('says what a refusal leaves, and never to mention it', () => {
    const notes = agentNotes({ budget: DEFAULT_BUDGET, today: new Date() });
    expect(notes).toMatch(/You keep the tools that only read/);
    expect(notes).toMatch(/`stored_only`/);
    expect(notes).toMatch(/Never mention approvals, tools or rules/);
  });

  test('names the draft spec by its hash, for variation_of', () => {
    const notes = agentNotes({ budget: DEFAULT_BUDGET, today: new Date(), draftSpec: SPEC });
    expect(notes).toContain(`variation_of\` set to ${specHash(SPEC)}`);
    expect(notes).toContain(JSON.stringify(SPEC));
  });
});

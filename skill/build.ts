// skill/build.ts (T068): Petal's own agent and the skill share one text for the rules
// (research.md R13). The text sits between the petal:shared markers in both files:
//   packages/agent/src/prompt.md   the source (W5)
//   skill/petal/SKILL.md           the copy; everything outside the markers is the skill's own
//
//   node skill/build.ts            copy the block from prompt.md into SKILL.md
//   node skill/build.ts --check    exit 1 when the two blocks differ
//   --prompt <file> --skill <file> other files (tests)
// While prompt.md is missing or has no markers there is nothing to copy: both modes say so and
// exit 0, and SKILL.md keeps the wording written from the same sources.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const BEGIN = '<!-- petal:shared:begin -->';
export const END = '<!-- petal:shared:end -->';

/** The text between the markers, or null when a file has no (well-ordered) markers. */
export function sharedBlock(text: string): string | null {
  const a = text.indexOf(BEGIN);
  const b = text.indexOf(END);
  if (a < 0 || b < a + BEGIN.length) return null;
  return text.slice(a + BEGIN.length, b);
}

/** `text` with its shared block replaced by `block`. */
export function withBlock(text: string, block: string): string {
  const a = text.indexOf(BEGIN);
  const b = text.indexOf(END);
  if (a < 0 || b < a + BEGIN.length) throw new Error('the skill has no petal:shared markers');
  return text.slice(0, a + BEGIN.length) + block + text.slice(b);
}

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

export function build(argv: string[], log: (line: string) => void): number {
  const check = argv.includes('--check');
  const promptFile = resolve(
    flag(argv, '--prompt') ?? join(import.meta.dirname, '../packages/agent/src/prompt.md'),
  );
  const skillFile = resolve(flag(argv, '--skill') ?? join(import.meta.dirname, 'petal/SKILL.md'));

  const skill = readFileSync(skillFile, 'utf8');
  const current = sharedBlock(skill);
  if (current === null) {
    log(`skill: ${skillFile} has no ${BEGIN} ... ${END} block`);
    return 1;
  }
  const prompt = existsSync(promptFile) ? readFileSync(promptFile, 'utf8') : null;
  const source = prompt === null ? null : sharedBlock(prompt);
  if (source === null) {
    const why = prompt === null ? 'does not exist yet' : 'has no petal:shared markers yet';
    log(`skill: ${promptFile} ${why}; SKILL.md keeps its own wording`);
    return 0;
  }
  if (source === current) {
    log('skill: SKILL.md and prompt.md share the same rules');
    return 0;
  }
  if (check) {
    log('skill: SKILL.md differs from prompt.md; run `node skill/build.ts`');
    return 1;
  }
  writeFileSync(skillFile, withBlock(skill, source));
  log(`skill: copied the shared rules from prompt.md into ${skillFile}`);
  return 0;
}

if (import.meta.main) process.exitCode = build(process.argv.slice(2), (l) => console.log(l));

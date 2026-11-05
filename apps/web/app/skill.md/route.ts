// What a pasted prompt points at: Petal's skill, for an agent with no clone (lib/agent-prompt.ts).
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hostedSkill, originFrom } from '../../lib/agent-prompt.ts';
import { repoRoot } from '../../lib/config.ts';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const skill = await readFile(join(repoRoot(), 'skill/petal/SKILL.md'), 'utf8');
  return new Response(hostedSkill(skill, originFrom(req.headers)), {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  });
}

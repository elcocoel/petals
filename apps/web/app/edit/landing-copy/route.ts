// Where the landing's copy editor saves (app/edit/CopyEditor.tsx): only on a local server, never in production.
// It takes { edits: { path: words } } for paths that are words on the landing (lib/landing-copy.ts), lays them
// over the ones already kept (its `words`), and writes lib/landing-copy.edits.json whole, through a file beside it, so a
// half-written file is never read. Publishing is the usual way: commit, merge, deploy.
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { copyLeaves } from '../../../lib/copy-edits.ts';
import { landingCopy } from '../../../lib/landing-copy.ts';

const FILE = join(process.cwd(), 'lib', 'landing-copy.edits.json');

export async function POST(request: Request) {
  if (process.env.NODE_ENV === 'production') return new Response('Not here.', { status: 403 });
  const body = (await request.json().catch(() => null)) as { edits?: unknown } | null;
  const asked = body?.edits;
  if (!asked || typeof asked !== 'object') return new Response('No edits.', { status: 400 });
  const paths = new Set(copyLeaves(landingCopy).map(([path]) => path));
  const file = JSON.parse(await readFile(FILE, 'utf8')) as {
    about: string;
    words: Record<string, string>;
  };
  for (const [path, words] of Object.entries(asked)) {
    if (!paths.has(path) || typeof words !== 'string')
      return new Response(`Not a field of the landing: ${path}`, { status: 400 });
    file.words[path] = words;
  }
  const words = Object.fromEntries(
    Object.entries(file.words).sort(([a], [b]) => a.localeCompare(b)),
  );
  await writeFile(`${FILE}.next`, `${JSON.stringify({ ...file, words }, null, 2)}\n`);
  await rename(`${FILE}.next`, FILE);
  return Response.json({ saved: Object.keys(asked).length });
}

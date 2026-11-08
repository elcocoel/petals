// Petal as one file (T405): what a person's agent fetches to have Petals' tools on their own
// machine, with no copy of the repo. Made by apps/cli/scripts/bundle.ts at build time; served
// with this site's origin written in, so the file knows where to show the work.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { originFrom } from '../../lib/agent-prompt.ts';
import { repoRoot } from '../../lib/config.ts';

export const dynamic = 'force-dynamic';

/** The string file.ts leaves for this, in whichever quotes the bundler wrote. */
const PLACEHOLDER = /(["'])%%PETALS_SITE%%\1/;

/** Read once a process; the file only changes with a build. */
let made: Promise<string | null> | undefined;
const theFile = () => {
  made ??= readFile(join(repoRoot(), 'apps/cli/dist/petal.mjs'), 'utf8').catch(() => null);
  return made;
};

export async function GET(req: Request): Promise<Response> {
  const file = await theFile();
  if (!file || !PLACEHOLDER.test(file)) {
    made = undefined;
    return new Response('petal.mjs is not built on this site.\n', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  // The configured public address wins over what the request says, so no header can point the
  // file at another site.
  const origin = process.env.PETAL_API?.trim().replace(/\/+$/, '') || originFrom(req.headers);
  return new Response(
    file.replace(PLACEHOLDER, () => JSON.stringify(origin)),
    {
      headers: {
        'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'no-store',
      },
    },
  );
}

// Drafts waiting for a maker's signature: .petal/drafts/<entry_sha256>.json (T049).
// Local state, never committed and never on the map.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { DraftEntry } from './verify.ts';

export interface StoredDraft {
  entry_sha256: string;
  entry: DraftEntry;
  nonce: string;
  expires_at: string;
  recipient: string;
  message: string;
  created_at: string;
  /** set once a publish has verified the proof; a draft publishes once */
  used_at?: string;
}

export function stateDirOf(cfg: { root: string; stateDir?: string }): string {
  return resolve(cfg.root, cfg.stateDir ?? '.petal');
}

export function draftStore(cfg: { root: string; stateDir?: string }) {
  const dir = join(stateDirOf(cfg), 'drafts');
  const file = (sha: string) => {
    if (!/^[0-9a-f]{64}$/.test(sha)) throw new Error(`not an entry_sha256: ${sha}`);
    return join(dir, `${sha}.json`);
  };
  return {
    async get(sha: string): Promise<StoredDraft | null> {
      try {
        return JSON.parse(await readFile(file(sha), 'utf8')) as StoredDraft;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw err;
      }
    },
    async put(d: StoredDraft): Promise<void> {
      await mkdir(dir, { recursive: true });
      const target = file(d.entry_sha256);
      const tmp = `${target}.${process.pid}.tmp`;
      await writeFile(tmp, `${JSON.stringify(d, null, 2)}\n`);
      await rename(tmp, target);
    },
  };
}

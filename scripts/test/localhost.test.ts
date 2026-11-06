// A server holding a model key can be spent by whoever reaches it, so nothing binds to all interfaces
// by default. The container is the one exception: only its own published port, on 127.0.0.1, reaches it.
import { mkdtempSync, readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveApi } from '@petal/agent/serve';
import { expect, test } from 'vitest';

const REPO = join(import.meta.dirname, '../..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');

test('the web app binds to localhost, for dev and for start', () => {
  const { scripts } = JSON.parse(read('apps/web/package.json'));
  expect(scripts.dev).toContain('--hostname 127.0.0.1');
  expect(scripts.start).toContain('--hostname 127.0.0.1');
});

test("Elco's app doesn't undo that, and the container runs Next directly", () => {
  expect(read('scripts/serve-testnet.sh')).not.toMatch(/--hostname (?!127\.0\.0\.1)/);
  expect(read('scripts/container/entry.sh')).toContain('next start -p');
});

test('the standalone API binds to localhost', async () => {
  const server = serveApi({
    port: 0,
    cfg: { root: REPO, stateDir: mkdtempSync(join(tmpdir(), 'petal-localhost-')) },
  }) as Server;
  await new Promise((r) => (server.listening ? r(null) : server.once('listening', r)));
  expect((server.address() as AddressInfo).address).toBe('127.0.0.1');
  await new Promise((r) => server.close(r));
});

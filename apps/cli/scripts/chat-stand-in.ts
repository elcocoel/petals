// The chat helper with a stand-in agent in place of the person's own, for building and walking the
// page's chat box with no real agent or login. It plays one turn of Claude Code's stream-json (or an
// ACP agent's): streamed text, a command to approve, a todo list, the end; "wait" in a prompt holds
// the turn until Stop. Nothing is written outside a fresh temporary folder.
//   node apps/cli/scripts/chat-stand-in.ts [claude|hermes] --allow-origin http://127.0.0.1:3195 [--port 7466]
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pageUrl, parseTerminalArgs, startTerminal } from '../src/terminal.ts';

const args = parseTerminalArgs(process.argv.slice(2));
if ('error' in args) {
  console.error(args.error);
  process.exit(2);
}
if (args.agent === 'codex') {
  console.error('The chat stand-ins are claude and hermes.');
  process.exit(2);
}
const origins = args.extra.length ? args.extra : ['http://127.0.0.1:3195'];
const standIn = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'test',
  'stand-ins',
  args.agent === 'claude' ? 'claude.mjs' : 'acp.mjs',
);
const dir = mkdtempSync(join(tmpdir(), 'petal-chat-stand-in-'));
const helper = await startTerminal({
  agent: args.agent,
  command: [process.execPath, standIn],
  port: args.port,
  origins,
  cwd: dir,
  env: {
    ...process.env,
    HOME: dir,
    CLAUDE_CONFIG_DIR: join(dir, '.claude'),
    STAND_IN_LOG: join(dir, 'stand-in.log'),
    STAND_IN_SAVES: '1',
  },
  openPage: false,
  // its own Petals folder, so a conversation's session is kept and comes back on reopening
  petals: {
    node: process.execPath,
    file: join(dir, 'petal.mjs'),
    site: origins[0] as string,
    home: join(dir, 'petals'),
  },
  skill: async () => 'A stand-in skill.',
});
console.error(
  `Open ${pageUrl(origins[0] as string, helper.code(), args.port)} (the socket is /chat).`,
);
console.error(`What the stand-in was sent: ${join(dir, 'stand-in.log')}`);
process.on('SIGINT', () => void helper.close().then(() => process.exit(0)));

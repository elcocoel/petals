// Petals' open-calls feed, keyless first: each source's open calls read now, without a key, and kept as
// calls/v1, a source's replaced as a whole so a call no longer open leaves. A source that doesn't answer keeps
// what it had. It writes to the server's own store, so run it where the server runs:
//   container exec petals node /app/scripts/read-calls.ts [--dry]
// --dry reads and says, and keeps nothing.
import { parseArgs } from 'node:util';
import { createContext, readCalls, serverConfig } from '@petal/agent';

const { values } = parseArgs({ options: { dry: { type: 'boolean' } } });
const ctx = createContext(serverConfig(process.env));
const r = await readCalls(ctx, { save: !values.dry, log: (line) => console.log(line) });
const failed = r.sources.filter((s) => s.failed);
console.log(
  `${r.sources.reduce((n, s) => n + s.calls, 0)} open calls from ${r.sources.length - failed.length} sources; ${values.dry ? 'nothing kept (--dry)' : 'kept'}${failed.length ? `; not read: ${failed.map((s) => s.name).join(', ')}` : ''}`,
);

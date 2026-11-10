// Opens an address in the person's default browser, for `start`: the system's own way, and nothing else.
import { spawn } from 'node:child_process';

/** The system's own way to open an address in the default browser. */
export function systemOpener(url: string): void {
  const [cmd, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  try {
    spawn(cmd as string, args as string[], { stdio: 'ignore', detached: true }).unref();
  } catch {
    // no opener: start prints open_url anyway
  }
}

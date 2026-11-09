// Petals Helper.app (004 W10; Elco, 9 Nov: "it needs to be one click for the user if possible"). The
// first paste writes this small app on the person's Mac. It claims the petals:// link, so from then on
// the page's button starts the terminal helper with one click: the browser asks once, then opens it.
//
// It's made on the person's own machine, so it carries no download quarantine and needs no signing or
// installer. It's an AppleScript applet (osacompile, which every Mac has) whose only job is to hand a
// petals:// link to `node petal.mjs terminal --link <link>`. It doesn't stay running and starts
// nothing at login: the helper it starts ends with its session.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AGENTS, type Agent, DEFAULT_PORT } from './terminal.ts';

export const APP_NAME = 'Petals Helper.app';
export const APP_ID = 'app.petals.helper';
const LSREGISTER =
  '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
/** A code the page makes up: the helper accepts it once, so the page pairs with no typing. */
const CODE = /^[A-Za-z0-9-]{8,64}$/;

/** What a petals:// link asks for: petals://start?code=<code>&agent=<agent>[&port=<port>]. */
export function parseLink(link: string): { code: string; agent: Agent; port: number } | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (
    url.protocol !== 'petals:' ||
    (url.hostname || url.pathname.replace(/^\/+/, '')) !== 'start'
  ) {
    return null;
  }
  const code = url.searchParams.get('code') ?? '';
  const agent = (url.searchParams.get('agent') ?? 'claude') as Agent;
  const port = Number(url.searchParams.get('port') ?? DEFAULT_PORT);
  if (!CODE.test(code) || !(agent in AGENTS)) return null;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return null;
  return { code, agent, port };
}

/** The applet's script: hand the link to the helper, in the background, and quit. */
export function appletScript(
  node: string,
  file: string,
  log: string,
  /** settings for the helper, as NAME=value; only a test's throwaway copy uses them */
  env: Record<string, string> = {},
): string {
  const vars = Object.entries(env)
    .filter(([k]) => /^[A-Z_][A-Z0-9_]*$/.test(k))
    .map(([k, v]) => `${k}=" & quoted form of ${JSON.stringify(v)} & " `)
    .join('');
  const q = (s: string) => JSON.stringify(s); // an AppleScript string literal, for these paths
  return [
    'on open location theLink',
    `  do shell script "PETALS_FROM_APP=1 ${vars}" & quoted form of ${q(node)} & " " & quoted form of ${q(file)} & " terminal --link " & quoted form of theLink & " > " & quoted form of ${q(log)} & " 2>&1 &"`,
    'end open location',
    '',
    'on run',
    '  display dialog "Petals Helper starts your agent when you press Start on the Petals page." buttons {"OK"} default button 1 with title "Petals Helper"',
    'end run',
    '',
  ].join('\n');
}

export interface WriteResult {
  path: string;
  registered: boolean;
}

/**
 * Writes Petals Helper.app into `dir` (the person's ~/Applications), pointing at this Node and this
 * file, and registers its petals:// link with macOS. Written again on each paste, so a moved Node or
 * file is picked up. macOS only.
 */
export function writeHelperApp(o: {
  dir: string;
  node: string;
  file: string;
  home: string;
  register?: boolean;
  env?: Record<string, string>;
}): WriteResult {
  if (process.platform !== 'darwin') throw new Error('Petals Helper.app is for macOS');
  mkdirSync(o.dir, { recursive: true });
  const app = join(o.dir, APP_NAME);
  const work = mkdtempSync(join(tmpdir(), 'petals-app-'));
  try {
    const script = join(work, 'helper.applescript');
    writeFileSync(script, appletScript(o.node, o.file, join(o.home, 'helper.log'), o.env));
    const tmpApp = join(work, APP_NAME);
    const run = (cmd: string, args: string[]) => {
      const r = spawnSync(cmd, args, { encoding: 'utf8' });
      if (r.status !== 0)
        throw new Error(`${cmd} ${args[0] ?? ''}: ${(r.stderr || r.stdout).trim()}`);
    };
    run('/usr/bin/osacompile', ['-o', tmpApp, script]);
    const plist = join(tmpApp, 'Contents/Info.plist');
    run('/usr/bin/plutil', ['-replace', 'CFBundleIdentifier', '-string', APP_ID, plist]);
    run('/usr/bin/plutil', ['-replace', 'CFBundleName', '-string', 'Petals Helper', plist]);
    run('/usr/bin/plutil', [
      '-replace',
      'CFBundleURLTypes',
      '-json',
      JSON.stringify([{ CFBundleURLName: 'Petals', CFBundleURLSchemes: ['petals'] }]),
      plist,
    ]);
    // no Dock icon while it hands the link on
    run('/usr/bin/plutil', ['-replace', 'LSUIElement', '-bool', 'true', plist]);
    // the plist changed, so its local signature is made again, as on any Mac (no developer account)
    run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', tmpApp]);
    rmSync(app, { recursive: true, force: true });
    run('/bin/mv', [tmpApp, app]);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  let registered = false;
  if (o.register !== false) {
    registered = spawnSync(LSREGISTER, ['-f', app], { stdio: 'ignore' }).status === 0;
  }
  return { path: app, registered };
}

/** Removes the app from macOS's list of link handlers, for a test's throwaway copy. */
export function unregisterHelperApp(path: string): void {
  spawnSync(LSREGISTER, ['-u', path], { stdio: 'ignore' });
}

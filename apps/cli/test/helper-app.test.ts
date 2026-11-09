// Petals Helper.app (004 W10): a petals:// link hands the page's own code to the terminal helper, so the
// page's button is one click. Built here in a throwaway folder and never registered with macOS.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { WebSocket } from 'ws';
import { APP_NAME, appletScript, parseLink, writeHelperApp } from '../src/helper-app.ts';
import { findPython, startTerminal } from '../src/terminal.ts';

describe('a petals:// link', () => {
  test('names the page’s code, the agent and the port', () => {
    expect(parseLink('petals://start?code=AB12-CD34-EF56&agent=codex&port=7480')).toEqual({
      code: 'AB12-CD34-EF56',
      agent: 'codex',
      port: 7480,
    });
    expect(parseLink('petals://start?code=AB12-CD34-EF56')).toEqual({
      code: 'AB12-CD34-EF56',
      agent: 'claude',
      port: 7466,
    });
  });

  test('anything else is refused', () => {
    for (const bad of [
      'https://start?code=AB12-CD34-EF56',
      'petals://stop?code=AB12-CD34-EF56',
      'petals://start?code=short',
      'petals://start?code=AB12-CD34-EF56;rm',
      'petals://start?code=AB12-CD34-EF56&agent=bash',
      'petals://start?code=AB12-CD34-EF56&port=80',
      'not a link',
    ]) {
      expect(parseLink(bad), bad).toBeNull();
    }
  });
});

describe('the applet', () => {
  test('hands the link to the helper in the background, with every path quoted', () => {
    const s = appletScript('/n/node', "/h/it's/petal.mjs", '/h/.petals/helper.log');
    expect(s).toContain('on open location theLink');
    expect(s).toContain('quoted form of "/n/node"');
    expect(s).toContain(`quoted form of "/h/it's/petal.mjs"`);
    expect(s).toContain('" terminal --link " & quoted form of theLink');
    expect(s).toMatch(/2>&1 &"$/m);
  });

  test.skipIf(process.platform !== 'darwin')(
    'builds on this Mac: claims petals://, no Dock icon, signed locally',
    () => {
      const dir = mkdtempSync(join(tmpdir(), 'petals-app-test-'));
      const made = writeHelperApp({
        dir,
        node: '/n/node',
        file: '/h/.petals/petal.mjs',
        home: '/h/.petals',
        register: false,
      });
      expect(made.path).toBe(join(dir, APP_NAME));
      expect(made.registered).toBe(false);
      const plist = JSON.parse(
        spawnSync(
          '/usr/bin/plutil',
          ['-convert', 'json', '-o', '-', join(made.path, 'Contents/Info.plist')],
          {
            encoding: 'utf8',
          },
        ).stdout,
      );
      expect(plist.CFBundleURLTypes).toEqual([
        { CFBundleURLName: 'Petals', CFBundleURLSchemes: ['petals'] },
      ]);
      expect(plist.CFBundleIdentifier).toBe('app.petals.helper');
      expect(plist.LSUIElement).toBe(true);
      expect(spawnSync('/usr/bin/codesign', ['--verify', made.path]).status).toBe(0);
      expect(existsSync(join(made.path, 'Contents/Resources/Scripts/main.scpt'))).toBe(true);
    },
  );
});

describe.skipIf(findPython() === null)('started from a link', () => {
  test('pairs with the page’s own code, then ends with its session', async () => {
    const port = 47950 + Math.floor(Math.random() * 40);
    let done = false;
    const said: string[] = [];
    const helper = await startTerminal({
      agent: 'claude',
      command: ['sh', '-c', 'echo hello; exit 0'],
      port,
      origins: ['https://petals.example'],
      cwd: mkdtempSync(join(tmpdir(), 'petal-term-')),
      code: 'PAGE-MADE-CODE-1',
      once: true,
      onDone: () => {
        done = true;
      },
      openPage: false,
      say: (l) => said.push(l),
    });
    const ws = new WebSocket(`ws://127.0.0.1:${port}/pty`, { origin: 'https://petals.example' });
    let output = '';
    ws.on('message', (raw, bin) => {
      if (bin) output += raw.toString();
    });
    await new Promise((r) => ws.once('open', r));
    ws.send(JSON.stringify({ pair: 'PAGE-MADE-CODE-1' }));
    const end = Date.now() + 8000;
    while (!done && Date.now() < end) await new Promise((r) => setTimeout(r, 25));
    expect(output).toContain('hello');
    expect(done).toBe(true);
    expect(said.some((l) => l.includes('Ctrl-C'))).toBe(false);
    await helper.close();
  });
});

// The log the applet writes to is the helper's only voice when it's started from a link.
test('the applet sends the helper’s words to ~/.petals/helper.log', () => {
  expect(appletScript('/n', '/f', '/h/.petals/helper.log')).toContain(
    'quoted form of "/h/.petals/helper.log"',
  );
  expect(readFileSync(join(import.meta.dirname, '../src/helper-app.ts'), 'utf8')).toContain(
    "join(o.home, 'helper.log')",
  );
});

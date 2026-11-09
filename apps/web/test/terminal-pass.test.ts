// The terminal in the page (W10): what the page sends the helper and how it reads what comes back,
// against CONNECTORS's seam of 9 Nov.
import { describe, expect, test } from 'vitest';
import {
  codeFrom,
  helloFrame,
  helperUrl,
  pairFromHash,
  pairingCode,
  readControl,
  resizeFrame,
  startAddress,
  startFromHash,
  startLink,
  terminalAddress,
} from '../lib/terminal-pass.ts';

describe('the terminal in the page', () => {
  test('talks only to this computer', () => {
    expect(helperUrl()).toBe('ws://127.0.0.1:7466/pty');
  });

  test('the first frame is the code and how big the terminal is', () => {
    expect(JSON.parse(helloFrame('K7QM-3WTZ', { cols: 120, rows: 32 }))).toEqual({
      pair: 'K7QM-3WTZ',
      cols: 120,
      rows: 32,
    });
  });

  test("the first frame can hand the agent the page's conversation", () => {
    expect(
      JSON.parse(
        helloFrame('K7QM-3WTZ', { cols: 90, rows: 30 }, 'https://petal-flowers.vercel.app/s/abc'),
      ),
    ).toEqual({
      pair: 'K7QM-3WTZ',
      cols: 90,
      rows: 30,
      exploration: 'https://petal-flowers.vercel.app/s/abc',
    });
  });

  test('a new conversation reloads the page on it, with the code kept in the fragment', () => {
    expect(terminalAddress('/make', 'exp_1', 'K7QM-3WTZ', 7466)).toBe(
      '/make?terminal=1&elsewhere=exp_1#pair=K7QM-3WTZ',
    );
    expect(terminalAddress('/make', 'exp_1', 'K7QM-3WTZ', 7499)).toBe(
      '/make?terminal=1&elsewhere=exp_1#pair=K7QM-3WTZ&port=7499',
    );
  });

  test('a resize is exactly the one JSON the helper reads as one', () => {
    expect(resizeFrame({ cols: 90, rows: 30 })).toBe('{"resize":{"cols":90,"rows":30}}');
  });

  test('control frames: paired, exit, refused, and anything else is nothing', () => {
    expect(readControl('{"paired":true,"agent":"claude"}')).toEqual({
      kind: 'paired',
      agent: 'claude',
    });
    expect(readControl('{"exit":0}')).toEqual({ kind: 'exit', code: 0 });
    expect(readControl('{"error":"wrong code"}')).toEqual({ kind: 'refused', why: 'wrong code' });
    expect(readControl('ls -la')).toBeNull();
    expect(readControl('{"paired":false}')).toBeNull();
  });

  test('a code the helper put in the address connects with nothing typed', () => {
    expect(pairFromHash('#pair=K7QM-3WTZ')).toEqual({ code: 'K7QM-3WTZ', port: 7466 });
    expect(pairFromHash('#pair=k7qm3wtz')).toEqual({ code: 'K7QM-3WTZ', port: 7466 });
    expect(pairFromHash('#pair=K7QM-3WTZ&port=7499')).toEqual({ code: 'K7QM-3WTZ', port: 7499 });
    expect(pairFromHash('#pair=K7QM-3WTZ&port=nope')).toEqual({ code: 'K7QM-3WTZ', port: 7466 });
    expect(pairFromHash('')).toBeNull();
    expect(pairFromHash('#petal=abc')).toBeNull();
  });

  test('one click: the page opens petals:// with a code of its own, which the app takes', () => {
    expect(startLink('abcdEFGH2345', 'claude')).toBe(
      'petals://start?code=abcdEFGH2345&agent=claude',
    );
    expect(startLink('abcdEFGH2345', 'codex', 7499)).toBe(
      'petals://start?code=abcdEFGH2345&agent=codex&port=7499',
    );
    const code = codeFrom(new Uint8Array(20).fill(7));
    expect(code).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(code).toHaveLength(20);
  });

  test('a new conversation reloads the page on it, and starts the agent asked for', () => {
    expect(startAddress('/make', 'exp_1', 'claude')).toBe(
      '/make?terminal=1&elsewhere=exp_1#start=claude',
    );
    expect(startFromHash('#start=codex')).toBe('codex');
    expect(startFromHash('#start=other')).toBeNull();
    expect(startFromHash('#pair=K7QM-3WTZ')).toBeNull();
  });

  test('a code reads however it was typed', () => {
    expect(pairingCode('k7qm3wtz')).toBe('K7QM-3WTZ');
    expect(pairingCode(' K7QM - 3WTZ ')).toBe('K7QM-3WTZ');
    expect(pairingCode('')).toBe('');
  });
});

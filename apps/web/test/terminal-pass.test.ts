// The terminal in the page (W10): what the page sends the helper and how it reads what comes back,
// against CONNECTORS's seam of 9 Nov.
import { describe, expect, test } from 'vitest';
import {
  helloFrame,
  helperUrl,
  pairingCode,
  readControl,
  resizeFrame,
} from '../lib/terminal-pass.ts';

describe('the terminal in the page', () => {
  test('talks only to this computer', () => {
    expect(helperUrl()).toBe('ws://127.0.0.1:7466/pty');
  });

  test('the first frame says who is asking and how big the terminal is', () => {
    expect(JSON.parse(helloFrame({ pair: 'K7QM-3WTZ' }, { cols: 120, rows: 32 }))).toEqual({
      pair: 'K7QM-3WTZ',
      cols: 120,
      rows: 32,
    });
    expect(JSON.parse(helloFrame({ token: 't' }, { cols: 80, rows: 24 }))).toEqual({
      token: 't',
      cols: 80,
      rows: 24,
    });
  });

  test('a resize is exactly the one JSON the helper reads as one', () => {
    expect(resizeFrame({ cols: 90, rows: 30 })).toBe('{"resize":{"cols":90,"rows":30}}');
  });

  test('control frames: paired, exit, refused, and anything else is nothing', () => {
    expect(readControl('{"paired":true,"token":"abc","agent":"claude"}')).toEqual({
      kind: 'paired',
      token: 'abc',
      agent: 'claude',
    });
    expect(readControl('{"exit":0}')).toEqual({ kind: 'exit', code: 0 });
    expect(readControl('{"error":"wrong code"}')).toEqual({ kind: 'refused', why: 'wrong code' });
    expect(readControl('ls -la')).toBeNull();
    expect(readControl('{"paired":true}')).toBeNull();
  });

  test('a code reads however it was typed', () => {
    expect(pairingCode('k7qm3wtz')).toBe('K7QM-3WTZ');
    expect(pairingCode(' K7QM - 3WTZ ')).toBe('K7QM-3WTZ');
    expect(pairingCode('')).toBe('');
  });
});

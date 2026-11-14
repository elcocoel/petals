// A claim names a NEAR account with `_` written %5F (CAIP-10, core's claims/refs.ts), where a reading keeps the
// account's own `_`: matching a claim to the accounts on a map reads them as one.
import { describe, expect, test } from 'vitest';
import { aboutOneOf } from '../src/mapping-claims.ts';

describe('a claim finds its account on a map', () => {
  test("a NEAR account's %5F is its _, either way round; an EVM address in any case", () => {
    const accounts = new Set(['near:mainnet:0_o.starpause.near', 'eip155:1:0xabc']);
    expect(aboutOneOf(accounts, 'near:mainnet:0%5Fo.starpause.near')).toBe(true);
    expect(aboutOneOf(accounts, 'near:mainnet:0%5fo.starpause.near')).toBe(true);
    expect(aboutOneOf(accounts, 'near:mainnet:0_o.starpause.near')).toBe(true);
    expect(aboutOneOf(accounts, 'eip155:1:0xABC')).toBe(true);
    expect(aboutOneOf(accounts, 'near:mainnet:0o.starpause.near')).toBe(false);
  });
});

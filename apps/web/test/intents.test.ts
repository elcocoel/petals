// Paying with any token from any chain through NEAR Intents (Elco, 10 Nov): what's offered, how it's
// named, the dollars a person types, and what each state says.
import { describe, expect, test } from 'vitest';
import {
  chainName,
  dollarsOf,
  intentWords,
  isUnderWay,
  statusLine,
  tokenChoices,
} from '../lib/intents.ts';

const token = (symbol: string, chain: string) => ({
  asset: `${chain}:${symbol}`,
  chain,
  symbol,
  decimals: 6,
  usd: 1,
});

describe('what a person can pay with', () => {
  test('a chain’s tokens together, the chains with the most first, each named as people say it', () => {
    const groups = tokenChoices([
      token('AERO', 'base'),
      token('UNI', 'eth'),
      token('LINK', 'eth'),
      token('JUP', 'sol'),
    ]);
    expect(groups.map((g) => g.group)).toEqual(['Ethereum', 'Base', 'Solana']);
    expect(groups[0]?.choices).toEqual([
      { value: 'eth:UNI', label: 'UNI on Ethereum' },
      { value: 'eth:LINK', label: 'LINK on Ethereum' },
    ]);
  });

  test('what most people hold comes first, in its own group, and isn’t listed twice (#78)', () => {
    const groups = tokenChoices([
      token('SHITZU', 'near'),
      token('wNEAR', 'near'),
      token('USDC', 'base'),
      token('USDC', 'eth'),
      token('ETH', 'eth'),
    ]);
    expect(groups.map((g) => g.group)).toEqual(['Common', 'NEAR']);
    expect(groups[0]?.choices.map((c) => c.label)).toEqual([
      'USDC on Ethereum',
      'USDC on Base',
      'ETH on Ethereum',
      'wNEAR on NEAR',
    ]);
    expect(groups[1]?.choices.map((c) => c.label)).toEqual(['SHITZU on NEAR']);
  });

  test('a chain with no name here is its id, capitalised', () => {
    expect(chainName('bsc')).toBe('BNB Chain');
    expect(chainName('miden')).toBe('Miden');
  });
});

describe('the dollars typed', () => {
  test('a number above 0 and up to 1,000, to the cent; anything else is none', () => {
    expect(dollarsOf('5')).toBe(5);
    expect(dollarsOf('$12.345')).toBe(12.35);
    expect(dollarsOf('1,000')).toBe(1000);
    expect(dollarsOf('0')).toBeNull();
    expect(dollarsOf('1001')).toBeNull();
    expect(dollarsOf('five')).toBeNull();
  });
});

describe('where it stands', () => {
  test('under way until it lands, is refunded or fails', () => {
    expect(isUnderWay('PENDING_DEPOSIT')).toBe(true);
    expect(isUnderWay('PROCESSING')).toBe(true);
    expect(isUnderWay('SUCCESS')).toBe(false);
    expect(isUnderWay('REFUNDED')).toBe(false);
  });

  test('each state in plain words, and what landed in dollars', () => {
    expect(statusLine({ status: 'PENDING_DEPOSIT' })).toBe(intentWords.status.PENDING_DEPOSIT);
    expect(statusLine({ status: 'SUCCESS', credited_usd: 5 })).toBe(
      'Added $5.00. Send your question again.',
    );
  });
});

// Paying with any token from any chain through NEAR Intents: what's offered and in what order, what a search
// finds, the chain it opens on, the line under the address, the history, and the logos.
import { describe, expect, test } from 'vitest';
import {
  chainName,
  chainsOf,
  historyRows,
  homeChain,
  intentWords,
  isUnderWay,
  quoteLine,
  type TopUpRow,
  tokensOn,
} from '../lib/intents.ts';
import { chainIcon, tokenIcon } from '../lib/token-icons.ts';

const token = (symbol: string, chain: string) => ({
  asset: `${chain}:${symbol}`,
  chain,
  symbol,
  decimals: 6,
  usd: 1,
});

const TOKENS = [
  token('SHITZU', 'near'),
  token('wNEAR', 'near'),
  token('USDC', 'near'),
  token('AERO', 'base'),
  token('USDC', 'base'),
  token('UNI', 'eth'),
  token('ETH', 'eth'),
  token('USDT(DEPRECATED)', 'eth'),
  token('USDT', 'eth'),
  token('USDC', 'eth'),
  token('JUP', 'sol'),
  token('A', 'miden'),
  token('B', 'miden'),
  token('C', 'miden'),
];

describe('what a person can pay with', () => {
  test('the chains most people hold on come first, then the ones with the most tokens', () => {
    expect(chainsOf(TOKENS).map((c) => c.chain)).toEqual(['eth', 'base', 'sol', 'near', 'miden']);
  });

  test('on a chain, the dollars and its own coin first, the rest by name, a replaced one last', () => {
    expect(tokensOn(TOKENS, 'eth').map((t) => t.symbol)).toEqual([
      'USDC',
      'USDT',
      'ETH',
      'UNI',
      'USDT(DEPRECATED)',
    ]);
    expect(tokensOn(TOKENS, 'near').map((t) => t.symbol)).toEqual(['USDC', 'wNEAR', 'SHITZU']);
  });

  test('a search finds tokens by symbol and chains by name, on every chain at once', () => {
    expect(chainsOf(TOKENS, 'usdc').map((c) => c.chain)).toEqual(['eth', 'base', 'near']);
    expect(tokensOn(TOKENS, 'base', 'usdc').map((t) => t.symbol)).toEqual(['USDC']);
    expect(tokensOn(TOKENS, 'sol', 'solana').map((t) => t.symbol)).toEqual(['JUP']);
    expect(chainsOf(TOKENS, 'nothing like it')).toEqual([]);
  });

  test('it opens on a chain the person has a wallet on, Ethereum first, else NEAR', () => {
    expect(homeChain(['NEAR', 'Ethereum'])).toBe('eth');
    expect(homeChain(['Solana', 'NEAR'])).toBe('sol');
    expect(homeChain(['NEAR'])).toBe('near');
    expect(homeChain([])).toBe('near');
  });

  test('a chain with no name here is its id, capitalised', () => {
    expect(chainName('bsc')).toBe('BNB Chain');
    expect(chainName('miden')).toBe('Miden');
  });
});

describe('the address', () => {
  test('it says to send any amount, never an exact one', () => {
    expect(intentWords.send('USDT', 'Ethereum')).toContain('any amount of USDT on Ethereum');
    expect(intentWords.send('USDT', 'Ethereum')).not.toMatch(/exactly/i);
  });

  test('one line under it: the fees, the least it takes and until when', () => {
    const line = quoteLine(
      {
        deposit_address: '0x1',
        amount_in_formatted: '1.000201',
        amount_in_usd: '1.0002',
        amount_out_usd: '0.9972',
        deadline: '2026-11-21T12:00:00Z',
        status: 'PENDING_DEPOSIT',
      },
      'USDT',
    );
    expect(line).toMatch(/^Fees about 0\.3% · at least 0\.9902 USDT · open until /);
  });

  test('a quote without its dollars still says the least it takes', () => {
    expect(
      quoteLine(
        { deposit_address: '0x1', amount_in_formatted: '0.0003', status: 'PENDING_DEPOSIT' },
        'ETH',
      ),
    ).toBe('at least 0.000297 ETH');
  });
});

describe('the history', () => {
  const row = (over: Partial<TopUpRow>): TopUpRow => ({
    deposit_address: '0x1',
    created_at: '2026-11-14T16:00:00Z',
    origin_asset: 'eth:USDT',
    deadline: '2026-11-21T16:00:00Z',
    status: 'SUCCESS',
    sent: '12',
    sent_usd: '12',
    landed_near: '3.517',
    landed_usd: '11.96',
    ...over,
  });

  test('what was sent, what it should land as at today’s price, and what landed', () => {
    const [r] = historyRows([row({})], TOKENS, 3.4);
    expect(r).toMatchObject({
      sent: '12 USDT on Ethereum',
      expected: '3.529 NEAR',
      landed: '3.517 NEAR',
      status: intentWords.state.SUCCESS,
    });
  });

  test('an address asked for and never paid isn’t a top-up; one on its way has nothing landed yet', () => {
    const rows = historyRows(
      [
        row({
          deposit_address: 'a',
          status: 'PENDING_DEPOSIT',
          sent: null,
          sent_usd: null,
          landed_near: null,
        }),
        row({ deposit_address: 'b', status: 'PROCESSING', landed_near: null }),
      ],
      TOKENS,
      3.4,
    );
    expect(rows.map((r) => r.key)).toEqual(['b']);
    expect(rows[0]?.landed).toBe(intentWords.nothing);
    expect(rows[0]?.status).toBe(intentWords.state.PROCESSING);
  });
});

describe('where it stands', () => {
  test('under way until it lands, is refunded or fails', () => {
    expect(isUnderWay('PENDING_DEPOSIT')).toBe(true);
    expect(isUnderWay('PROCESSING')).toBe(true);
    expect(isUnderWay('SUCCESS')).toBe(false);
    expect(isUnderWay('REFUNDED')).toBe(false);
  });
});

describe('the logos', () => {
  test('a chain’s and a token’s, a wrapped coin as the coin, a replaced one as itself', () => {
    expect(chainIcon('eth')).toBe('/icons/chains/eth.svg');
    expect(tokenIcon('USDT')).toBe('/icons/tokens/USDT.svg');
    expect(tokenIcon('wNEAR')).toBe('/icons/tokens/NEAR.svg');
    expect(tokenIcon('USDC(DEPRECATED)')).toBe('/icons/tokens/USDC.svg');
  });

  test('none where there’s no file: the first letter stands in', () => {
    expect(chainIcon('miden')).toBeNull();
    expect(tokenIcon('SHITZU')).toBeNull();
  });
});

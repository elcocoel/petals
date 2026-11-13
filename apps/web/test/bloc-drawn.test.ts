// The Highlight row offers a bloc only where its members are petals of the flower drawn: at least two of them,
// matched by the address alone, each choice saying how many are drawn and lighting those petals by their own ids.
import type { Blocs } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { blocChoices, blocWords } from '../lib/bloc-words.ts';

const blocs = (members: string[][]): Pick<Blocs, 'blocs'> => ({
  blocs: members.map((m, i) => ({ id: `bloc:${i}`, members: m, pairs: m.length })),
});

describe('blocs against the flower drawn', () => {
  test('a bloc with two or more members drawn is offered, saying how many', () => {
    const drawn = ['near:mainnet:a.near', 'near:mainnet:b.near', 'near:mainnet:c.near'];
    const [only] = blocChoices(blocs([['a.near', 'b.near', 'z.near']]), drawn);
    expect(only?.label).toBe(`${blocWords.alike(3)} · ${blocWords.drawn(2, 3)}`);
    expect(only?.members).toEqual(['near:mainnet:a.near', 'near:mainnet:b.near']);
  });

  test('fewer than two drawn, the bloc is not offered', () => {
    const drawn = ['eip155:1:0xAbC'];
    expect(
      blocChoices(
        blocs([
          ['0xabc', '0xdef'],
          ['0x1', '0x2'],
        ]),
        drawn,
      ),
    ).toEqual([]);
  });

  test('addresses match whatever their prefix or case', () => {
    const drawn = ['eip155:1:0xAbC', '0xDeF'];
    const [only] = blocChoices(blocs([['eip155:100:0xabc', '0xdef']]), drawn);
    expect(only?.members).toEqual(['eip155:1:0xAbC', '0xDeF']);
  });
});

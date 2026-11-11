// A map card's value (#91, value/v2 on 11 Nov): a treasury's priced total and how many of its assets have no
// price beside the token's own worth; none for a value/v1.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type Value, validateValue } from '@petal/core';
import { describe, expect, test } from 'vitest';
import { cardValue } from '../src/value-store.ts';

const fixture = (v: 1 | 2): Value => {
  const d = JSON.parse(
    readFileSync(
      join(import.meta.dirname, '..', '..', 'core', 'schema', 'fixtures', `value.v${v}.json`),
      'utf8',
    ),
  );
  const checked = validateValue(d);
  if (!checked.ok) throw new Error('fixture');
  return checked.value;
};

describe("a card's value", () => {
  test("value/v2: the treasury's priced total, and how many assets have no price", () => {
    expect(cardValue(fixture(2))).toMatchObject({
      treasury_usd: '415595873.80',
      treasury_unpriced: 0,
    });
  });
  test('value/v1: no treasury', () => {
    expect(cardValue(fixture(1))).toMatchObject({ treasury_usd: null, treasury_unpriced: null });
  });
});

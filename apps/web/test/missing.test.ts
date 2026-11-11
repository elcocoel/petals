// A map or a flower that isn't there gets the site's 404, not the API's words (#78).
import { describe, expect, test } from 'vitest';
import { isMissing } from '../lib/missing.ts';

describe('what isn’t there', () => {
  test('none under that id, or an id that can’t be one', () => {
    expect(isMissing({ code: 'not_found', message: 'No map under that address.' })).toBe(true);
    expect(
      isMissing({ code: 'bad_input', message: '/id must match pattern "^[0-9a-f]{24}$"' }),
    ).toBe(true);
  });
  test('anything else keeps its own page', () => {
    expect(isMissing({ code: 'bad_input', message: '/view must be a string' })).toBe(false);
    expect(isMissing({ code: 'upstream', message: 'The server didn’t answer.' })).toBe(false);
  });
});

// A visitor's own view, kept by its hash in their browser: the cookie says the hash and
// nothing else, and only a hash is read back from it.
import { describe, expect, test } from 'vitest';
import { VISITOR_VIEW_COOKIE, visitorViewCookie, visitorViewOf } from '../lib/visitor-view.ts';

const HASH = 'ab'.repeat(32);

describe('a visitor view cookie', () => {
  test('reads the hash among the other cookies', () => {
    expect(visitorViewOf(`a=1; ${VISITOR_VIEW_COOKIE}=${HASH}; b=2`)).toBe(HASH);
  });
  test('reads nothing where there is no hash', () => {
    expect(visitorViewOf(null)).toBeNull();
    expect(visitorViewOf('a=1')).toBeNull();
    expect(visitorViewOf(`${VISITOR_VIEW_COOKIE}=not-a-hash`)).toBeNull();
  });
  test('keeps the hash for the site, and forgets it', () => {
    expect(visitorViewCookie(HASH)).toContain(`${VISITOR_VIEW_COOKIE}=${HASH}; path=/`);
    expect(visitorViewCookie(null)).toContain('max-age=0');
  });
});

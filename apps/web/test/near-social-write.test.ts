// NEAR Social's writes (Elco, 10 Nov): the picture's borsh payload, byte for byte as the standard's own
// Python writes it (research/spikes/near-social-2026-11-09/skill.md, section 4).
import { describe, expect, test } from 'vitest';
import { base64Of, FASTFS_SIMPLE_MAX, fastfsSimple } from '../lib/near-social.ts';

describe('fastfsSimple', () => {
  test('a Simple payload: 0, the path, Some, the mime type, the content, each sized as a u32', () => {
    const p = fastfsSimple('media/ab.png', 'image/png', Uint8Array.of(9, 8, 7));
    expect(Array.from(p)).toEqual([
      0,
      12,
      0,
      0,
      0,
      ...new TextEncoder().encode('media/ab.png'),
      1,
      9,
      0,
      0,
      0,
      ...new TextEncoder().encode('image/png'),
      3,
      0,
      0,
      0,
      9,
      8,
      7,
    ]);
  });

  test('a file over 1 MiB is refused, since it takes several calls', () => {
    expect(() =>
      fastfsSimple('media/x.png', 'image/png', new Uint8Array(FASTFS_SIMPLE_MAX + 1)),
    ).toThrow();
  });

  test('base64 as the RPC shows a call’s args', () => {
    expect(base64Of(Uint8Array.of(0, 1, 2, 250))).toBe('AAEC+g==');
  });
});

import { draftOf, fastfsPath, fastfsUri, profileArgs, txOutcome } from '../lib/near-social.ts';

describe('profileArgs', () => {
  const before = {
    name: 'Old name',
    about: 'Old bio',
    avatar: null,
    links: [
      { service: 'github', value: 'old' },
      { service: 'x', value: '@old' },
    ],
  };

  test('a new profile writes only what was typed', () => {
    expect(
      profileArgs(
        null,
        { name: ' Mara ', about: '', links: [{ service: 'GitHub', value: 'mara' }] },
        null,
      ),
    ).toEqual({ 'profile/name': 'Mara', 'profile/links/github': 'mara' });
  });

  test('an edit removes what was cleared or dropped, and keeps the rest', () => {
    expect(
      profileArgs(
        before,
        { name: 'New name', about: '', links: [{ service: 'github', value: 'new' }] },
        null,
      ),
    ).toEqual({
      'profile/name': 'New name',
      'profile/about': null,
      'profile/links/github': 'new',
      'profile/links/x': null,
    });
  });

  test('a new picture goes in as its fastfs:// address', () => {
    const uri = fastfsUri('mara.near', fastfsPath('ab12', 'image/webp'));
    expect(uri).toBe('fastfs://mara.near/social/media/ab12.webp');
    expect(profileArgs(before, draftOf(before), uri)['profile/avatar']).toBe(uri);
  });

  test('a link with no service or no value is left out', () => {
    expect(
      profileArgs(null, { name: '', about: '', links: [{ service: '', value: 'x' }] }, null),
    ).toEqual({});
  });
});

describe('txOutcome', () => {
  test('not seen yet', () => expect(txOutcome({ indexed: false })).toEqual({ kind: 'waiting' }));
  test('every key accepted', () =>
    expect(
      txOutcome({
        indexed: true,
        actions: [{ status: 'ok', keys: [{ key: 'profile/name', status: 'ok' }] }],
      }),
    ).toEqual({ kind: 'ok' }));
  test('a key refused says which and why', () =>
    expect(
      txOutcome({
        indexed: true,
        actions: [
          {
            status: 'ok',
            keys: [{ key: 'profile/avatar', status: 'invalid', reason: 'not a fastfs uri' }],
          },
        ],
      }),
    ).toEqual({ kind: 'refused', why: ['profile/avatar: not a fastfs uri'] }));
});

import { fromPetals, keptAvatar, toPetals } from '../lib/near-social.ts';

describe('Petals’ own copy', () => {
  test('what the editor saves: the whole profile, links as NEAR Social keys them', () => {
    expect(
      toPetals(
        {
          name: ' Mara ',
          about: '',
          links: [
            { service: 'GitHub', value: 'mara' },
            { service: '', value: 'x' },
          ],
        },
        'data:image/webp;base64,AAA=',
      ),
    ).toEqual({
      name: 'Mara',
      about: null,
      avatar: 'data:image/webp;base64,AAA=',
      banner: null,
      location: null,
      links: { github: 'mara' },
    });
  });

  test('shown as a profile, its picture as a browser can draw it', () => {
    expect(
      fromPetals({
        name: 'Mara',
        about: null,
        avatar: 'fastfs://mara.near/social/media/ab.webp',
        links: {},
      }),
    ).toEqual({
      name: 'Mara',
      about: null,
      avatar: 'https://main.fastfs.io/mara.near/social/media/ab.webp',
      links: [],
    });
  });

  test('a picture is kept as Petals keeps it: new, its own, or NEAR Social’s as fastfs://', () => {
    expect(keptAvatar('https://main.fastfs.io/mara.near/social/media/ab.webp')).toBe(
      'fastfs://mara.near/social/media/ab.webp',
    );
    expect(keptAvatar('https://petal-flowers.vercel.app/api/v1/media/ab.webp')).toBe(
      'https://petal-flowers.vercel.app/api/v1/media/ab.webp',
    );
    expect(keptAvatar('https://elsewhere.example/a.png')).toBeNull();
  });

  test('the banner and location the editor doesn’t show stay as they were', () => {
    const p = toPetals({ name: 'M', about: '', links: [] }, null, {
      banner: 'fastfs://m/social/b.webp',
      location: 'Lisbon',
    });
    expect([p.banner, p.location]).toEqual(['fastfs://m/social/b.webp', 'Lisbon']);
  });

  test('a service keeps letters, digits and _ only', () => {
    expect(
      toPetals({ name: '', about: '', links: [{ service: 'Tele-gram', value: 'm' }] }, null).links,
    ).toEqual({ telegram: 'm' });
  });

  test('an empty copy is none', () => {
    expect(fromPetals({ name: null, about: null, avatar: null, links: {} })).toBeNull();
    expect(fromPetals(null)).toBeNull();
  });
});

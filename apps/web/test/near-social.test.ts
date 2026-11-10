// A NEAR account's public profile on NEAR Social, as the lobby shows it (Elco, 9 Nov): plain text, links
// as declared, nothing when there's nothing.
import { describe, expect, test } from 'vitest';
import { socialProfile } from '../lib/near-social.ts';

// GET https://api2.near.social/v1/accounts/mob.near, 9 Nov 2026
const mob = {
  account_id: 'mob.near',
  has_profile: true,
  name: 'Eugene The Dream',
  about: 'Founder of near.social and fastnear.com',
  avatar: 'fastfs://mob.near/social/media/16bf.webp',
  avatar_url: 'https://main.fastfs.io/mob.near/social/media/16bf.webp',
  location: 'Remote',
  links: {
    github: 'evgenykuzyakov',
    telegram: 'ekuzyakov',
    website: 'near.social/mob.near',
    x: 'ekuzyakov',
  },
  counts: { followers: 49, following: 129, posts: 4 },
};

describe('socialProfile', () => {
  test('a profile reads as its name, bio, picture and declared links, in the API’s order', () => {
    expect(socialProfile(mob)).toEqual({
      name: 'Eugene The Dream',
      about: 'Founder of near.social and fastnear.com',
      avatar: 'https://main.fastfs.io/mob.near/social/media/16bf.webp',
      links: [
        { service: 'github', value: 'evgenykuzyakov' },
        { service: 'telegram', value: 'ekuzyakov' },
        { service: 'website', value: 'near.social/mob.near' },
        { service: 'x', value: 'ekuzyakov' },
      ],
    });
  });

  test('no profile, or one with nothing filled in, is nothing to show', () => {
    expect(
      socialProfile({ account_id: 'x.near', has_profile: false, name: '', links: {} }),
    ).toBeNull();
    expect(
      socialProfile({ has_profile: true, name: '  ', about: '', links: { x: '' } }),
    ).toBeNull();
    expect(socialProfile(null)).toBeNull();
    expect(socialProfile('not json')).toBeNull();
  });

  test('a picture counts only at an https address; empty links drop out', () => {
    const p = socialProfile({
      has_profile: true,
      name: 'n',
      avatar_url: 'javascript:alert(1)',
      links: { x: 'h', github: '', telegram: 3 },
    });
    expect(p?.avatar).toBeNull();
    expect(p?.links).toEqual([{ service: 'x', value: 'h' }]);
  });
});

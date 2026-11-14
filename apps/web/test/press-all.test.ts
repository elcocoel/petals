// One press over many maps, as the Mapping box shows it with no single map in front.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { PublishPress } from '../components/PublishPress.tsx';
import { pressAllView, pressAllWords } from '../lib/press-all.ts';
import { nearSigner, publishWords } from '../lib/publish-press.ts';

const READ = {
  author: 'near:mainnet:petals.near',
  maps: [
    {
      about: 'eip155:100:0x372fc5a6b0b12ae174f09f6fc849a83de6b503b6',
      name: 'RaidGuild',
      layers: 3,
    },
    { about: 'near:mainnet:marketing.sputnik-dao.near', name: 'marketing DAO', layers: 1 },
  ],
  left: [
    { about: 'near:mainnet:old.sputnik-dao.near', why: 'Nothing new since your last version.' },
  ],
};

describe('one press over many maps', () => {
  test('a person with nothing anywhere to publish meets no press', () => {
    expect(pressAllView(null, 'ready', null)).toBeNull();
    expect(pressAllView({ ...READ, maps: [] }, 'ready', null)).toBeNull();
  });

  test('every map that goes, with its layers, then the press, then why the rest stay', () => {
    const v = pressAllView(READ, 'ready', null);
    if (!v) throw new Error('a press with maps to publish');
    expect(v.across).toBe(pressAllWords.across(2));
    expect(v.press).toBe(pressAllWords.press);
    const html = renderToStaticMarkup(
      createElement(PublishPress, { view: v, onPublish: () => {} }),
    );
    expect(html).toContain('RaidGuild');
    expect(html).toContain(pressAllWords.layers(3));
    expect(html).toContain('marketing DAO');
    expect(html).toContain(pressAllWords.why);
    expect(html).toContain('Nothing new since your last version.');
  });

  test('says beforehand when the wallet signs in first, a new QR by phone', () => {
    expect(pressAllView(READ, 'ready', null, true)?.sign).toBe(publishWords.signInFirst);
    expect(pressAllView(READ, 'ready', null)?.sign).toBe(publishWords.sign);
  });

  test('while the wallet signs, and once it landed', () => {
    expect(pressAllView(READ, 'signing', null)?.press).toBe(publishWords.signing);
    const done = pressAllView(READ, 'published', pressAllWords.published(2));
    expect(done?.press).toBeNull();
    expect(done?.said).toBe('On the shared map in your name: 2 maps.');
  });
});

describe('the press over many maps signs as the profile’s NEAR wallet', () => {
  const w = (network: string, account_id: string) => ({
    network,
    account_id,
    proved_at: '2026-11-13T00:00:00Z',
    author: network === 'eip155' ? `eip155:1:${account_id}` : `near:${network}:${account_id}`,
  });
  const wallets = [w('eip155', '0xabc'), w('mainnet', 'first.near'), w('mainnet', 'own.near')];

  test('the NEAR wallet this session signed in with, even when it isn’t the first', () => {
    expect(nearSigner({ network: 'mainnet', account: 'own.near', wallets })?.author).toBe(
      'near:mainnet:own.near',
    );
  });

  test('signed in with a linked Ethereum wallet: the first NEAR wallet, never the Ethereum one', () => {
    expect(nearSigner({ network: 'eip155', account: '0xabc', wallets })?.author).toBe(
      'near:mainnet:first.near',
    );
  });

  test('no NEAR wallet: nobody to sign as', () => {
    expect(
      nearSigner({ network: 'eip155', account: '0xabc', wallets: wallets.slice(0, 1) }),
    ).toBeNull();
  });
});

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
  test('one card in every state: with nothing to publish, its press waits and its line says so', () => {
    expect(pressAllView(null, 'ready', null)).toBeNull();
    const none = pressAllView({ ...READ, maps: [] }, 'ready', null);
    expect(none).toMatchObject({
      title: pressAllWords.kept,
      press: pressAllWords.press,
      step: pressAllWords.none,
      busy: true,
    });
  });

  test('a slow read says it is reading, and a refused one says why, never looking empty', () => {
    const reading = pressAllView(null, 'ready', null, false, { reading: true });
    expect(reading?.step).toBe(pressAllWords.reading);
    expect(reading).toMatchObject({ title: pressAllWords.kept, running: true, busy: true });
    const refused = pressAllView(null, 'ready', null, false, { unread: 'Not signed in.' });
    expect(refused?.step).toBe(pressAllWords.unread('Not signed in.'));
    expect(refused?.busy).toBe(true);
  });

  test('the press first, with one line of what goes; the maps and why the rest stay, folded under it', () => {
    const v = pressAllView(READ, 'ready', null);
    if (!v) throw new Error('a press with maps to publish');
    expect(v.title).toBe(pressAllWords.what(2, 4));
    expect(v.press).toBe(pressAllWords.press);
    const html = renderToStaticMarkup(
      createElement(PublishPress, { view: v, onPublish: () => {} }),
    );
    // the press comes before the folded list
    expect(html.indexOf(pressAllWords.press)).toBeLessThan(html.indexOf('<details'));
    expect(html.indexOf('<details')).toBeLessThan(html.indexOf('RaidGuild'));
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

  test('the true step from the first second: preparing, then the wallet only once it is asked, then sending', () => {
    expect(pressAllView(READ, 'preparing', null)).toMatchObject({
      step: pressAllWords.preparing(2),
      running: true,
      busy: true,
    });
    expect(pressAllView(READ, 'waiting', null)?.step).toBe(publishWords.waiting);
    expect(pressAllView(READ, 'waiting', null, true)?.step).toBe(publishWords.waitingSignIn);
    expect(pressAllView(READ, 'sending', null)?.step).toBe(publishWords.sending);
    expect(pressAllView(READ, 'ready', null)?.step).toBeNull();
    const done = pressAllView(READ, 'published', pressAllWords.published(2));
    expect(done).toMatchObject({
      title: pressAllWords.what(2, 4),
      press: pressAllWords.press,
      step: 'On the shared map in your name: 2 maps.',
      busy: true,
    });
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

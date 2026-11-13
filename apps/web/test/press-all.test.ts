// One press over many maps, as the Mapping box shows it with no single map in front.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { PublishPress } from '../components/PublishPress.tsx';
import { pressAllView, pressAllWords } from '../lib/press-all.ts';
import { publishWords } from '../lib/publish-press.ts';

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

  test('while the wallet signs, and once it landed', () => {
    expect(pressAllView(READ, 'signing', null)?.press).toBe(publishWords.signing);
    const done = pressAllView(READ, 'published', pressAllWords.published(2));
    expect(done?.press).toBeNull();
    expect(done?.said).toBe('On the shared map in your name: 2 maps.');
  });
});

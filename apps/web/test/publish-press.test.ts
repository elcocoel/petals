// Publishing what a person kept about a map, with one press (Elco, 12 Nov).
import { describe, expect, test } from 'vitest';
import { publishPressView, publishWords } from '../lib/publish-press.ts';

const data = {
  about: 'eip155:100:0xf02f',
  name: 'RaidGuild',
  ready: 63,
  private: [
    { id: 'a', subject: '0xced6', verb: 'named', why: 'No proposal declares it.' },
    { id: 'b', subject: '0xd26a', verb: 'named', why: 'No proposal declares it.' },
  ],
  published: 0,
};

describe('the publish press', () => {
  test('says how many can go and how many stay, and why the rest stay, folded', () => {
    const v = publishPressView(data, 'ready', null);
    expect(v?.press).toBe(publishWords.press);
    expect(v?.counts).toBe('63 can go on the shared map in your name; 2 stay private.');
    expect(v?.why?.lines).toEqual([
      '0xced6: No proposal declares it.',
      '0xd26a: No proposal declares it.',
    ]);
  });

  test('is not there when nothing can go', () => {
    expect(publishPressView({ ...data, ready: 0 }, 'ready', null)).toBeNull();
    expect(publishPressView(null, 'ready', null)).toBeNull();
  });

  test('waits on the wallet, then says what went, or why not', () => {
    expect(publishPressView(data, 'signing', null)).toMatchObject({
      press: publishWords.signing,
      busy: true,
    });
    expect(publishPressView(data, 'published', publishWords.published(63))).toMatchObject({
      press: null,
      said: 'Published on the shared map: 63.',
    });
    expect(publishPressView(data, 'failed', publishWords.otherWallet)?.said).toBe(
      publishWords.otherWallet,
    );
  });
});

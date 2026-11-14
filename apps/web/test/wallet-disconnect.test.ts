// Disconnect in the Wallets card: on a linked Ethereum or Solana wallet's row, never on the NEAR account.
import { type ComponentProps, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { Wallets } from '../components/workspace/Wallets.tsx';
import { profilePageWords, walletRows } from '../lib/profile-view.ts';

const rows = walletRows([
  {
    network: 'mainnet',
    account_id: 'elcocoel.near',
    proved_at: '2026-11-13T10:00:00Z',
    author: 'near:mainnet:elcocoel.near',
  },
  {
    network: 'eip155',
    account_id: '0x18801a3997b2aba637dcd6a704a81bc081604c74',
    proved_at: '2026-11-13T10:00:00Z',
    author: 'eip155:1:0x18801a3997b2aba637dcd6a704a81bc081604c74',
  },
]);

const card = (props: Partial<ComponentProps<typeof Wallets>>) =>
  renderToStaticMarkup(createElement(Wallets, { wallets: rows, onRemove: () => {}, ...props }));

describe('Disconnect a linked wallet', () => {
  test('an Ethereum or Solana row carries its CAIP-10; the NEAR account none', () => {
    expect(rows[0]?.caip10).toBeUndefined();
    expect(rows[1]?.caip10).toBe('eip155:1:0x18801a3997b2aba637dcd6a704a81bc081604c74');
  });

  test('one Disconnect, on the Ethereum row, and what it did said under the list', () => {
    const html = card({ removed: profilePageWords.disconnected('0x18…4c74') });
    expect(html.split(`>${profilePageWords.disconnect}<`)).toHaveLength(2);
    expect(html).toContain('Disconnected 0x18…4c74. It no longer signs in to this profile.');
  });

  test('without onRemove, no Disconnect', () => {
    expect(card({ onRemove: undefined })).not.toContain(`>${profilePageWords.disconnect}<`);
  });
});

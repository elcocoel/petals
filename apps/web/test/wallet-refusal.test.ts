// What a wallet's refusal says: plainly, with the wallet's name, never nothing.
import { describe, expect, test } from 'vitest';
import { doorWords } from '../lib/door-words.ts';
import { profilePageWords, walletRefusal } from '../lib/profile-view.ts';

describe('a wallet’s refusal, said plainly', () => {
  test('the person said no (EIP-1193 4001)', () => {
    expect(walletRefusal('MetaMask', { code: 4001, message: 'User rejected the request.' })).toBe(
      profilePageWords.declined('MetaMask'),
    );
  });
  test('a Solana wallet’s own words for no', () => {
    expect(walletRefusal('SafePal', new Error('User rejected the request.'))).toBe(
      profilePageWords.declined('SafePal'),
    );
  });
  test('a request already open (-32002)', () => {
    expect(walletRefusal('MetaMask', { code: -32002, message: 'Request already pending' })).toBe(
      profilePageWords.busy('MetaMask'),
    );
  });
  test('the wallet’s window closed before it answered (Meteor)', () => {
    expect(walletRefusal('Your NEAR wallet', new Error('Wallet closed'))).toBe(
      profilePageWords.closed('Your NEAR wallet'),
    );
    expect(walletRefusal('Your NEAR wallet', new Error('Action was cancelled'))).toBe(
      profilePageWords.closed('Your NEAR wallet'),
    );
  });
  test('Meteor’s own no', () => {
    expect(walletRefusal('Your NEAR wallet', new Error('User rejected'))).toBe(
      profilePageWords.declined('Your NEAR wallet'),
    );
  });
  test('the network, said as the network', () => {
    expect(walletRefusal('Your NEAR wallet', new TypeError('Failed to fetch'))).toBe(
      profilePageWords.network('Your NEAR wallet'),
    );
    expect(walletRefusal('Your NEAR wallet', new Error('Request timed out'))).toBe(
      profilePageWords.network('Your NEAR wallet'),
    );
  });
  test('anything else, in the wallet’s own words', () => {
    expect(walletRefusal('SafePal', new Error('Wallet is locked'))).toBe(
      'SafePal answered: Wallet is locked',
    );
  });
  test('at the door, a no is said without what adding a wallet would say', () => {
    expect(walletRefusal('MetaMask', { code: 4001 }, doorWords.declined)).toBe(
      'MetaMask declined.',
    );
  });
  test('an answer with no words still says something', () => {
    expect(walletRefusal('Your NEAR wallet', '')).toBe(
      profilePageWords.answered('Your NEAR wallet', profilePageWords.notAdded),
    );
  });
});

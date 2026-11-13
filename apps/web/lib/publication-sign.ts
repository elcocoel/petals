// The wallet's signature of a prepared publication (composition.md §2): the two lines the server gave, signed by
// the wallet the person chose, as its chain signs. NEAR with NEP-413 to this site and the nonce given, as signing
// in does; an EVM wallet with personal_sign (EIP-191); a Solana wallet with ed25519 over the text's bytes. No
// transaction, nothing spent. It rejects when the person says no or the wallet isn't in this browser.
import type { PreparedPublication, PublicationProof } from './agent-client.ts';
import { evmSign } from './evm-wallet.ts';
import type { ProvenWallet } from './profile-view.ts';
import { solanaSign } from './solana-wallet.ts';
import { signPrepared } from './wallet.ts';

export async function signPublication(
  wallet: ProvenWallet,
  p: PreparedPublication,
): Promise<PublicationProof> {
  if (wallet.network === 'eip155')
    return { standard: 'eip191', signature: await evmSign(p.text, wallet.account_id) };
  if (wallet.network === 'solana')
    return { standard: 'ed25519', signature: await solanaSign(p.text) };
  if (!p.nonce || !p.recipient) throw new Error('A NEAR signature needs the nonce and recipient.');
  const signed = await signPrepared(
    {
      entry_sha256: p.sha256,
      nonce: p.nonce,
      recipient: p.recipient,
      message: p.text,
      expires_at: '',
    },
    wallet.network === 'testnet' ? 'testnet' : 'mainnet',
  );
  return {
    standard: 'nep413',
    signature: signed.signature,
    public_key: signed.publicKey,
    nonce: p.nonce,
  };
}

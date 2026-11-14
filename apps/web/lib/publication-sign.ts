// The wallet's signature of a prepared publication (composition.md §2): the two lines the server gave, signed by
// the wallet the person chose, as its chain signs. NEAR with NEP-413 to this site and the nonce given, as signing
// in does; an EVM wallet with personal_sign (EIP-191); a Solana wallet with ed25519 over the text's bytes. A
// wallet the person added by phone signs on the phone, through the session it opened (lib/phone-wallet.ts). A NEAR
// wallet already connected on this page as the author signs with no new sign-in, so a NEAR phone wallet gets the
// request on its paired phone, no new QR (lib/wallet.ts signAs). No transaction, nothing spent. It rejects when the
// person says no or the wallet is neither here nor on a phone.
import type { PreparedPublication, PublicationProof } from './agent-client.ts';
import { evmSign } from './evm-wallet.ts';
import { phoneSessionFor, phoneSignEvm, phoneSignSolana } from './phone-wallet.ts';
import type { ProvenWallet } from './profile-view.ts';
import { solanaSign } from './solana-wallet.ts';
import { signAs, signsInFirst } from './wallet.ts';

const nearNetwork = (wallet: ProvenWallet) =>
  wallet.network === 'testnet' ? 'testnet' : 'mainnet';

export async function signPublication(
  wallet: ProvenWallet,
  p: PreparedPublication,
): Promise<PublicationProof> {
  if (wallet.network === 'eip155') {
    const phone = await phoneSessionFor('eip155', wallet.account_id);
    return {
      standard: 'eip191',
      signature: phone
        ? await phoneSignEvm(phone, p.text)
        : await evmSign(p.text, wallet.account_id),
    };
  }
  if (wallet.network === 'solana') {
    const phone = await phoneSessionFor('solana', wallet.account_id);
    return {
      standard: 'ed25519',
      signature: phone ? await phoneSignSolana(phone, p.text) : await solanaSign(p.text),
    };
  }
  if (!p.nonce || !p.recipient) throw new Error('A NEAR signature needs the nonce and recipient.');
  const signed = await signAs(
    {
      entry_sha256: p.sha256,
      nonce: p.nonce,
      recipient: p.recipient,
      message: p.text,
      expires_at: '',
    },
    nearNetwork(wallet),
    wallet.account_id,
  );
  return {
    standard: 'nep413',
    signature: signed.signature,
    public_key: signed.publicKey,
    nonce: p.nonce,
  };
}

/**
 * Whether the press asks this wallet to sign in before it signs: a NEAR wallet no wallet on this page is connected
 * as. By phone that is one more QR to scan, said before the press. Ethereum and Solana sign in their own session.
 */
export async function asksSignIn(wallet: ProvenWallet): Promise<boolean> {
  if (wallet.network === 'eip155' || wallet.network === 'solana') return false;
  return signsInFirst(nearNetwork(wallet), wallet.account_id);
}

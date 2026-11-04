// Browser only. Signing a prepared publish message with @hot-labs/near-connect 0.12, used
// directly (research R9: near-connect-hooks needs ^0.11.1). One prompt does sign-in and the
// NEP-413 signature together: connect({ signMessageParams }). Already connected: signMessage.
// near-connect touches window, localStorage and IndexedDB, so it is imported only when used.
import { base64ToBytes, type Prepared, type WalletSignature } from './publish.ts';

export async function signPrepared(
  p: Prepared,
  network: 'testnet' | 'mainnet' = 'testnet',
): Promise<WalletSignature> {
  const { NearConnector } = await import('@hot-labs/near-connect');
  const connector = new NearConnector({ network });
  const params = { message: p.message, recipient: p.recipient, nonce: base64ToBytes(p.nonce) };

  const connected = await connector.getConnectedWallet().catch(() => null);
  if (connected) {
    const s = await connected.wallet.signMessage({ ...params, network });
    return { accountId: s.accountId, publicKey: s.publicKey, signature: s.signature };
  }

  // The signed message comes with the wallet:signInAndSignMessage event, emitted inside connect().
  let signed: WalletSignature | null = null;
  connector.once('wallet:signInAndSignMessage', ({ accounts }) => {
    const a = accounts[0];
    if (a) {
      signed = {
        accountId: a.signedMessage.accountId || a.accountId,
        publicKey: a.signedMessage.publicKey,
        signature: a.signedMessage.signature,
      };
    }
  });
  await connector.connect({ signMessageParams: params });
  if (!signed) throw new Error('The wallet signed in but returned no signed message.');
  return signed;
}

// Browser only. Signing a prepared message with @hot-labs/near-connect 0.12, used directly
// (research R9: near-connect-hooks needs ^0.11.1). One prompt does sign-in and the NEP-413 signature
// together: connect({ signMessageParams }).
// near-connect touches window, localStorage and IndexedDB, so it is imported only when used.
import type { EventMap, NearConnector } from '@hot-labs/near-connect';
import type { PayAction } from './pay.ts';
import { base64ToBytes, type Prepared, type WalletSignature } from './publish.ts';

export type Network = 'testnet' | 'mainnet';

/**
 * The one network a person signs in on. A working default: real people hold mainnet wallets, and NEAR
 * Mobile and HOT are mainnet only. A testnet and a mainnet wallet are different people, even with the same
 * key, so this is a one-line edit and nothing else may name it.
 */
export const SIGN_IN_NETWORK: Network = 'mainnet';

// One connector per network for the life of the page: each one loads the wallet list and adds
// window listeners. MyNearWallet is shutting down.
const connectors = new Map<Network, NearConnector>();

async function connectorFor(network: Network): Promise<NearConnector> {
  const lib = await import('@hot-labs/near-connect');
  let connector = connectors.get(network);
  if (!connector) {
    connector = new lib.NearConnector({ network, excludedWallets: ['mynearwallet'] });
    connectors.set(network, connector);
  }
  return connector;
}

/**
 * Always asks through connect(), the one call that names the network. wallet.signMessage on the
 * connected wallet can't: near-connect remembers one wallet with no network in it, and Meteor signs
 * with the last account it saw, so the testnet button asked for a mainnet signature.
 */
export async function signPrepared(
  p: Prepared,
  network: Network = 'testnet',
): Promise<WalletSignature> {
  const connector = await connectorFor(network);

  // The signed message comes with the wallet:signInAndSignMessage event, emitted inside connect().
  let signed: WalletSignature | null = null;
  const onSigned = ({ accounts }: EventMap['wallet:signInAndSignMessage']) => {
    const a = accounts[0];
    if (a) {
      signed = {
        accountId: a.signedMessage.accountId || a.accountId,
        publicKey: a.signedMessage.publicKey,
        signature: a.signedMessage.signature,
      };
    }
  };
  connector.on('wallet:signInAndSignMessage', onSigned);
  try {
    await connector.connect({
      signMessageParams: {
        message: p.message,
        recipient: p.recipient,
        nonce: base64ToBytes(p.nonce),
      },
    });
  } finally {
    connector.off('wallet:signInAndSignMessage', onSigned);
  }
  if (!signed) throw new Error('The wallet signed in but returned no signed message.');
  return signed;
}

/**
 * Sends one action from the connected wallet to `receiverId` on `network` (B's payment step: a transfer,
 * or a deposit into the credit contract), and hands back what the wallet answered, for the server to check
 * on chain. It rejects when the person says no.
 */
export async function sendAction(
  network: Network,
  receiverId: string,
  action: PayAction,
): Promise<unknown> {
  const connector = await connectorFor(network);
  const wallet = await connector.wallet();
  return wallet.signAndSendTransaction({ network, receiverId, actions: [action] });
}

/**
 * Connects a wallet on `network`, or uses the one already connected there, and names its account: for a
 * write the person's own wallet signs (NEAR Social's), where no Petals sign-in is asked.
 */
export async function connectWallet(network: Network): Promise<string> {
  const connector = await connectorFor(network);
  const known = await connector.wallet().catch(() => null);
  const already = known ? await known.getAccounts({ network }).catch(() => []) : [];
  const accounts =
    already.length > 0 ? already : await (await connector.connect()).getAccounts({ network });
  const [first] = accounts;
  if (!first) throw new Error('The wallet connected but named no account.');
  return first.accountId;
}

/**
 * The account the wallet connected on `network` names, asking nothing; null when none is connected. For a
 * payment, which has to come from one of the person's own wallets (flow 3, 13 Nov).
 */
export async function connectedAccount(network: Network): Promise<string | null> {
  const connector = await connectorFor(network);
  const known = await connector.wallet().catch(() => null);
  const accounts = known ? await known.getAccounts({ network }).catch(() => []) : [];
  return accounts[0]?.accountId ?? null;
}

/**
 * One function call from the connected wallet, with JSON args or raw bytes (a FastFS file's borsh), no
 * deposit. Hands back what the wallet answered; it rejects when the person says no, and, with some
 * wallets, when the receipt fails, as NEAR Social's always does (CodeDoesNotExist).
 */
export async function callFunction(
  network: Network,
  receiverId: string,
  methodName: string,
  args: object | Uint8Array,
  gas: string,
): Promise<unknown> {
  const connector = await connectorFor(network);
  const wallet = await connector.wallet();
  return wallet.signAndSendTransaction({
    network,
    receiverId,
    actions: [{ type: 'FunctionCall', params: { methodName, args, gas, deposit: '0' } }],
  });
}

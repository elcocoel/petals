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
    connector = new lib.NearConnector({
      network,
      excludedWallets: ['mynearwallet'],
      // no WalletConnect here: its link opens the phone's default wallet, often an Ethereum one, which can't
      // sign for NEAR; NEAR's phone wallets (NEAR Mobile, Meteor, HOT) show QR codes that open their own app
    });
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

/** The wallet connected on `network` when it names `accountId`, asking nothing; else null. */
async function connectedAs(network: Network, accountId: string) {
  const connector = await connectorFor(network);
  const known = await connector.wallet().catch(() => null);
  const accounts = known ? await known.getAccounts({ network }).catch(() => []) : [];
  return known && accounts.some((a) => a.accountId === accountId) ? known : null;
}

/**
 * Signs a prepared message as `accountId` on `network`. When the wallet connected on this page already names that
 * account, that wallet signs with no new sign-in: a phone wallet gets the request on the phone it is paired with
 * (Meteor pushes a request on a signed-in account to its paired phone; a sign-in always opens a fresh QR). Else, or
 * when the wallet signs as another account (Meteor signs with the account it last signed in), it signs in and signs
 * together, as signPrepared does.
 */
export async function signAs(
  p: Prepared,
  network: Network,
  accountId: string,
): Promise<WalletSignature> {
  const known = await connectedAs(network, accountId);
  if (known) {
    const s = await known.signMessage({
      message: p.message,
      recipient: p.recipient,
      nonce: base64ToBytes(p.nonce),
      network,
      signerId: accountId,
    });
    if (s.accountId === accountId)
      return { accountId: s.accountId, publicKey: s.publicKey, signature: s.signature };
  }
  return signPrepared(p, network);
}

/**
 * Whether signing as `accountId` on `network` asks the wallet to sign in first (no wallet connected on this page
 * names that account), which by phone means one more QR to scan. Loads the connected wallet, asking nothing.
 */
export async function signsInFirst(network: Network, accountId: string): Promise<boolean> {
  return (await connectedAs(network, accountId)) === null;
}

type NearWallet = Awaited<ReturnType<NearConnector['wallet']>>;

/** Reads what a wallet keeps on this page, by key; injected by the page, so nothing here reaches a browser. */
export type ReadKept = (key: string) => string | null;

/**
 * The account a connected wallet signs transactions with on `network`. Most wallets name one account; Meteor
 * names every account it holds but signs with the one it last signed in (kept on this page), whatever signerId
 * it's given, so that one is read.
 */
async function signingAccount(
  wallet: NearWallet,
  network: Network,
  read?: ReadKept,
): Promise<string | null> {
  if (wallet.manifest.id === 'meteor-wallet' && read) {
    try {
      const kept = JSON.parse(read('meteor-wallet:meteor-account-data') ?? 'null') as {
        account?: { accountId?: string };
      } | null;
      if (kept?.account?.accountId) return kept.account.accountId;
    } catch {
      // nothing kept: the accounts it names
    }
  }
  const accounts = await wallet.getAccounts({ network }).catch(() => []);
  return accounts[0]?.accountId ?? null;
}

/** The wallet is signed in as another account than the one that must sign; nothing was sent. */
export class WrongAccount extends Error {
  readonly signer: string;
  readonly connected: string | null;
  constructor(signer: string, connected: string | null) {
    super(`The NEAR wallet is signed in as ${connected ?? 'no account'}, not ${signer}.`);
    this.signer = signer;
    this.connected = connected;
  }
}

/**
 * Sends one action to `receiverId` on `network` (a deposit into the credit contract, a withdrawal), signed as
 * `signerId`, the account signed in to Petals, and hands back what the wallet answered, for the server to check
 * on chain. With no wallet connected, or `signInFirst`, the wallet signs in first. When it would sign as another
 * account it sends nothing and rejects with WrongAccount; it rejects too when the person says no.
 */
export async function sendAs(
  network: Network,
  receiverId: string,
  action: PayAction,
  signerId: string,
  signInFirst = false,
  read?: ReadKept,
): Promise<unknown> {
  const connector = await connectorFor(network);
  const known = signInFirst ? null : await connector.wallet().catch(() => null);
  const wallet = known ?? (await connector.connect());
  const signing = await signingAccount(wallet, network, read);
  if (signing !== signerId) throw new WrongAccount(signerId, signing);
  return wallet.signAndSendTransaction({ network, signerId, receiverId, actions: [action] });
}

/**
 * Connects a wallet on `network`, or uses the one already connected there, and names its account: for a
 * write the person's own wallet signs (NEAR Social's), where no Petals sign-in is asked.
 */
export async function connectWallet(network: Network, read?: ReadKept): Promise<string> {
  const connector = await connectorFor(network);
  const known = await connector.wallet().catch(() => null);
  const already = known ? await signingAccount(known, network, read) : null;
  // the account it signs with, which for Meteor isn't always the first it names
  const account = already ?? (await signingAccount(await connector.connect(), network, read));
  if (!account) throw new Error('The wallet connected but named no account.');
  return account;
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

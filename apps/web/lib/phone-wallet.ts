// Browser only. A wallet on the person's phone, reached by scanning a QR code: WalletConnect (Reown), the way
// most phone wallets connect to a site (MetaMask, Phantom, Trust and the others), so nobody needs a browser
// extension. One client for the site, on its Reown project (a public client id, locked to the site's own
// address), loaded only when it's first asked for. It opens a session for one chain by a QR code, keeps it, and
// asks the phone for one signature at a time: a personal_sign of an Ethereum text, a solana_signMessage of a
// Solana one; nothing else, so no transaction and no spend. NEAR's own phone wallets (NEAR Mobile, Meteor) show
// their QR codes in NEAR's picker, which gets the same client for any other phone wallet (lib/wallet.ts).
// Pure of React; viewmodels call it.
import type SignClient from '@walletconnect/sign-client';

/** The site's Reown project: a public id, which works only on the addresses the project allows. */
export const WALLETCONNECT_PROJECT_ID = '7db52283bf5479c042d834df2f1f239c';

/** A phone wallet, as the person picks it beside the browser's own wallets. */
export const PHONE = 'phone';

const SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

type Chain = 'eip155' | 'solana';

let client: Promise<SignClient> | null = null;

/** The site's one WalletConnect client, made the first time it's asked for. */
export function walletConnectClient(): Promise<SignClient> {
  client ??= import('@walletconnect/sign-client').then(({ SignClient: Client }) => {
    const site = globalThis.location?.origin ?? '';
    return Client.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      metadata: {
        name: 'Petals',
        description: 'See who holds power.',
        url: site,
        icons: [`${site}/icon.png`],
      },
    });
  });
  return client;
}

const NAMESPACES = {
  eip155: { chains: ['eip155:1'], methods: ['personal_sign'], events: [] as string[] },
  solana: { chains: [SOLANA_MAINNET], methods: ['solana_signMessage'], events: [] as string[] },
};

/** A phone wallet's session for one chain: its topic, the account it named there, and its own name. */
export interface PhoneSession {
  topic: string;
  address: string;
  /** What the wallet calls itself (MetaMask, Phantom…), for the page to name it while it's asked. */
  name: string;
}

const PHONE_NAME = 'Your phone wallet';

const accountOf = (caip10: string) => caip10.split(':').slice(2).join(':');

/**
 * The phone wallet's session for a chain: one already open, or a new one, whose QR code `show` draws until the
 * phone approves. Rejects when the person says no on the phone.
 */
export async function phoneSession(
  chain: Chain,
  show: (uri: string) => void,
): Promise<PhoneSession> {
  const c = await walletConnectClient();
  const open = c.session.getAll().find((s) => (s.namespaces[chain]?.accounts.length ?? 0) > 0);
  const first = open?.namespaces[chain]?.accounts[0];
  if (open && first)
    return {
      topic: open.topic,
      address: accountOf(first),
      name: open.peer.metadata.name || PHONE_NAME,
    };
  const { uri, approval } = await c.connect({ optionalNamespaces: { [chain]: NAMESPACES[chain] } });
  if (uri) show(uri);
  const session = await approval();
  const account = session.namespaces[chain]?.accounts[0];
  if (!account) throw new Error('The phone wallet named no account.');
  return {
    topic: session.topic,
    address: accountOf(account),
    name: session.peer.metadata.name || PHONE_NAME,
  };
}

/** The QR code of a WalletConnect address, as a picture's data: URL. */
export async function qrOf(uri: string): Promise<string> {
  const { toDataURL } = await import('qrcode');
  return toDataURL(uri, { margin: 1, width: 240 });
}

const hexOf = (text: string) =>
  `0x${Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, '0')).join('')}`;

/** The phone's personal_sign (EIP-191) of an Ethereum text, as 0x… Rejects when the person says no. */
export async function phoneSignEvm(s: PhoneSession, message: string): Promise<string> {
  const c = await walletConnectClient();
  return (await c.request({
    topic: s.topic,
    chainId: 'eip155:1',
    request: { method: 'personal_sign', params: [hexOf(message), s.address] },
  })) as string;
}

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const base58Of = (bytes: Uint8Array) => {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = '';
  while (n > 0n) {
    out = BASE58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
};

const bytesOf58 = (text: string) => {
  let n = 0n;
  for (const ch of text) {
    const i = BASE58.indexOf(ch);
    if (i < 0) throw new Error('The phone wallet sent a signature that isn’t base58.');
    n = n * 58n + BigInt(i);
  }
  const out: number[] = [];
  while (n > 0n) {
    out.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const ch of text) {
    if (ch !== '1') break;
    out.unshift(0);
  }
  return Uint8Array.from(out);
};

const base64Of = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

/** The phone's solana_signMessage of a Solana text, as base64. Rejects when the person says no. */
export async function phoneSignSolana(s: PhoneSession, message: string): Promise<string> {
  const c = await walletConnectClient();
  const answer = (await c.request({
    topic: s.topic,
    chainId: SOLANA_MAINNET,
    request: {
      method: 'solana_signMessage',
      params: { message: base58Of(new TextEncoder().encode(message)), pubkey: s.address },
    },
  })) as { signature?: string };
  if (!answer?.signature) throw new Error('The phone wallet gave no signature.');
  return base64Of(bytesOf58(answer.signature));
}

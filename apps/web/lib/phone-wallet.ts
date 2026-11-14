// Browser only. A wallet on the person's phone, reached by scanning a QR code: WalletConnect (Reown), the way
// most phone wallets connect to a site (MetaMask, Phantom, Trust and the others), so nobody needs a browser
// extension. One client for the site, on its Reown project (a public client id, locked to the site's own
// address), loaded only when it's first asked for. It opens a session for one chain by a QR code, keeps it, and
// asks the phone for one signature at a time: a personal_sign of an Ethereum text, a solana_signMessage of a
// Solana one; nothing else, so no transaction and no spend. Its QR code shows in Reown's own popup (AppKit's core,
// on the same project, given this client's address: manualWCControl), the one people know from other sites: a QR
// on a computer, the list of phone wallets on a phone. It loads only when a phone wallet is asked for, with
// analytics, email and social sign-in, swaps and onramp off. NEAR's phone wallets (NEAR Mobile, Meteor, HOT) show
// their own QR codes in NEAR's picker, each opening its own app; NEAR's picker doesn't get this client, since a
// WalletConnect link opens the phone's default wallet, often one that can't sign for NEAR (lib/wallet.ts).
// Pure of React; viewmodels call it.
import type { AppKit } from '@reown/appkit/core';
import type { AppKitNetwork } from '@reown/appkit/networks';
import type SignClient from '@walletconnect/sign-client';

/** The picture a phone wallet shows for the site: Petals' flower, as the docs serve it. */
const ICON = '/docs/assets/icon-petals.png';

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
        icons: [`${site}${ICON}`],
      },
    });
  });
  return client;
}

let kit: Promise<AppKit> | null = null;

/** Reown's popup, made the first time a phone wallet is asked for, showing this client's address only. */
function popup(): Promise<AppKit> {
  kit ??= Promise.all([import('@reown/appkit/core'), import('@reown/appkit/networks')]).then(
    ([{ createAppKit }, { mainnet, solana }]) => {
      const site = globalThis.location?.origin ?? '';
      return createAppKit({
        projectId: WALLETCONNECT_PROJECT_ID,
        // AppKit's own networks, typed against its own viem
        networks: [mainnet, solana] as [AppKitNetwork, ...AppKitNetwork[]],
        manualWCControl: true,
        themeMode: 'light',
        metadata: {
          name: 'Petals',
          description: 'See who holds power.',
          url: site,
          icons: [`${site}${ICON}`],
        },
        features: { analytics: false, email: false, socials: false, swaps: false, onramp: false },
      });
    },
  );
  return kit;
}

/**
 * The phone's answer to a new session, while Reown's popup shows its address; closing the popup first is a no.
 * The popup closes once the phone has answered.
 */
async function inPopup<T>(uri: string, answer: Promise<T>): Promise<T> {
  const modal = await popup();
  await modal.open({ uri });
  let unsubscribe = () => {};
  const closed = new Promise<never>((_, reject) => {
    unsubscribe = modal.subscribeState((s) => {
      if (!s.open) reject(new Error('The phone wallet was closed.'));
    });
  });
  try {
    return await Promise.race([answer, closed]);
  } finally {
    unsubscribe();
    await modal.close();
  }
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
 * The phone wallet's session for a chain: one already open, or a new one, whose QR code Reown's popup shows until
 * the phone approves. Rejects when the person says no on the phone, or closes the popup.
 */
export async function phoneSession(chain: Chain): Promise<PhoneSession> {
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
  const session = uri ? await inPopup(uri, approval()) : await approval();
  const account = session.namespaces[chain]?.accounts[0];
  if (!account) throw new Error('The phone wallet named no account.');
  return {
    topic: session.topic,
    address: accountOf(account),
    name: session.peer.metadata.name || PHONE_NAME,
  };
}

/**
 * The phone wallet's open session that holds this account on this chain, if there is one: for a signature the
 * site asks of a wallet the person added by phone (a publication's), with no new QR code.
 */
export async function phoneSessionFor(chain: Chain, account: string): Promise<PhoneSession | null> {
  const c = await walletConnectClient();
  const want = account.toLowerCase();
  for (const s of c.session.getAll()) {
    const held = s.namespaces[chain]?.accounts.find((a) => accountOf(a).toLowerCase() === want);
    if (held)
      return { topic: s.topic, address: accountOf(held), name: s.peer.metadata.name || PHONE_NAME };
  }
  return null;
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

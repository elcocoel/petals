// Browser only. The person's own Solana wallets, the ones in this browser, for signing in and adding a wallet
// with one signed message, as a NEAR or an EVM wallet does. Wallets register themselves through the Wallet
// Standard (MetaMask and SafePal both do, each by its own name and icon), so the person picks one by name and a
// refusal says which wallet refused. A browser whose wallets only inject a Phantom-shaped object (globalThis's
// phantom, solana and the like) still works: each is found where it put itself and named by what it says it is
// (SafePal's also says it's Phantom, so it's asked first). It asks to connect, then to sign the text Petals'
// challenge gives; nothing else, so no transaction and no spend. Pure of React.
import type { WalletChoice } from './evm-wallet.ts';

/** A Wallet Standard account: its base58 address is what Petals checks. */
interface StandardAccount {
  address: string;
}

/** A wallet as the Wallet Standard registers it: the features this file uses. */
interface StandardWallet {
  name: string;
  icon?: string;
  chains?: readonly string[];
  features: {
    'standard:connect'?: { connect(): Promise<{ accounts: readonly StandardAccount[] }> };
    'solana:signMessage'?: {
      signMessage(
        ...inputs: { account: StandardAccount; message: Uint8Array }[]
      ): Promise<readonly { signature: Uint8Array }[]>;
    };
  };
}

interface InjectedSolana {
  connect(): Promise<{ publicKey?: { toString(): string } } | undefined>;
  publicKey?: { toString(): string } | null;
  signMessage(
    message: Uint8Array,
    display?: string,
  ): Promise<{ signature: Uint8Array } | Uint8Array>;
  isPhantom?: boolean;
  isSafePalWallet?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
}

type Injected = {
  phantom?: { solana?: InjectedSolana };
  solana?: InjectedSolana;
  solflare?: InjectedSolana;
  backpack?: InjectedSolana;
};

const registered: StandardWallet[] = [];
const register = (...wallets: StandardWallet[]) => {
  for (const w of wallets) if (!registered.includes(w)) registered.push(w);
  return () => {};
};
if (typeof globalThis.addEventListener === 'function') {
  // the Wallet Standard's handshake, both ways: wallets that loaded first answer app-ready, later ones
  // register themselves
  globalThis.addEventListener('wallet-standard:register-wallet', (e) => {
    const callback = (e as CustomEvent<(api: { register: typeof register }) => void>).detail;
    if (typeof callback === 'function') callback({ register });
  });
  globalThis.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: { register } }));
}

/** A registered wallet that can connect and sign a message on Solana. */
const signs = (w: StandardWallet) =>
  Boolean(w.features['standard:connect'] && w.features['solana:signMessage']) &&
  (w.chains ?? []).some((c) => c.startsWith('solana:'));

/** What an injected wallet calls itself. */
const nameOf = (w: InjectedSolana, where: string) =>
  w.isSafePalWallet
    ? 'SafePal'
    : w.isSolflare || where === 'solflare'
      ? 'Solflare'
      : w.isBackpack || where === 'backpack'
        ? 'Backpack'
        : w.isPhantom
          ? 'Phantom'
          : 'Your Solana wallet';

/** Every injected Solana wallet, each once, by where it put itself. */
const injected = (): { id: string; wallet: InjectedSolana }[] => {
  const g = globalThis as Injected;
  const spots: [string, InjectedSolana | undefined][] = [
    ['phantom', g.phantom?.solana],
    ['solana', g.solana],
    ['solflare', g.solflare],
    ['backpack', g.backpack],
  ];
  const seen = new Set<InjectedSolana>();
  const list: { id: string; wallet: InjectedSolana }[] = [];
  for (const [id, wallet] of spots) {
    if (!wallet || seen.has(wallet)) continue;
    seen.add(wallet);
    list.push({ id: `injected:${id}`, wallet });
  }
  return list;
};

const standard = () => registered.filter(signs);

/** The Solana wallets in this browser, each by its own name; none when there's none. */
export function solanaWallets(): WalletChoice[] {
  const std = standard();
  if (std.length > 0) return std.map((w) => ({ id: w.name, name: w.name, icon: w.icon ?? null }));
  const seen = new Set<string>();
  return injected()
    .map(({ id, wallet }) => ({
      id,
      name: nameOf(wallet, id.slice('injected:'.length)),
      icon: null,
    }))
    .filter((w) => !seen.has(w.name) && Boolean(seen.add(w.name)));
}

/** There's a Solana wallet in this browser to ask. */
export const hasSolanaWallet = () => solanaWallets().length > 0;

/** Said when there's none. */
export const NO_SOLANA_WALLET = 'There’s no Solana wallet in this browser.';

/** The account a registered wallet connected, kept for its signature. */
const connected = new Map<string, StandardAccount>();

const pick = (id?: string) => {
  const chosen = id ?? solanaWallets()[0]?.id;
  if (!chosen) throw new Error(NO_SOLANA_WALLET);
  const std = standard().find((w) => w.name === chosen);
  const inj = std ? undefined : injected().find((w) => w.id === chosen)?.wallet;
  if (!std && !inj) throw new Error(NO_SOLANA_WALLET);
  return { id: chosen, std, inj };
};

/** The wallet's address, base58. Rejects when the person says no. */
export async function solanaAccount(id?: string): Promise<string> {
  const w = pick(id);
  if (w.std) {
    const connect = w.std.features['standard:connect'];
    const { accounts } = connect ? await connect.connect() : { accounts: [] };
    const account = accounts[0];
    if (!account) throw new Error('The wallet named no account.');
    connected.set(w.id, account);
    return account.address;
  }
  const sol = w.inj as InjectedSolana;
  const answer = await sol.connect();
  const address = (answer?.publicKey ?? sol.publicKey)?.toString();
  if (!address) throw new Error('The wallet named no account.');
  return address;
}

const base64 = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

/** The wallet's ed25519 signature of the text, base64. Rejects when the person says no. */
export async function solanaSign(message: string, id?: string): Promise<string> {
  const w = pick(id);
  const bytes = new TextEncoder().encode(message);
  if (w.std) {
    const account = connected.get(w.id) ?? (await solanaAccount(w.id), connected.get(w.id));
    const sign = w.std.features['solana:signMessage'];
    if (!account || !sign) throw new Error('The wallet named no account.');
    const [signed] = await sign.signMessage({ account, message: bytes });
    if (!signed) throw new Error('The wallet gave no signature.');
    return base64(signed.signature);
  }
  const signed = await (w.inj as InjectedSolana).signMessage(bytes, 'utf8');
  return base64(signed instanceof Uint8Array ? signed : signed.signature);
}

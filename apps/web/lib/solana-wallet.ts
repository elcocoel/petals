// Browser only. The person's own Solana wallet, the one in this browser (Phantom, Solflare, Backpack and
// the like inject one), for signing in and adding a wallet with one signed message, as a NEAR or an EVM
// wallet does. It asks to connect, then to sign the
// text Petals' challenge gives; nothing else, so no transaction and no spend. Pure of React.

interface SolanaInjected {
  connect(): Promise<{ publicKey?: { toString(): string } } | undefined>;
  publicKey?: { toString(): string } | null;
  signMessage(
    message: Uint8Array,
    display?: string,
  ): Promise<{ signature: Uint8Array } | Uint8Array>;
}

type Injected = {
  phantom?: { solana?: SolanaInjected };
  solana?: SolanaInjected;
  solflare?: SolanaInjected;
  backpack?: SolanaInjected;
};

const provider = (): SolanaInjected | null => {
  const g = globalThis as Injected;
  return g.phantom?.solana ?? g.solana ?? g.solflare ?? g.backpack ?? null;
};

/** There's a Solana wallet in this browser to ask. */
export const hasSolanaWallet = () => provider() !== null;

/** Said when there's none. */
export const NO_SOLANA_WALLET = 'There’s no Solana wallet in this browser.';

/** The wallet's address, base58. Rejects when the person says no. */
export async function solanaAccount(): Promise<string> {
  const sol = provider();
  if (!sol) throw new Error(NO_SOLANA_WALLET);
  const connected = await sol.connect();
  const address = (connected?.publicKey ?? sol.publicKey)?.toString();
  if (!address) throw new Error('The wallet named no account.');
  return address;
}

const base64 = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

/** The wallet's ed25519 signature of the text, base64. Rejects when the person says no. */
export async function solanaSign(message: string): Promise<string> {
  const sol = provider();
  if (!sol) throw new Error(NO_SOLANA_WALLET);
  const signed = await sol.signMessage(new TextEncoder().encode(message), 'utf8');
  return base64(signed instanceof Uint8Array ? signed : signed.signature);
}

// Browser only. The person's own EVM wallets, the ones in this browser (MetaMask, SafePal, Rabby, Coinbase
// Wallet's extension and the like), for signing in and adding a wallet with one signed message, as a NEAR
// wallet does. Several extensions can sit in one browser and fight over window.ethereum (SafePal takes it and
// says it's MetaMask too), so each is found by name through EIP-6963: every wallet announces itself, and the
// person's pick is the one asked. With none announced, window.ethereum is the one. A wallet asked for the
// account, then for a personal_sign of the text Petals' challenge gives; nothing else, so no transaction and
// no spend. Pure of React; viewmodels call it.

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  isMetaMask?: boolean;
  isSafePal?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
}

/** One wallet in this browser, as the person picks it. */
export interface WalletChoice {
  id: string;
  name: string;
  /** Its own icon, a data: URI, when it gave one. */
  icon: string | null;
}

interface Announced {
  info: { uuid: string; name: string; icon?: string; rdns?: string };
  provider: Eip1193;
}

/** The id of window.ethereum, when no wallet announced itself. */
const INJECTED = 'injected';

const announced = new Map<string, Announced>();
if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (e) => {
    const detail = (e as CustomEvent<Announced>).detail;
    if (detail?.info?.uuid && detail.provider) announced.set(detail.info.uuid, detail);
  });
}

const injected = (): Eip1193 | null => (globalThis as { ethereum?: Eip1193 }).ethereum ?? null;

/** What the wallet at window.ethereum calls itself; SafePal also says it's MetaMask, so it's asked first. */
const injectedName = (eth: Eip1193) =>
  eth.isSafePal
    ? 'SafePal'
    : eth.isRabby
      ? 'Rabby'
      : eth.isCoinbaseWallet
        ? 'Coinbase Wallet'
        : eth.isMetaMask
          ? 'MetaMask'
          : 'Your Ethereum wallet';

/** The EVM wallets in this browser, each by its own name; none when there's none. */
export function evmWallets(): WalletChoice[] {
  if (typeof window === 'undefined') return [];
  // a wallet announces itself again whenever it's asked, at once
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  const list = [...announced.values()].map((a) => ({
    id: a.info.uuid,
    name: a.info.name,
    icon: a.info.icon ?? null,
  }));
  if (list.length > 0) return list;
  const eth = injected();
  return eth ? [{ id: INJECTED, name: injectedName(eth), icon: null }] : [];
}

/** The wallet with that id, or the first there is. */
const provider = (id?: string): Eip1193 | null => {
  if (id && id !== INJECTED) return announced.get(id)?.provider ?? null;
  if (!id) {
    const first = evmWallets()[0];
    if (first && first.id !== INJECTED) return announced.get(first.id)?.provider ?? null;
  }
  return injected();
};

/** There's an EVM wallet in this browser to ask. */
export const hasEvmWallet = () => evmWallets().length > 0;

/** Said when there's none. */
export const NO_EVM_WALLET = 'There’s no Ethereum wallet in this browser.';

/** The account the wallet gives, and the chain it's on. Rejects when the person says no. */
export async function evmAccount(id?: string): Promise<{ address: string; chainId: number }> {
  const eth = provider(id);
  if (!eth) throw new Error(NO_EVM_WALLET);
  const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
  const address = accounts[0];
  if (!address) throw new Error('The wallet named no account.');
  const chain = (await eth.request({ method: 'eth_chainId' })) as string;
  return { address: address.toLowerCase(), chainId: Number.parseInt(chain, 16) || 1 };
}

const hexOf = (text: string) =>
  `0x${Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, '0')).join('')}`;

/** The wallet's personal_sign (EIP-191) of the text, as 0x… Rejects when the person says no. */
export async function evmSign(message: string, address: string, id?: string): Promise<string> {
  const eth = provider(id);
  if (!eth) throw new Error(NO_EVM_WALLET);
  return (await eth.request({
    method: 'personal_sign',
    params: [hexOf(message), address],
  })) as string;
}

// Browser only. The person's own EVM wallet, the one in this browser (EIP-1193, window.ethereum: MetaMask,
// Rabby, Coinbase Wallet's extension and the like), for signing in and adding a wallet with one signed
// message, as a NEAR wallet does (Elco, 12 Nov: "multi chain wallet connection ... evm is priority"). It
// asks for the account, then for a personal_sign of the text Petals' challenge gives; nothing else, so no
// transaction and no spend. Pure of React; viewmodels call it.

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

const provider = (): Eip1193 | null => (globalThis as { ethereum?: Eip1193 }).ethereum ?? null;

/** There's an EVM wallet in this browser to ask. */
export const hasEvmWallet = () => provider() !== null;

/** Said when there's none. LOBBY's draft. */
export const NO_EVM_WALLET = 'There’s no Ethereum wallet in this browser.';

/** The account the wallet gives, and the chain it's on. Rejects when the person says no. */
export async function evmAccount(): Promise<{ address: string; chainId: number }> {
  const eth = provider();
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
export async function evmSign(message: string, address: string): Promise<string> {
  const eth = provider();
  if (!eth) throw new Error(NO_EVM_WALLET);
  return (await eth.request({
    method: 'personal_sign',
    params: [hexOf(message), address],
  })) as string;
}

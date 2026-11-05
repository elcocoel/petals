// The input modules Petal can read (Phase A). tools.md list_networks lists their descriptors.
// Creating a module makes no network call; live modules open the RPC pool on first use.
import type { InputModule } from './index.ts';
import { molochV1 } from './modules/moloch-v1.ts';
import { nearHouseOfStake } from './modules/near-house-of-stake.ts';
import { nearValidators } from './modules/near-validators.ts';
import { MELANIA, solanaSplHolders, TRUMP } from './modules/solana-spl-holders.ts';

/** near-validators (stored), near-house-of-stake (live); M-Modules: Ethereum and Solana (stored). */
export const modules: Record<string, InputModule> = {
  'near-validators': nearValidators(),
  'near-house-of-stake': nearHouseOfStake(),
  'moloch-v1': molochV1(),
  'solana-spl-trump': solanaSplHolders(TRUMP),
  'solana-spl-melania': solanaSplHolders(MELANIA),
};

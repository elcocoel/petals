// The input modules Petal can read (Phase A). tools.md list_networks lists their descriptors.
// Creating a module makes no network call; live modules open the RPC pool on first use.
import type { InputModule } from './index.ts';
import { nearHouseOfStake } from './modules/near-house-of-stake.ts';
import { nearValidators } from './modules/near-validators.ts';

/** Phase A: near-validators (stored), near-house-of-stake (live). */
export const modules: Record<string, InputModule> = {
  'near-validators': nearValidators(),
  'near-house-of-stake': nearHouseOfStake(),
};

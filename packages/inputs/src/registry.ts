// The input modules Petal can read (Phase A). tools.md list_networks lists their descriptors.
// Creating a module makes no network call; live modules open the RPC pool on first use.
import type { InputModule } from './index.ts';
import { beanstalk } from './modules/beanstalk.ts';
import {
  BANK_ETHEREUM,
  DPX_ARBITRUM,
  erc20HoldersLive,
  erc20HoldersStored,
  SEAM_BASE,
} from './modules/erc20-holders.ts';
import { ENS_TOKEN, erc20Votes } from './modules/erc20-votes.ts';
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
  beanstalk: beanstalk(),
  'ens-delegates': erc20Votes(ENS_TOKEN),
  'erc20-holders': erc20HoldersLive(),
  [BANK_ETHEREUM.id]: erc20HoldersStored(BANK_ETHEREUM),
  [DPX_ARBITRUM.id]: erc20HoldersStored(DPX_ARBITRUM),
  [SEAM_BASE.id]: erc20HoldersStored(SEAM_BASE),
};

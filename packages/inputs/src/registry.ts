// The input modules Petal can read (Phase A). tools.md list_networks lists their descriptors.
// Creating a module makes no network call; live modules open the RPC pool on first use.
// A module knows how to read; what it reads comes from its parameters. Beanstalk is the exception:
// one stored data set, not a general module.
import type { InputModule } from './index.ts';
import { beanstalk } from './modules/beanstalk.ts';
import { erc20Holders } from './modules/erc20-holders.ts';
import { erc20Votes } from './modules/erc20-votes.ts';
import { molochV1 } from './modules/moloch-v1.ts';
import { nearHouseOfStake } from './modules/near-house-of-stake.ts';
import { nearValidators } from './modules/near-validators.ts';
import { solanaSplHolders } from './modules/solana-spl-holders.ts';
import { sputnikDao } from './modules/sputnik-dao.ts';
import { recipeModules } from './recipes/index.ts';

export const modules: Record<string, InputModule> = {
  'near-validators': nearValidators(),
  'near-house-of-stake': nearHouseOfStake(),
  'moloch-v1': molochV1(),
  'solana-spl-holders': solanaSplHolders(),
  beanstalk: beanstalk(),
  'erc20-votes': erc20Votes(),
  'erc20-holders': erc20Holders(),
  // a Sputnik DAO's members and its proposals' votes (#93)
  'sputnik-dao': sputnikDao(),
  // the brain's reading recipes (specs/005-mapping-brain): Moloch v3 first
  ...recipeModules(),
};

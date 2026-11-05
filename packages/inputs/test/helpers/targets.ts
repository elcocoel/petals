// The targets the tests and stored fixtures use. They are parameters, nothing more: no module knows
// any of them.
export const MOLOCH = {
  params: { dao: '0x1fd169a4f5c59acf79d0fd5d91d1201ef1bce9f1', chain: 'ethereum' },
  block: 13199430, // the block before proposal 143 was processed
  fromBlock: 7218566,
  note: 'This date is before proposal 143, whose on-chain title is "Shares for V2 Migration": it granted 1,000,000,000,000 shares at block 13,199,431, and they were ragequit at block 13,220,055.',
};
export const TRUMP = { mint: '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN' };
export const MELANIA = { mint: 'FUAfBo2jgks6gB4Z4LfZkqSZgzNucisEHqnNebaRxM1P' };
export const SMALL_MINT = 'DfXhF62rZowkpcrw4j4RN1Y41XwgYoAXHvxNiAJWwUBL';
export const ENS = { token: '0xc18360217d8f7ab5e7c516566761ea12ce7f9d72', chain: 'ethereum' };
export const BANK = {
  chain: 'ethereum',
  token: '0x2d94aa3e47d9d5024503ca8491fce9a2fb4da198',
  window_days: 'full',
};
export const DPX = {
  chain: 'arbitrum',
  token: '0x6c2c06790b3e3e3c38e12ee22f8183b37a13ee55',
  window_days: 'full',
};
export const SEAM = {
  chain: 'base',
  token: '0x1c7a460413dd4e964f96d8dfc56e7223ce88cd85',
  window_days: '7',
};

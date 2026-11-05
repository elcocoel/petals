// T165: the plain requests find_target must not dead-end on, each with the outcome it must lead to:
// candidates plus a yes or no before drawing ("yes-or-no"), one clear question ("ask"), or a refusal
// that says what would work ("refuse"). Drawing follows a yes: nobody goes straight to a new map.
// Recorded once from the real sources (record-find.ts), replayed offline, no model involved.
export interface FindCase {
  query: string;
  outcome: 'yes-or-no' | 'ask' | 'refuse';
  /** the module the yes would read, when the outcome is "yes-or-no" */
  module?: string;
  chain?: string;
}

export const FIND_SET: FindCase[] = [
  { query: 'Moloch DAO', outcome: 'yes-or-no', module: 'moloch-v1', chain: 'ethereum' },
  { query: 'TRUMP', outcome: 'ask' },
  { query: 'UNI on Base', outcome: 'yes-or-no', module: 'erc20-holders', chain: 'base' },
  { query: 'UNI votes', outcome: 'yes-or-no', module: 'erc20-holders', chain: 'ethereum' },
  // an address a model remembers: the chain says what it is
  {
    query: '0x1fd169a4f5c59acf79d0fd5d91d1201ef1bce9f1',
    outcome: 'yes-or-no',
    module: 'moloch-v1',
    chain: 'ethereum',
  },
  // and one it misremembers: no contract answers, so nothing is drawn
  { query: '0x000000000000000000000000000000000000dead', outcome: 'ask' },
  { query: 'MetaCartel', outcome: 'refuse' },
  { query: 'BONK', outcome: 'refuse' },
  { query: 'House of Stake', outcome: 'yes-or-no', module: 'near-house-of-stake', chain: 'near' },
  { query: 'asdkjhqwe zzzz', outcome: 'ask' },
];

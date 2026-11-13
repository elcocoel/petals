// veNEAR voting power, ported from house-of-stake-contracts common/src (account.rs, types.rs).
// BigInt throughout.
//
// `get_accounts` returns each account with its balances already grown to the block's time
// (update_timestamp is the block time in whole seconds), so power needs no growth step here:
// own balance, minus what each outgoing delegation takes, plus what was delegated in.

export const MILLI = 10n ** 21n;

export interface VeBalance {
  near_balance: string;
  extra_venear_balance: string;
}

export interface VeAccount {
  account_id: string;
  update_timestamp: string;
  balance: VeBalance;
  delegated_balance: VeBalance;
  /** V1: up to max_delegations (delegate, bps) pairs */
  delegations?: { account_id: string; bps: number }[];
  /** V0: the whole balance delegated to one account */
  delegation?: { account_id: string } | null;
}

export interface Power {
  /** voting power in yocto-veNEAR */
  power: bigint;
  own_near: bigint;
  own_extra: bigint;
  in_near: bigint;
  in_extra: bigint;
  /** veNEAR delegated out, all delegations together */
  out_total: bigint;
  delegations: { to: string; bps: number; amount: bigint }[];
}

export const truncMilli = (x: bigint): bigint => (x / MILLI) * MILLI;

/** What one delegation of `bps` takes from a balance: [near, extra]. */
export function contribution(near: bigint, extra: bigint, bps: number): [bigint, bigint] {
  const base = truncMilli(near);
  if (base === 0n) return [0n, 0n];
  const n = truncMilli((near * BigInt(bps)) / 10_000n);
  return [n, (extra * n) / base];
}

export function delegationsOf(a: VeAccount): { account_id: string; bps: number }[] {
  if (a.delegations) return a.delegations;
  return a.delegation ? [{ account_id: a.delegation.account_id, bps: 10_000 }] : [];
}

/** The contract's owned_total: own balance minus outgoing delegations plus incoming. */
export function ownedTotal(a: VeAccount): Power {
  const own_near = BigInt(a.balance.near_balance);
  const own_extra = BigInt(a.balance.extra_venear_balance);
  const in_near = BigInt(a.delegated_balance.near_balance);
  const in_extra = BigInt(a.delegated_balance.extra_venear_balance);
  let outNear = 0n;
  let outExtra = 0n;
  const delegations: Power['delegations'] = [];
  for (const d of delegationsOf(a)) {
    const [n, x] = contribution(own_near, own_extra, d.bps);
    outNear += n;
    outExtra += x;
    delegations.push({ to: d.account_id, bps: d.bps, amount: n + x });
  }
  const power = in_near + in_extra + (own_near - outNear) + (own_extra - outExtra);
  return {
    power,
    own_near,
    own_extra,
    in_near,
    in_extra,
    out_total: outNear + outExtra,
    delegations,
  };
}

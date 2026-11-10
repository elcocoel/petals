// read_chain (T332): any address on any chain Petal knows. Is it a contract or an account, what does it
// answer, what does a verified-source explorer say, and any event's logs. Read-only: eth_call and
// eth_getLogs, never a transaction.
//
// Its reach ends at our own list. The endpoints are the ones in EVM_CHAINS, and nothing a model says can
// name another: `chain` must be a chain we know, and no input is a URL. The explorers are ours too, and
// the only thing put into their URLs is an address that has already matched 0x and 40 hex digits.
//
// Bounded, so a model can't hammer a free endpoint or stall a chat: MAX_CALLS view calls, one log query
// per read, a capped block range where the chain's endpoints are narrow, LOG_READS_PER_MINUTE for the
// whole process, and a time limit on every request.
import { runSignal } from '@petal/core';
import {
  addressFrom,
  askChain,
  ChainDown,
  decodeAggregate,
  decodeValues,
  EVM_CHAINS,
  type EvmChain,
  encodeAggregate3,
  encodeArguments,
  encodeCall,
  endpointHealth,
  eventTopic,
  guessValue,
  MULTICALL3,
  type ParsedSignature,
  parseSignature,
  Reverted,
  revertReason,
} from '@petal/inputs';
import { defineTool, type PetalTool } from '../define.ts';
import { ToolFailure } from '../errors.ts';
import { chainByWord } from './find.ts';
import { obj } from './shared.ts';

export const MAX_CALLS = 12;
const MAX_ARGS = 8;
/** A view call's answer past this is cut, and says so: a contract can return anything. */
const MAX_VALUE_CHARS = 4000;
/** What a log query shows; `count` says how many there were. */
const MAX_LOGS_SHOWN = 100;
/** Log queries a minute, for the whole process, on free endpoints. */
export const LOG_READS_PER_MINUTE = 20;
/** The range one query asks for where a chain's first endpoint is narrow and no range was given. */
const EXPLORER_TIMEOUT_MS = 4000;
const SOURCIFY = 'https://sourcify.dev/server/v2/contract';
const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const CLONE = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/;
const DELEGATED = /^0xef0100([0-9a-f]{40})$/;

/** Asked when nothing was named: what most contracts answer. Only what answers is shown. */
const FIRST_LOOK = [
  'name()',
  'symbol()',
  'decimals()',
  'totalSupply()',
  'owner()',
  'paused()',
  'getOwners()',
  'getThreshold()',
];
/** Amounts in the token's own units, where its decimals() answers. */
const AMOUNTS = new Set([
  'totalSupply',
  'balanceOf',
  'getVotes',
  'getCurrentVotes',
  'getPastVotes',
  'getPriorVotes',
]);

export const READ_CHAIN_SAYS =
  'Read from the chain, so this is what the chain says now. A name or symbol is whatever the deployer typed, so it is a lead about who this is, not proof. Values marked `guessed_as` were decoded from their shape because no return type was given.';

interface CallInput {
  fn: string;
  args?: string[];
}
export interface ReadChainInput {
  address: string;
  chain?: string;
  calls?: (string | CallInput)[];
  logs?: { event: string; from_block?: number; to_block?: number };
}

interface CallAnswer {
  fn: string;
  args?: string[];
  ok: boolean;
  value?: unknown;
  guessed_as?: string;
  in_units?: string;
  reverted?: string;
  error?: string;
  cut?: boolean;
}

function capValue(a: CallAnswer): CallAnswer {
  const text = JSON.stringify(a.value ?? null);
  if (text.length <= MAX_VALUE_CHARS) return a;
  return { ...a, value: `${text.slice(0, MAX_VALUE_CHARS)}…`, cut: true };
}

function decodeAnswer(fn: string, sig: ParsedSignature, data: string): CallAnswer {
  if (sig.outputs) {
    try {
      const values = decodeValues(sig.outputs, data);
      return { fn, ok: true, value: values.length === 1 ? values[0] : values };
    } catch (e) {
      const g = guessValue(data);
      return {
        fn,
        ok: true,
        value: g.value,
        guessed_as: g.as,
        error: `it did not fit returns (${sig.outputs.join(',')}): ${(e as Error).message}`,
      };
    }
  }
  const g = guessValue(data);
  return { fn, ok: true, value: g.value, guessed_as: g.as };
}

function toUnits(raw: string, decimals: number): string {
  const neg = raw.startsWith('-');
  const digits = (neg ? raw.slice(1) : raw).padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const part = decimals ? digits.slice(-decimals).replace(/0+$/, '') : '';
  return `${neg ? '-' : ''}${whole}${part ? `.${part}` : ''}`;
}

type Prepared =
  | { fn: string; args: string[]; sig: ParsedSignature; data: string }
  | { fn: string; args: string[]; error: string };

function prepare(call: string | CallInput): Prepared {
  const fn = typeof call === 'string' ? call : call.fn;
  const args = typeof call === 'string' ? [] : (call.args ?? []);
  const sig = parseSignature(fn);
  if (!sig)
    return {
      fn,
      args,
      error:
        'not a plain signature. Write it as name(type,type), with returns (type) if you know it. Tuples are not supported',
    };
  try {
    return { fn, args, sig, data: encodeArguments(sig, args) };
  } catch (e) {
    return { fn, args, error: (e as Error).message };
  }
}

interface AskCtx {
  chain: EvmChain;
  fetch: typeof globalThis.fetch;
  health: Map<string, number>;
}

/** The asked calls, through Multicall3 and pinned to one block; one by one if a call sinks it. */
async function runCalls(
  c: AskCtx,
  address: string,
  prepared: Prepared[],
  drop: boolean,
): Promise<{ answers: CallAnswer[]; block: number | null; url: string | null }> {
  const good = prepared.filter((p) => 'data' in p);
  const decimalsData = encodeCall('decimals()');
  const blockData = encodeCall('getBlockNumber()');
  const sub = [
    ...good.map((p) => ({ to: address, data: p.data })),
    { to: address, data: decimalsData },
    { to: MULTICALL3.address, data: blockData },
  ];
  const ask = { fetch: c.fetch, health: c.health };
  let results: { ok: boolean; data: string }[] | null = null;
  let url: string | null = null;
  let block: number | null = null;
  try {
    const out = await askChain<string>(
      c.chain,
      'eth_call',
      [{ to: MULTICALL3.address, data: encodeAggregate3(sub) }, 'latest'],
      { ...ask, accept: (r) => typeof r === 'string' && r !== '0x' },
    );
    url = out.url;
    results = decodeAggregate(out.result);
    const at = results.at(-1);
    if (at?.ok) block = Number(BigInt(at.data));
  } catch (e) {
    if (
      e instanceof ChainDown &&
      e.failures.some((f) => !/out of gas|no answer|nothing/i.test(f.why))
    )
      throw e;
    // An old contract can burn all the gas it's given on a call it doesn't know, and that sinks them all.
    results = [];
    for (const s of sub.slice(0, -1)) {
      try {
        const one = await askChain<string>(
          c.chain,
          'eth_call',
          [{ to: s.to, data: s.data }, 'latest'],
          ask,
        );
        url = one.url;
        results.push({ ok: true, data: one.result });
      } catch (err) {
        if (err instanceof Reverted) results.push({ ok: false, data: '0x' });
        else throw err;
      }
    }
    results.push({ ok: false, data: '0x' });
  }
  const decimalsAt = results[good.length];
  const decimals =
    decimalsAt?.ok && decimalsAt.data.length === 66 ? Number(BigInt(decimalsAt.data)) : null;
  let i = 0;
  const answers: CallAnswer[] = [];
  for (const p of prepared) {
    if (!('data' in p)) {
      answers.push({
        fn: p.fn,
        ...(p.args.length ? { args: p.args } : {}),
        ok: false,
        error: p.error,
      });
      continue;
    }
    const r = results[i++];
    const shown = p.args.length ? { args: p.args } : {};
    if (!r?.ok || r.data === '0x') {
      if (drop) continue;
      const reason = r ? revertReason(r.data) : null;
      answers.push({
        fn: p.fn,
        ...shown,
        ok: false,
        reverted:
          reason ?? 'it reverted or gave no answer: this contract may not have this function',
      });
      continue;
    }
    const a = decodeAnswer(p.fn, p.sig, r.data);
    if (
      decimals !== null &&
      AMOUNTS.has(p.sig.name) &&
      typeof a.value === 'string' &&
      /^\d+$/.test(a.value)
    )
      a.in_units = toUnits(a.value, decimals);
    answers.push(capValue({ ...a, ...shown }));
  }
  return { answers, block, url };
}

interface VerifiedSource {
  by: string;
  url: string;
  of: string;
  name: string | null;
  view_functions: string[];
  other_functions: number;
  events: string[];
}

type AbiItem = {
  type?: string;
  name?: string;
  stateMutability?: string;
  inputs?: { type: string }[];
  outputs?: { type: string }[];
};

function fromAbi(abi: AbiItem[]) {
  const sig = (x: AbiItem) => `${x.name}(${(x.inputs ?? []).map((i) => i.type).join(',')})`;
  const fns = abi.filter((x) => x.type === 'function');
  const views = fns.filter((x) => x.stateMutability === 'view' || x.stateMutability === 'pure');
  return {
    view_functions: views.map((x) => {
      const out = (x.outputs ?? []).map((o) => o.type).join(',');
      return out ? `${sig(x)} returns (${out})` : sig(x);
    }),
    other_functions: fns.length - views.length,
    events: abi.filter((x) => x.type === 'event').map(sig),
  };
}

async function explorer<T>(c: AskCtx, url: string): Promise<T | null> {
  try {
    const res = await c.fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'petal/0.1 (keyless public reads)' },
      signal: runSignal(AbortSignal.timeout(EXPLORER_TIMEOUT_MS)),
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Sourcify on every chain, then Blockscout where it answers keyless. Null when neither knows it. */
async function verifiedSource(c: AskCtx, address: string): Promise<VerifiedSource | null> {
  const chainId = c.chain.caip2.split(':')[1];
  const sourcify = await explorer<{ abi?: AbiItem[]; compilation?: { name?: string } }>(
    c,
    `${SOURCIFY}/${chainId}/${address}?fields=abi,compilation`,
  );
  if (sourcify?.abi)
    return {
      by: 'sourcify',
      url: `https://repo.sourcify.dev/${chainId}/${address}`,
      of: address,
      name: sourcify.compilation?.name ?? null,
      ...fromAbi(sourcify.abi),
    };
  if (!c.chain.blockscout) return null;
  const scout = await explorer<{ abi?: AbiItem[]; name?: string }>(
    c,
    `${c.chain.blockscout}/api/v2/smart-contracts/${address}`,
  );
  if (!scout?.abi) return null;
  return {
    by: 'blockscout',
    url: `${c.chain.blockscout}/address/${address}`,
    of: address,
    name: scout.name ?? null,
    ...fromAbi(scout.abi),
  };
}

let logWindow = { start: 0, used: 0 };

/** One log query, in this process's allowance. Exported for its test. */
export function takeLogRead(now = Date.now()): boolean {
  if (now - logWindow.start >= 60_000) logWindow = { start: now, used: 0 };
  if (logWindow.used >= LOG_READS_PER_MINUTE) return false;
  logWindow.used++;
  return true;
}
export const resetLogReads = () => {
  logWindow = { start: 0, used: 0 };
};

async function readLogs(c: AskCtx, address: string, want: NonNullable<ReadChainInput['logs']>) {
  const sig = parseSignature(want.event);
  if (!sig) return { event: want.event, ok: false, error: 'write the event as Name(type,type)' };
  if (!takeLogRead())
    throw new ToolFailure(
      'rate_limited',
      `Petals makes at most ${LOG_READS_PER_MINUTE} log queries a minute on these free endpoints.`,
      'Try again in a minute.',
      60,
    );
  const { result: headHex } = await askChain<string>(c.chain, 'eth_blockNumber', [], {
    fetch: c.fetch,
    health: c.health,
  });
  const head = Number(BigInt(headHex));
  const to = Math.min(want.to_block ?? head, head);
  const widest = c.chain.wide_logs ? null : (c.chain.log_chunk_blocks ?? 1000);
  const from = Math.max(
    0,
    widest === null
      ? (want.from_block ?? 0)
      : Math.max(want.from_block ?? to - widest + 1, to - widest + 1),
  );
  const asked = {
    address,
    topics: [eventTopic(sig.canonical)],
    fromBlock: `0x${from.toString(16)}`,
    toBlock: `0x${to.toString(16)}`,
  };
  let logs: { blockNumber: string; transactionHash: string; topics: string[]; data: string }[];
  try {
    const out = await askChain<typeof logs>(c.chain, 'eth_getLogs', [asked], {
      fetch: c.fetch,
      health: c.health,
      timeoutMs: 15_000,
    });
    logs = out.result;
  } catch (e) {
    if (!(e instanceof ChainDown)) throw e;
    return {
      event: sig.canonical,
      ok: false,
      from_block: from,
      to_block: to,
      error: `the node would not serve this range: ${e.message}. Ask for a narrower from_block and to_block`,
    };
  }
  const shown = logs.slice(-MAX_LOGS_SHOWN).map((l) => {
    const indexed = l.topics.slice(1);
    const types = sig.inputs;
    const named = indexed.map((t, i) => {
      try {
        return decodeValues([types[i] ?? 'bytes32'], t)[0];
      } catch {
        return t;
      }
    });
    let rest: unknown[] | string = l.data;
    try {
      rest = decodeValues(types.slice(indexed.length), l.data);
    } catch {
      // left as hex
    }
    return {
      block: Number(BigInt(l.blockNumber)),
      tx: l.transactionHash,
      values: Array.isArray(rest) ? [...named, ...rest] : [...named, rest],
    };
  });
  return {
    event: sig.canonical,
    ok: true,
    from_block: from,
    to_block: to,
    count: logs.length,
    showing: 'the latest',
    values_in_order: 'indexed parameters first, as the signature lists them: check against the ABI',
    logs: shown,
    ...(widest !== null && want.from_block === undefined
      ? {
          note: `${c.chain.name}'s endpoints take ${widest} blocks a query, so this is the last ${widest}: ask for from_block and to_block to look further back`,
        }
      : {}),
  };
}

async function readOne(c: AskCtx, address: string, input: ReadChainInput, withCalls: boolean) {
  const ask = { fetch: c.fetch, health: c.health };
  const { result: code, url } = await askChain<string>(
    c.chain,
    'eth_getCode',
    [address, 'latest'],
    ask,
  );
  const base = {
    chain: c.chain.id,
    status: 'answered' as const,
    read_from: { by: 'chain' as const, url },
  };
  // An account that has delegated its code (EIP-7702) is still an account: 0xef0100 and an address.
  const delegated = DELEGATED.exec(code)?.[1];
  if (code === '0x' || delegated) {
    const [balance, nonce] = await Promise.all([
      askChain<string>(c.chain, 'eth_getBalance', [address, 'latest'], ask),
      askChain<string>(c.chain, 'eth_getTransactionCount', [address, 'latest'], ask),
    ]);
    return {
      ...base,
      kind: 'account' as const,
      native_balance: toUnits(BigInt(balance.result).toString(), 18),
      transactions_sent: Number(BigInt(nonce.result)),
      ...(delegated ? { delegates_code_to: `0x${delegated}` } : {}),
    };
  }
  let implementation: { address: string; standard: string } | null = null;
  const clone = CLONE.exec(code);
  if (clone?.[1]) implementation = { address: `0x${clone[1]}`, standard: 'EIP-1167 clone' };
  else {
    const slot = await askChain<string>(
      c.chain,
      'eth_getStorageAt',
      [address, IMPLEMENTATION_SLOT, 'latest'],
      ask,
    ).catch(() => null);
    const word = slot?.result?.replace(/^0x/, '').padStart(64, '0');
    if (word && BigInt(`0x${word}`) !== 0n)
      implementation = { address: addressFrom(word), standard: 'EIP-1967 proxy' };
  }
  const named = input.calls && input.calls.length > 0;
  const prepared = (named ? (input.calls ?? []) : FIRST_LOOK).map(prepare);
  const [ran, source, logs] = await Promise.all([
    withCalls ? runCalls(c, address, prepared, !named) : null,
    verifiedSource(c, implementation?.address ?? address),
    input.logs && withCalls ? readLogs(c, address, input.logs) : null,
  ]);
  return {
    ...base,
    ...(ran?.block ? { read_from: { ...base.read_from, block: ran.block } } : {}),
    kind: 'contract' as const,
    code_bytes: (code.length - 2) / 2,
    ...(implementation ? { proxy_of: implementation } : {}),
    verified_source: source,
    ...(ran ? { calls: ran.answers } : {}),
    ...(logs ? { logs } : {}),
  };
}

const CALL_ITEM = {
  anyOf: [
    { type: 'string' },
    {
      type: 'object',
      required: ['fn'],
      additionalProperties: false,
      properties: {
        fn: { type: 'string' },
        args: { type: 'array', items: { type: 'string' }, maxItems: MAX_ARGS },
      },
    },
  ],
};

export function makeReadChain(
  deps: { fetch?: typeof globalThis.fetch } = {},
): PetalTool<ReadChainInput, object> {
  return defineTool({
    name: 'read_chain',
    onTheirMachine: true,
    title: 'Read the chain',
    description:
      'Any address on any EVM chain Petals knows: contract or account, what it answers, verified source and its functions where an explorer has it, proxy target, any view call by signature, any event’s logs. Leave out chain to check them all. Read-only.',
    input: obj(
      ['address'],
      {
        address: { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' },
        chain: { type: 'string', description: Object.keys(EVM_CHAINS).join(', ') },
        calls: {
          type: 'array',
          items: CALL_ITEM,
          maxItems: MAX_CALLS,
          description:
            'e.g. "sharesToken() returns (address)" or {"fn":"balanceOf(address)","args":["0x…"]}. Left out: a first look',
        },
        logs: obj(
          ['event'],
          {
            event: { type: 'string', description: 'e.g. Transfer(address,address,uint256)' },
            from_block: { type: 'integer', minimum: 0 },
            to_block: { type: 'integer', minimum: 0 },
          },
          { additionalProperties: false },
        ),
      },
      { additionalProperties: false },
    ),
    output: obj(['address', 'read', 'says'], {
      address: { type: 'string' },
      read: { type: 'array', items: { type: 'object' } },
      says: { type: 'string' },
    }),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    async run(input, ctx) {
      const address = input.address.toLowerCase();
      let chains = Object.values(EVM_CHAINS);
      if (input.chain) {
        const id = chainByWord(input.chain)?.id ?? input.chain.trim().toLowerCase();
        const chain = EVM_CHAINS[id];
        if (!chain)
          throw new ToolFailure(
            'bad_input',
            `Petals reads no chain called "${input.chain}".`,
            `Chains: ${Object.keys(EVM_CHAINS).join(', ')}. Leave chain out to check them all.`,
          );
        chains = [chain];
      }
      const fetcher = deps.fetch ?? (ctx.config.fake ? null : globalThis.fetch);
      if (!fetcher)
        return {
          address,
          read: chains.map((c) => ({ chain: c.id, status: 'offline', note: 'offline: fake mode' })),
          says: READ_CHAIN_SAYS,
        };
      const health = fetcher === globalThis.fetch ? endpointHealth : new Map<string, number>();
      // With no chain named, the calls go only where there's a contract, and only to the first two.
      const read = await Promise.all(
        chains.map(async (chain) => {
          const c: AskCtx = { chain, fetch: fetcher, health };
          try {
            return await readOne(c, address, input, chains.length === 1);
          } catch (e) {
            if (!(e instanceof ChainDown)) throw e;
            return {
              chain: chain.id,
              status: 'down',
              note: `${e.message}. That says nothing about this address.`,
            };
          }
        }),
      );
      if (chains.length > 1) {
        const contracts = read.filter((r) => 'kind' in r && r.kind === 'contract').slice(0, 2);
        for (const r of contracts) {
          const chain = EVM_CHAINS[r.chain] as EvmChain;
          const c: AskCtx = { chain, fetch: fetcher, health };
          const named = input.calls && input.calls.length > 0;
          const prepared = (named ? (input.calls ?? []) : FIRST_LOOK).map(prepare);
          const ran = await runCalls(c, address, prepared, !named).catch((e: unknown) => {
            if (e instanceof ChainDown) return null;
            throw e;
          });
          if (ran) Object.assign(r, { calls: ran.answers });
          if (input.logs) Object.assign(r, { logs: await readLogs(c, address, input.logs) });
        }
      }
      return { address, read, says: READ_CHAIN_SAYS };
    },
  });
}

export const readChain = makeReadChain();

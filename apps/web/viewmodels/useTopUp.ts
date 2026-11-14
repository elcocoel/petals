// Sending another token, in the lobby's money panel under Add NEAR: a chain and a token, each a dropdown with a
// search, and the moment a token is chosen, an address asked of the server (once per token a visit) that takes
// any amount of it, landing as NEAR on the person's balance, with the fees, the least it takes and until when.
// USDC on Ethereum is chosen when the panel opens, so an address is there at once. Under it, their top-ups: what
// was sent, what it should land as, what landed. The shown address is read again every few seconds while it waits
// or swaps; once it lands the balance and the history read again (`paid`). lib/intents.ts holds the order, the
// words and the view.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readPayTokens, readTopUp, readTopUps, startTopUp } from '../lib/agent-client.ts';
import {
  chainName,
  chainsOf,
  historyRows,
  intentWords,
  isUnderWay,
  OPENS_ON,
  type PayToken,
  quoteLine,
  shortAddress,
  type TopUp,
  type TopUpRow,
  type TopUpView,
  tokensOn,
} from '../lib/intents.ts';
import { chainIcon, tokenIcon } from '../lib/token-icons.ts';

/** How often the shown address is read again while it waits or swaps: 1Click settles in tens of seconds. */
const READ_AGAIN_MS = 5000;

export function useTopUp(
  asking: string | null,
  paid: () => void,
  /** today's NEAR price, for what a top-up should land as */
  nearUsd: number | null,
): TopUpView {
  const [tokens, setTokens] = useState<PayToken[] | null>(null);
  const [chain, setChain] = useState<string>(OPENS_ON.chain);
  /** the token chosen on the chain; none yet is the chain's first */
  const [picked, setPicked] = useState('');
  /** the addresses given this visit, by token: choosing one again shows its own */
  const [given, setGiven] = useState<Record<string, TopUp>>({});
  const [askingFor, setAskingFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'address' | 'memo' | null>(null);
  const [rows, setRows] = useState<TopUpRow[] | null>(null);
  // a new pay row is a new top-up: adjusted during render, as React allows
  const [askedBy, setAskedBy] = useState(asking);
  if (asking !== askedBy) {
    setAskedBy(asking);
    setGiven({});
    setError(null);
  }

  useEffect(() => {
    let gone = false;
    void readPayTokens().then((list) => {
      if (!gone) setTokens(list);
    });
    return () => {
      gone = true;
    };
  }, []);
  const readHistory = useCallback(() => {
    void readTopUps().then(setRows);
  }, []);
  useEffect(() => readHistory(), [readHistory]);

  const chains = useMemo(() => (tokens ? chainsOf(tokens) : []), [tokens]);
  const onChain = useMemo(() => (tokens ? tokensOn(tokens, chain) : []), [tokens, chain]);
  // none chosen yet: the chain's USDC, else its first
  const asset = onChain.some((t) => t.asset === picked)
    ? picked
    : (onChain.find((t) => t.symbol === OPENS_ON.symbol)?.asset ?? onChain[0]?.asset ?? '');

  const ask = useCallback(async (origin: string) => {
    setError(null);
    setAskingFor(origin);
    try {
      const t = await startTopUp({ origin_asset: origin });
      setGiven((g) => ({ ...g, [origin]: t }));
    } catch (e) {
      setError((e instanceof Error && e.message) || intentWords.state.FAILED);
    } finally {
      setAskingFor((a) => (a === origin ? null : a));
    }
  }, []);

  // the chosen token's address, asked for the moment it's chosen, once a visit
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (!asset || given[asset] || tried.current.has(asset)) return;
    tried.current.add(asset);
    setCopied(null);
    void ask(asset);
  }, [asset, given, ask]);

  // the shown address, read again while it waits or swaps; once it lands, the balance and the history again
  const shown = asset ? (given[asset] ?? null) : null;
  const deposit = shown?.deposit_address ?? null;
  const underWay = shown ? isUnderWay(shown.status) : false;
  useEffect(() => {
    if (!deposit || !underWay) return;
    const id = window.setInterval(() => {
      void readTopUp(deposit).then((t) => {
        if (!t) return;
        setGiven((g) => {
          const at = Object.entries(g).find(([, v]) => v.deposit_address === t.deposit_address);
          if (!at || at[1].status === t.status) return g;
          return { ...g, [at[0]]: { ...at[1], ...t } };
        });
      });
    }, READ_AGAIN_MS);
    return () => window.clearInterval(id);
  }, [deposit, underWay]);
  const was = useRef<string | null>(null);
  const status = shown?.status ?? null;
  useEffect(() => {
    if (!status || status === 'PENDING_DEPOSIT' || was.current === `${deposit}:${status}`) return;
    was.current = `${deposit}:${status}`;
    readHistory();
    if (status === 'SUCCESS') paid();
  }, [deposit, status, readHistory, paid]);

  const copy = useCallback((which: 'address' | 'memo', text: string) => {
    void navigator.clipboard.writeText(text).then(
      () => setCopied(which),
      () => {},
    );
  }, []);

  const token = tokens?.find((t) => t.asset === asset) ?? null;
  return {
    chains: tokens
      ? chains.map((c) => ({ chain: c.chain, name: chainName(c.chain), icon: chainIcon(c.chain) }))
      : null,
    chain,
    tokens: onChain.map((t) => ({ asset: t.asset, symbol: t.symbol, icon: tokenIcon(t.symbol) })),
    asset,
    asking: askingFor !== null && askingFor === asset,
    address:
      shown && token
        ? {
            line: intentWords.send(token.symbol, chainName(token.chain)),
            address: shown.deposit_address,
            short: shortAddress(shown.deposit_address),
            memo: shown.deposit_memo ?? null,
            quote: quoteLine(shown, token.symbol),
            status: shown.status === 'PENDING_DEPOSIT' ? null : intentWords.state[shown.status],
          }
        : null,
    error,
    copied,
    history: rows && tokens ? historyRows(rows, tokens, nearUsd) : null,
    actions: {
      chooseChain: (c: string) => {
        setChain(c);
        setPicked('');
      },
      choose: setPicked,
      copy,
    },
  };
}

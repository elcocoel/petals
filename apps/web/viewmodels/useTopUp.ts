// Paying with another token through NEAR Intents, in the lobby's money panel: a search over the tokens, the
// chains side by side with the chosen chain's tokens, and, the moment a token is chosen, the address that takes
// any amount of it (asked of the server once per token a visit), with the fees, the least it takes and until when.
// Nothing to type and nothing to press but the token: the refund address is the person's own wallet on that chain,
// and only where they have none does one field ask for it. Under it, their top-ups: what was sent, what it should
// land as, what landed. The shown address is read again every few seconds while it waits or swaps; once it lands
// the balance and the history read again (`paid`). lib/intents.ts holds the order, the words and the view.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readPayTokens, readTopUp, readTopUps, startTopUp } from '../lib/agent-client.ts';
import {
  chainName,
  chainsOf,
  historyRows,
  intentWords,
  isUnderWay,
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
  /** the chain the list opens on (lib/intents homeChain) */
  home: string,
): TopUpView {
  const [tokens, setTokens] = useState<PayToken[] | null>(null);
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [asset, setAsset] = useState('');
  /** the addresses given this visit, by token: choosing one again shows its own */
  const [given, setGiven] = useState<Record<string, TopUp>>({});
  const [askingFor, setAskingFor] = useState<string | null>(null);
  const [refund, setRefund] = useState<{ asset: string; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'address' | 'memo' | null>(null);
  const [rows, setRows] = useState<TopUpRow[] | null>(null);
  // a new pay row is a new top-up: adjusted during render, as React allows
  const [askedBy, setAskedBy] = useState(asking);
  if (asking !== askedBy) {
    setAskedBy(asking);
    setAsset('');
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

  const chains = useMemo(() => (tokens ? chainsOf(tokens, search) : []), [tokens, search]);
  // the chain chosen, else the home chain, else the first the search finds
  const chain =
    [picked, home].find((c) => c && chains.some((x) => x.chain === c)) ?? chains[0]?.chain ?? home;
  const onChain = useMemo(
    () => (tokens ? tokensOn(tokens, chain, search) : []),
    [tokens, chain, search],
  );

  const ask = useCallback(async (origin: string, refundTo?: string) => {
    setError(null);
    setAskingFor(origin);
    try {
      const t = await startTopUp({
        origin_asset: origin,
        ...(refundTo ? { refund_to: refundTo } : {}),
      });
      setGiven((g) => ({ ...g, [origin]: t }));
      setRefund(null);
    } catch (e) {
      const said = e instanceof Error ? e.message : '';
      // no wallet of theirs on that chain: one field asks where anything unswapped goes back
      if (/refund_to/.test(said))
        setRefund((r) => (r?.asset === origin ? r : { asset: origin, value: '' }));
      else setError(said || intentWords.state.FAILED);
    } finally {
      setAskingFor((a) => (a === origin ? null : a));
    }
  }, []);

  const choose = useCallback(
    (origin: string) => {
      setAsset(origin);
      setCopied(null);
      if (!given[origin]) void ask(origin);
    },
    [given, ask],
  );

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
    search,
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
    refund:
      refund && refund.asset === asset && token
        ? { label: intentWords.refund(chainName(token.chain)), value: refund.value }
        : null,
    error,
    copied,
    history: rows && tokens ? historyRows(rows, tokens, nearUsd) : null,
    actions: {
      search: setSearch,
      chooseChain: setPicked,
      choose,
      setRefund: (value: string) => setRefund((r) => (r ? { ...r, value } : r)),
      sendRefund: () => {
        if (refund?.value.trim()) void ask(refund.asset, refund.value.trim());
      },
      copy,
    },
  };
}

// Paying with another token through NEAR Intents, beside the pay row's 'Add 1 NEAR', so people can pay with
// anything from anywhere. The person picks a token and its chain, the dollars and their own
// address on that chain for a refund; the server gives a deposit address and the exact amount; they send it
// in one plain transfer from whatever wallet they have. The dollars are the pay row's own amount, one for both. Where it stands is read again every few seconds
// while it's under way, and stops when it ends; once it has landed, the one balance reads again (`paid`).
// lib/intents.ts holds what's offered and the words.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readPayTokens, readTopUp, startTopUp } from '../lib/agent-client.ts';
import {
  chainName,
  dollarsOf,
  intentWords,
  isUnderWay,
  type PayToken,
  statusLine,
  type TopUp,
  type TopUpView,
  tokenChoices,
  untilWords,
} from '../lib/intents.ts';

/** How often a top-up under way is read again: 1Click settles in tens of seconds. */
const READ_AGAIN_MS = 5000;

export function useTopUp(
  asking: string | null,
  paid: () => void,
  /** the pay row's amount: one amount for both ways of paying */
  amount: { usd: string; setUsd: (usd: string) => void },
): TopUpView {
  const { usd, setUsd } = amount;
  const [open, setOpen] = useState(false);
  const [tokens, setTokens] = useState<PayToken[] | null>(null);
  const [asset, setAsset] = useState('');
  const [refund, setRefund] = useState('');
  const [getting, setGetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topUp, setTopUp] = useState<TopUp | null>(null);
  const [copied, setCopied] = useState<'address' | 'memo' | null>(null);
  // a new pay row is a new top-up: adjusted during render, as React allows
  const [askedBy, setAskedBy] = useState(asking);
  if (asking !== askedBy) {
    setAskedBy(asking);
    setOpen(false);
    setTopUp(null);
    setError(null);
  }

  useEffect(() => {
    if (!open || tokens) return;
    let gone = false;
    void readPayTokens().then((list) => {
      if (!gone) setTokens(list);
    });
    return () => {
      gone = true;
    };
  }, [open, tokens]);

  // read again while it's under way; once it lands, the balance reads again, once
  const landed = useRef<string | null>(null);
  const deposit = topUp?.deposit_address ?? null;
  const underWay = topUp ? isUnderWay(topUp.status) : false;
  useEffect(() => {
    if (!deposit || !underWay) return;
    const id = window.setInterval(() => {
      void readTopUp(deposit).then((t) => {
        if (t)
          setTopUp((was) => (was?.deposit_address === t.deposit_address ? { ...was, ...t } : was));
      });
    }, READ_AGAIN_MS);
    return () => window.clearInterval(id);
  }, [deposit, underWay]);
  useEffect(() => {
    if (topUp?.status === 'SUCCESS' && landed.current !== topUp.deposit_address) {
      landed.current = topUp.deposit_address;
      paid();
    }
  }, [topUp, paid]);

  const token = tokens?.find((t) => t.asset === asset) ?? null;
  const get = useCallback(async () => {
    const dollars = dollarsOf(usd);
    if (!asset) return;
    if (dollars === null) {
      setError(intentWords.badUsd);
      return;
    }
    if (!refund.trim()) {
      setError(intentWords.noRefund);
      return;
    }
    setError(null);
    setGetting(true);
    try {
      setTopUp(await startTopUp({ usd: dollars, origin_asset: asset, refund_to: refund.trim() }));
    } catch (e) {
      setError(e instanceof Error ? e.message : intentWords.status.FAILED);
    } finally {
      setGetting(false);
    }
  }, [asset, usd, refund]);

  const copy = useCallback((which: 'address' | 'memo', text: string) => {
    void navigator.clipboard.writeText(text).then(
      () => setCopied(which),
      () => {},
    );
  }, []);

  const groups = useMemo(() => tokenChoices(tokens ?? []), [tokens]);
  const chain = token ? chainName(token.chain) : null;
  return {
    open,
    /** null while the list is on its way */
    groups: tokens ? groups : null,
    asset,
    usd,
    refund,
    refundLabel: intentWords.refund(chain ?? '…'),
    getting,
    error,
    sent: topUp
      ? {
          line: intentWords.send(topUp.amount_in_formatted ?? '', token?.symbol ?? '', chain ?? ''),
          address: topUp.deposit_address,
          memo: topUp.deposit_memo ?? null,
          before: untilWords(topUp.deadline),
          status: statusLine(topUp),
          ended: !isUnderWay(topUp.status),
          landed: topUp.status === 'SUCCESS',
        }
      : null,
    copied,
    actions: {
      open: () => setOpen(true),
      setAsset: (v: string) => {
        setAsset(v);
        setTopUp(null);
      },
      setUsd,
      setRefund,
      get: () => void get(),
      copy,
      again: () => {
        setTopUp(null);
        setCopied(null);
      },
    },
  };
}

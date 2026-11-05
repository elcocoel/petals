// "Sponsor a refresh" (T067, FR-031): asking for a dry quote. No money moves.
import type { QuoteResult } from '@petal/core/types';
import { useState } from 'react';
import { askQuote, type QuoteRequest } from '../lib/agent-client.ts';

export function useQuote({ purpose, network }: Pick<QuoteRequest, 'purpose' | 'network'>) {
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      setQuote(await askQuote({ purpose, amount_usd: 1, ...(network ? { network } : {}) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return { quote, error, busy, ask };
}

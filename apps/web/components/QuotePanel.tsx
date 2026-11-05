'use client';
// "Sponsor a refresh" (T067, FR-031): a dry NEAR Intents 1Click quote. Amount in, time, fees.
// No deposit address is asked for or shown, and no money moves. The same panel quotes new
// coverage of a network Petal can't read yet (purpose sponsor_coverage).
import { useQuote } from '../viewmodels/useQuote.ts';

const LABEL = 'Dry quote. Paying is not switched on.';

export function QuotePanel({
  purpose = 'sponsor_refresh',
  network,
}: {
  purpose?: 'sponsor_refresh' | 'sponsor_coverage';
  network?: string;
}) {
  const { quote, error, busy, ask } = useQuote({ purpose, ...(network ? { network } : {}) });

  return (
    <section className="box">
      <h2>
        {purpose === 'sponsor_refresh'
          ? 'Sponsor a refresh'
          : 'Sponsor a network Petal can’t read yet'}
      </h2>
      <p className="muted">
        {purpose === 'sponsor_refresh'
          ? 'What 1 USD toward a fresh snapshot would cost, paid in USDC from Base through NEAR Intents.'
          : 'What 1 USD toward new coverage would cost, paid in USDC from Base through NEAR Intents.'}
      </p>
      <button type="button" onClick={ask} disabled={busy}>
        {busy ? 'Asking 1Click…' : 'Get a dry quote'}
      </button>
      {error && <p className="error">{error}</p>}
      {quote && (
        <div>
          <p>
            <strong>{quote.note || LABEL}</strong>
          </p>
          <ul>
            <li>
              Amount in: {quote.amount_in} USDC (about {quote.amount_in_usd} USD; at least{' '}
              {quote.min_amount_in})
            </li>
            <li>Time: about {quote.time_estimate_s} s</li>
            <li>
              Fees:{' '}
              {Object.entries(quote.fees).length
                ? Object.entries(quote.fees)
                    .map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`)
                    .join('; ')
                : 'none listed'}
            </li>
            <li className="muted">
              Quoted {quote.quoted_at}, correlation id <code>{quote.correlation_id}</code>
            </li>
          </ul>
        </div>
      )}
      {!quote && <p className="muted">{LABEL}</p>}
    </section>
  );
}

// The way to add credit for Petals' agent, where the person meets it in the chat (B): one line and one
// button, which opens the wallet. Paying with another token is the lobby's (workspace/TokenPay). Props only:
// viewmodels/usePay.ts holds the payment. Words from lib/pay.ts.
import { PAY_NEAR, PAY_USD_MAX, type PayPhase, payWords } from '../../lib/pay.ts';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';
import { Field } from '../ui/Field.tsx';
import { Range } from '../ui/Range.tsx';

export function PayRow({
  first = false,
  phase,
  added,
  onPay,
  label = payWords.button(PAY_NEAR),
  amount,
  failedWords = payWords.failed,
  canPay = true,
  addedWords,
  line,
  bare = false,
}: {
  /** offered before the first question, to someone with no credit yet: its words say so */
  first?: boolean;
  phase: PayPhase;
  /** What the last payment added, in NEAR, once it has. */
  added: string | null;
  onPay: () => void;
  /** what the press says: dollars with NEAR beside it, or Confirm my transfer while one waits */
  label?: string;
  /** the dollars the person chooses to add, where there's a price to send them in */
  amount?: { usd: string; label: string; onUsd: (usd: string) => void } | null;
  /** what a failed press says: a transfer that went out says it isn't confirmed yet */
  failedWords?: string;
  canPay?: boolean;
  /** what the row says once a payment was added, where the page has its own words for it */
  addedWords?: (near: string) => string;
  /** the row's first line, where the page has its own words for it */
  line?: string;
  /** laid out on its page, under what it adds to: no box and no first line, the amount a slider by the press */
  bare?: boolean;
}) {
  if (phase === 'added' && added && !bare) {
    return (
      <p className="my-0 type-ui">
        {addedWords
          ? addedWords(added)
          : first
            ? payWords.addedFirst(added)
            : payWords.added(added)}
      </p>
    );
  }
  return (
    <div
      className={`flex w-full flex-col gap-text-gap ${bare ? 'items-stretch' : 'items-start border border-hairline p-text-gap'}`}
    >
      {!bare && <p className="my-0 type-ui">{line ?? (first ? payWords.start : payWords.out)}</p>}
      {bare && phase === 'added' && added && (
        <p className="my-0 type-ui">{addedWords ? addedWords(added) : payWords.added(added)}</p>
      )}
      {amount && !bare && (
        <Field
          id="pay-usd"
          label={amount.label}
          value={amount.usd}
          onChange={amount.onUsd}
          scale="app"
        />
      )}
      <ActionRow gap="tight">
        {amount && bare && (
          // the dollars, dragged, beside the press that adds them
          <span className="min-w-0 basis-full sm:basis-2/5">
            <Range
              label={amount.label}
              min={1}
              max={PAY_USD_MAX}
              step={1}
              value={Number(amount.usd) || 1}
              shown={`$${Number(amount.usd) || 1}`}
              onChange={(v) => amount.onUsd(String(v))}
              onSet={() => {}}
            />
          </span>
        )}
        <Button
          variant={bare ? 'primary' : 'compact'}
          disabled={phase === 'paying' || !canPay}
          onClick={onPay}
        >
          {phase === 'paying' ? payWords.paying : label}
        </Button>
      </ActionRow>
      {phase === 'failed' && <p className="my-0 type-ui text-muted">{failedWords}</p>}
    </div>
  );
}

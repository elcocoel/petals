// The way to add credit for Petals' agent, where the person meets it in the chat (B): one line and one
// button, which opens the wallet, and beside it paying with any other token from any chain through NEAR
// Intents (Elco, 10 Nov): pick the token, the dollars and a refund address, then send the exact amount to
// the address given, in one transfer from any wallet. Props only: viewmodels/usePay.ts and useTopUp.ts
// hold the payments. Words from lib/pay.ts and lib/intents.ts, drafts.
import { intentWords, type TopUpView } from '../../lib/intents.ts';
import { PAY_NEAR, type PayPhase, payWords } from '../../lib/pay.ts';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';
import { Field } from '../ui/Field.tsx';
import { Mono } from '../ui/Mono.tsx';

export function PayRow({
  first = false,
  phase,
  added,
  onPay,
  topUp,
  label = payWords.button(PAY_NEAR),
  amount,
  failedWords = payWords.failed,
  canPay = true,
}: {
  /** offered before the first question, to someone with no credit yet: its words say so */
  first?: boolean;
  phase: PayPhase;
  /** What the last payment added, in NEAR, once it has. */
  added: string | null;
  onPay: () => void;
  /** Paying with any other token, through NEAR Intents. */
  topUp?: TopUpView;
  /** what the press says: dollars with NEAR beside it, or Confirm my transfer while one waits */
  label?: string;
  /** the dollars the person chooses to add, where there's a price to send them in */
  amount?: { usd: string; label: string; onUsd: (usd: string) => void } | null;
  /** what a failed press says: a transfer that went out says it isn't confirmed yet */
  failedWords?: string;
  canPay?: boolean;
}) {
  if (phase === 'added' && added) {
    return (
      <p className="my-0 type-ui">{first ? payWords.addedFirst(added) : payWords.added(added)}</p>
    );
  }
  const sent = topUp?.sent ?? null;
  if (sent?.landed) {
    return <p className="my-0 type-ui">{sent.status}</p>;
  }
  return (
    <div className="flex flex-col items-start gap-text-gap border border-hairline p-text-gap">
      <p className="my-0 type-ui">{first ? payWords.start : payWords.out}</p>
      {amount && (
        <Field
          id="pay-usd"
          label={amount.label}
          value={amount.usd}
          onChange={amount.onUsd}
          scale="app"
        />
      )}
      <ActionRow gap="tight">
        <Button variant="compact" disabled={phase === 'paying' || !canPay} onClick={onPay}>
          {phase === 'paying' ? payWords.paying : label}
        </Button>
        {topUp && !topUp.open && (
          <Button variant="quiet" onClick={topUp.actions.open}>
            {intentWords.other}
          </Button>
        )}
      </ActionRow>
      {phase === 'failed' && <p className="my-0 type-ui text-muted">{failedWords}</p>}
      {topUp?.open &&
        (sent && !sent.ended ? <Sending sent={sent} topUp={topUp} /> : <Form topUp={topUp} />)}
      {sent?.ended && <p className="my-0 type-ui text-muted">{sent.status}</p>}
    </div>
  );
}

function Form({ topUp }: { topUp: TopUpView }) {
  const { actions } = topUp;
  if (!topUp.groups) return <p className="my-0 type-ui text-muted">{intentWords.loading}</p>;
  return (
    <div className="flex w-full flex-col gap-text-gap">
      <Field
        id="topup-token"
        label={intentWords.token}
        value={topUp.asset}
        onChange={actions.setAsset}
        choices={topUp.groups}
        none={intentWords.pick}
        scale="app"
      />
      {topUp.asset && (
        <>
          <Field
            id="topup-usd"
            label={intentWords.usd}
            value={topUp.usd}
            onChange={actions.setUsd}
            scale="app"
          />
          <Field
            id="topup-refund"
            label={topUp.refundLabel}
            value={topUp.refund}
            onChange={actions.setRefund}
            scale="app"
          />
          <div>
            {/* one main action in the row: Add 1 NEAR's (design/minimally-good.md, rule 6) */}
            <Button variant="pill" disabled={topUp.getting} onClick={actions.get}>
              {topUp.getting ? intentWords.getting : intentWords.get}
            </Button>
          </div>
        </>
      )}
      {topUp.error && <p className="error my-0">{topUp.error}</p>}
    </div>
  );
}

function Sending({ sent, topUp }: { sent: NonNullable<TopUpView['sent']>; topUp: TopUpView }) {
  const { copy } = topUp.actions;
  return (
    <div className="flex w-full flex-col gap-text-gap">
      <p className="my-0 type-ui">{sent.line}</p>
      <ActionRow gap="tight">
        <span className="min-w-0 wrap-anywhere">
          <Mono as="span">{sent.address}</Mono>
        </span>
        <Button variant="quiet" onClick={() => copy('address', sent.address)}>
          {topUp.copied === 'address' ? intentWords.copied : intentWords.copy}
        </Button>
      </ActionRow>
      {sent.memo && (
        <>
          <p className="my-0 type-ui">{intentWords.memo}</p>
          <ActionRow gap="tight">
            <span className="min-w-0 wrap-anywhere">
              <Mono as="span">{sent.memo}</Mono>
            </span>
            <Button variant="quiet" onClick={() => copy('memo', sent.memo ?? '')}>
              {topUp.copied === 'memo' ? intentWords.copied : intentWords.copy}
            </Button>
          </ActionRow>
        </>
      )}
      {sent.before && <p className="my-0 type-ui text-muted">{intentWords.before(sent.before)}</p>}
      <p className="my-0 type-ui text-muted">{sent.status}</p>
    </div>
  );
}

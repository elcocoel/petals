// Paying with another token, in the money panel, as wallets lay it out: a search on top; the chains, each with
// its logo, side by side with the chosen chain's tokens, each with its own; and, the moment a token is chosen, the
// address that takes any amount of it, as text to copy and as a QR code for a phone, with one line of the fees,
// the least it takes and until when. Nothing to type and no amount to choose; only where the person has no wallet
// on that chain does one field ask where anything unswapped goes back. Under it, their top-ups: when, what was
// sent, the NEAR it should land as, what landed and where it stands. Every part keeps its place in every state.
// Props only: viewmodels/useTopUp.ts holds it. Words from lib/intents.ts.
import { intentWords, type TopUpView } from '../../lib/intents.ts';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';
import { Field } from '../ui/Field.tsx';
import { Mono } from '../ui/Mono.tsx';
import { NavItem } from '../ui/NavItem.tsx';
import { Qr } from '../ui/Qr.tsx';

export function TokenPay({ topUp }: { topUp: TopUpView }) {
  const { actions } = topUp;
  const address = topUp.address;
  return (
    <div className="flex w-full min-w-0 flex-col gap-text-gap">
      <Field
        id="topup-search"
        label={intentWords.search}
        hideLabel
        placeholder={intentWords.search}
        value={topUp.search}
        onChange={actions.search}
        scale="app"
        fit={1}
      />
      <div className="grid w-full grid-cols-2 gap-text-gap">
        <div
          role="listbox"
          aria-label={intentWords.chain}
          className="h-drawing-240 min-w-0 overflow-y-auto border border-hairline"
        >
          {topUp.chains === null ? (
            <NavItem label={intentWords.loading} muted />
          ) : (
            topUp.chains.map((c) => (
              <NavItem
                key={c.chain}
                label={c.name}
                logo={c.icon}
                mark={c.name}
                chosen={c.chain === topUp.chain}
                onClick={() => actions.chooseChain(c.chain)}
              />
            ))
          )}
        </div>
        <div
          role="listbox"
          aria-label={intentWords.token}
          className="h-drawing-240 min-w-0 overflow-y-auto border border-hairline"
        >
          {topUp.chains !== null && topUp.tokens.length === 0 ? (
            <NavItem label={intentWords.none} muted />
          ) : (
            topUp.tokens.map((t) => (
              <NavItem
                key={t.asset}
                label={t.symbol}
                logo={t.icon}
                mark={t.symbol}
                chosen={t.asset === topUp.asset}
                onClick={() => actions.choose(t.asset)}
              />
            ))
          )}
        </div>
      </div>
      <div className="flex min-h-drawing-144 w-full min-w-0 flex-wrap items-start gap-text-gap border border-hairline p-space-8">
        {address ? (
          <>
            <Qr text={address.address} label={address.line} />
            <div className="flex min-w-0 flex-1 basis-drawing-240 flex-col gap-space-8">
              <p className="my-0 type-ui">{address.line}</p>
              <ActionRow gap="tight">
                <span className="min-w-0 whitespace-nowrap">
                  <span className="sm:hidden">
                    <Mono as="span">{address.short}</Mono>
                  </span>
                  <span className="hidden sm:inline">
                    <Mono as="span">{address.address}</Mono>
                  </span>
                </span>
                <Button variant="quiet" onClick={() => actions.copy('address', address.address)}>
                  {topUp.copied === 'address' ? intentWords.copied : intentWords.copy}
                </Button>
              </ActionRow>
              {address.memo && (
                <ActionRow gap="tight">
                  <span className="type-ui">{intentWords.memo}</span>
                  <Mono as="span">{address.memo}</Mono>
                  <Button variant="quiet" onClick={() => actions.copy('memo', address.memo ?? '')}>
                    {topUp.copied === 'memo' ? intentWords.copied : intentWords.copy}
                  </Button>
                </ActionRow>
              )}
              {address.quote && <p className="my-0 type-ui text-muted">{address.quote}</p>}
              {address.status && <p className="my-0 type-ui">{address.status}</p>}
            </div>
          </>
        ) : topUp.refund ? (
          <div className="flex min-w-0 flex-col gap-space-8">
            <Field
              id="topup-refund"
              label={topUp.refund.label}
              value={topUp.refund.value}
              onChange={actions.setRefund}
              onEnter={actions.sendRefund}
              scale="app"
              fit={42}
            />
            <p className="my-0 type-ui text-muted">{intentWords.refundThen}</p>
          </div>
        ) : (
          <p className="my-0 type-ui text-muted">
            {topUp.asking ? intentWords.asking : intentWords.pick}
          </p>
        )}
      </div>
      {topUp.error && <p className="error my-0">{topUp.error}</p>}
      <span className="type-label">{intentWords.history}</span>
      {topUp.history === null ? (
        <p className="my-0 type-ui text-muted">{intentWords.loading}</p>
      ) : topUp.history.length === 0 ? (
        <p className="my-0 type-ui text-muted">{intentWords.historyNone}</p>
      ) : (
        <div className="w-full min-w-0 overflow-x-auto">
          <table className="w-full border-collapse type-ui">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-space-4 pr-space-8 font-normal">{intentWords.heads.when}</th>
                <th className="py-space-4 pr-space-8 font-normal">{intentWords.heads.sent}</th>
                <th className="py-space-4 pr-space-8 font-normal">{intentWords.heads.expected}</th>
                <th className="py-space-4 pr-space-8 font-normal">{intentWords.heads.landed}</th>
                <th className="py-space-4 font-normal">{intentWords.heads.status}</th>
              </tr>
            </thead>
            <tbody>
              {topUp.history.map((r) => (
                <tr key={r.key} className="border-t border-hairline">
                  <td className="py-space-4 pr-space-8 whitespace-nowrap">{r.when}</td>
                  <td className="py-space-4 pr-space-8 whitespace-nowrap">{r.sent}</td>
                  <td className="py-space-4 pr-space-8 whitespace-nowrap">{r.expected}</td>
                  <td className="py-space-4 pr-space-8 whitespace-nowrap">{r.landed}</td>
                  <td className="py-space-4 whitespace-nowrap">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

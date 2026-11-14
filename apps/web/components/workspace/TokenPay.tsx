// Sending another token, in the money panel under Add NEAR: a chain and a token, two dropdowns with a search and
// logos, and, the moment a token is chosen, the address that takes any amount of it, as text to copy and as a QR
// code for a phone, with one line of the fees, the least it takes and until when; it lands as NEAR on the
// balance. Under it, their top-ups: when, what was sent, the NEAR it should land as, what landed and where it
// stands. Props only: viewmodels/useTopUp.ts holds it. Words from lib/intents.ts.
import { intentWords, type TopUpView } from '../../lib/intents.ts';
import { ActionRow } from '../ui/ActionRow.tsx';
import { Button } from '../ui/Button.tsx';
import { Mono } from '../ui/Mono.tsx';
import { Qr } from '../ui/Qr.tsx';
import { Select } from '../ui/Select.tsx';

export function TokenPay({ topUp }: { topUp: TopUpView }) {
  const { actions } = topUp;
  const address = topUp.address;
  return (
    <div className="flex w-full min-w-0 flex-col gap-text-gap">
      {topUp.chains === null ? (
        <p className="my-0 type-ui text-muted">{intentWords.loading}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-text-gap">
          <Select
            label={intentWords.chain}
            value={topUp.chain}
            options={topUp.chains.map((c) => ({ value: c.chain, label: c.name, logo: c.icon }))}
            onChange={actions.chooseChain}
            search={intentWords.searchChains}
          />
          <Select
            label={intentWords.token}
            value={topUp.asset}
            options={topUp.tokens.map((t) => ({ value: t.asset, label: t.symbol, logo: t.icon }))}
            onChange={actions.choose}
            search={intentWords.searchTokens}
          />
        </div>
      )}
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

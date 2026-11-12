// A wallet chosen on the map, in the map's Information box (lib/wallet-view.ts; WORKSPACE, wave 4: a petal press
// shows the same on /make as on /map): its name in UI words, its address quiet in mono where the name says
// something else, then each fact as a tool row reads (what it is quiet, the value in the words' colour), and its
// dollars with where the price was read. Props only.
import type { WalletView } from '../lib/wallet-view.ts';
import { Mono } from './ui/Mono.tsx';
import { SourceLink } from './ui/SourceLink.tsx';

export function WalletFacts({ view }: { view: WalletView }) {
  return (
    <div className="flex flex-col gap-space-4">
      <span className="type-ui text-primary wrap-anywhere">{view.title}</span>
      {view.address && (
        <Mono as="span" tone="muted">
          {view.address}
        </Mono>
      )}
      <dl className="my-0 flex flex-col">
        {view.facts.map(([k, v]) => (
          <div key={k} className="flex min-h-row-height items-center justify-between gap-space-8">
            <dt className="type-ui text-muted">{k}</dt>
            <dd className="m-0 min-w-0 truncate type-ui text-primary">{v}</dd>
          </div>
        ))}
      </dl>
      {view.worth && (
        <p className="my-0 type-ui">
          {view.worth.text}
          <span className="type-mono text-muted"> {view.worth.source}</span>
          {view.worth.link && <SourceLink href={view.worth.link} name={view.worth.source} />}
        </p>
      )}
    </div>
  );
}

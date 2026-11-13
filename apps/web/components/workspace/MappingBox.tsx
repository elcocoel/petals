// The mapping state's box on /make (lib/mapping.ts): the map in front, and what the person would add to it in
// their name. Layer by layer, each says what it adds to that map (new data, a new moment, new subjects, a
// match credited to both, or a value that differs, both standing). Then what can't go yet, saying why, and the
// publish press. Props only.
import type { ReactNode } from 'react';
import type { MappingView } from '../../lib/mapping.ts';
import type { PublishPressView } from '../../lib/publish-press.ts';
import { PublishPress } from '../PublishPress.tsx';
import { ToMapLines } from '../ToMapLines.tsx';

export function MappingBox({
  view,
  press,
  onPublish,
  wallet,
}: {
  view: MappingView;
  press: PublishPressView | null;
  onPublish: () => void;
  /** the wallet chosen on the map: what can be added about it (a note or a name, or having it mapped) */
  wallet?: { heading: string; body: ReactNode } | undefined;
}) {
  return (
    <div className="flex flex-col gap-text-gap p-block-gap">
      {wallet && (
        <section className="flex flex-col gap-space-4 border-b border-hairline pb-text-gap">
          <h3 className="m-0 type-ui font-semibold wrap-anywhere">{wallet.heading}</h3>
          {wallet.body}
        </section>
      )}
      <p className="m-0 type-label">{view.intro}</p>
      {view.layers.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-space-8 p-0">
          {view.layers.map((l) => (
            <li key={l.key} className="flex flex-col border-t border-hairline pt-space-4">
              <span className="type-ui">{l.line}</span>
              <ToMapLines lines={l.toMap} />
            </li>
          ))}
        </ul>
      )}
      {view.adds.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-space-4 p-0">
          {view.adds.map((a) => (
            <li key={a.key} className="flex flex-col">
              <span className="type-ui text-muted">{a.line}</span>
              {a.why && <span className="type-caption text-muted">{a.why}</span>}
            </li>
          ))}
        </ul>
      )}
      {view.empty && <p className="m-0 type-ui text-muted">{view.empty}</p>}
      {press && <PublishPress view={press} onPublish={onPublish} />}
    </div>
  );
}

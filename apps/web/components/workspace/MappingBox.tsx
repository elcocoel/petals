// The mapping state on /make (lib/mapping.ts), under the conversation and right above the composer's switch: the
// wallet chosen on the map, the map in front and what the person would add to it in their name, layer by layer
// (new data, a new moment, new subjects, a match credited to both, or a value that differs, both standing), what
// can't go yet, saying why, and last, nearest the hand, the publish press, an action of its own
// (components/PublishPress). With no map in front the press says what's kept, so no line asks to go into one.
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
  all,
}: {
  view: MappingView;
  press: PublishPressView | null;
  onPublish: () => void;
  /** with no single map in front: everything the person kept on maps across the Power Map, in one press */
  all?: { view: PublishPressView; onPublish: () => void } | null | undefined;
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
      {!all && <p className="m-0 type-label">{view.intro}</p>}
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
      {view.empty && !all && <p className="m-0 type-ui text-muted">{view.empty}</p>}
      {/* the press last, by the composer's switch: what goes, the press, and where it stands */}
      {press && <PublishPress view={press} onPublish={onPublish} />}
      {all && <PublishPress view={all.view} onPublish={all.onPublish} />}
    </div>
  );
}

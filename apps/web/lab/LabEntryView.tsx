// One registry entry: its names and source, then each state once, on each surface the landing page draws
// it on. A section draws edge to edge, exactly as on the landing page, with its names in the column
// above it.
import { type SurfaceName, surfaceNames } from '@petal/tokens';
import { Fragment } from 'react';
import { Mono } from '../components/ui/Mono.tsx';
import type { LabEntry, LabState } from './registry.tsx';

/** The site's reading column, which the lab's own words sit in. */
export const LAB_COLUMN = 'mx-auto max-w-content-width px-block-gap';

const stateLine = (state: LabState) =>
  state.figmaNode ? `${state.name} · ${state.figmaName} ${state.figmaNode}` : state.name;

const isOn = (state: LabState, kind: SurfaceName) => (state.surfaces ?? ['ground']).includes(kind);

function StateView({ state }: { state: LabState }) {
  return (
    <div className={`flex flex-col items-start gap-space-8 ${state.wide ? 'w-full' : ''}`}>
      <Mono tone="muted">{stateLine(state)}</Mono>
      {state.render()}
    </div>
  );
}

/** `states` is the part of the entry to draw. Only the one with every landing state takes the anchor. */
export function LabEntryView({
  entry,
  states,
  anchor = true,
}: {
  entry: LabEntry;
  states: readonly LabState[];
  anchor?: boolean;
}) {
  return (
    <article id={anchor ? entry.id.toLowerCase() : undefined} className="flex flex-col gap-space-8">
      <h3 className="m-0">{entry.id}</h3>
      <p className="m-0 type-mono text-muted">
        {entry.figmaNode
          ? `${entry.figmaName} ${entry.figmaNode}`
          : entry.states.some((s) => s.figmaNode)
            ? 'In Figma, state by state'
            : 'Not in Figma yet'}{' '}
        · {entry.source}
      </p>
      {surfaceNames
        .filter((kind) => states.some((state) => isOn(state, kind)))
        .map((kind) => (
          <div
            key={kind}
            data-surface={kind}
            className="flex flex-wrap items-start gap-block-gap overflow-x-auto p-text-gap"
          >
            {states
              .filter((state) => isOn(state, kind))
              .map((state) => (
                <StateView key={state.name} state={state} />
              ))}
          </div>
        ))}
    </article>
  );
}

export function LabSectionView({ entry }: { entry: LabEntry }) {
  return (
    <article id={entry.id.toLowerCase()}>
      <div className={`${LAB_COLUMN} flex flex-col gap-space-8 py-block-gap`}>
        <h3 className="m-0">{entry.id}</h3>
        <p className="m-0 type-mono text-muted">
          {entry.states.map(stateLine).join(', ')} · {entry.source}
        </p>
      </div>
      {entry.states.map((state) => (
        <Fragment key={state.name}>{state.render()}</Fragment>
      ))}
    </article>
  );
}

// One registry entry: each state on each surface it matters on, then its names and source. A section
// draws edge to edge, exactly as on the landing page, with its names in the column under it.
import { Fragment } from 'react';
import { Mono } from '../components/ui/Mono.tsx';
import type { LabEntry, LabState } from './registry.tsx';

/** The site's reading column, which the lab's own words sit in. */
export const LAB_COLUMN = 'mx-auto max-w-content-width px-block-gap';

const stateLine = (state: LabState) =>
  state.figmaNode ? `${state.name} · ${state.figmaName} ${state.figmaNode}` : state.name;

function StateView({ state }: { state: LabState }) {
  return (
    <div className={`flex flex-col items-start gap-text-gap ${state.wide ? 'w-full' : ''}`}>
      <Mono tone="muted">{stateLine(state)}</Mono>
      {state.render()}
    </div>
  );
}

export function LabEntryView({ entry }: { entry: LabEntry }) {
  return (
    <article id={entry.id.toLowerCase()} className="flex flex-col gap-text-gap">
      {(entry.surfaces ?? ['ground']).map((kind) => (
        <div
          key={kind}
          data-surface={kind}
          className="flex flex-wrap items-start gap-block-gap overflow-x-auto border border-hairline p-block-gap"
        >
          {entry.states.map((state) => (
            <StateView key={state.name} state={state} />
          ))}
        </div>
      ))}
      <h3>{entry.id}</h3>
      <p className="type-mono text-muted">
        {entry.figmaNode
          ? `${entry.figmaName} ${entry.figmaNode}`
          : entry.states.some((s) => s.figmaNode)
            ? 'In Figma, state by state'
            : 'Not in Figma yet'}{' '}
        · {entry.source}
      </p>
    </article>
  );
}

export function LabSectionView({ entry }: { entry: LabEntry }) {
  return (
    <article id={entry.id.toLowerCase()}>
      {entry.states.map((state) => (
        <Fragment key={state.name}>{state.render()}</Fragment>
      ))}
      <div className={LAB_COLUMN}>
        <h3>{entry.id}</h3>
        <p className="type-mono text-muted">
          {entry.states.map(stateLine).join(', ')} · {entry.source}
        </p>
      </div>
    </article>
  );
}

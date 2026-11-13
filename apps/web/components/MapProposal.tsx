// A proposal pressed on the map, in the map's Information box (lib/proposal-view.ts), saying what it is about: its
// title, then what kind it is, how it ended and when, who proposed it, how its voters voted, quiet in mono;
// its own words, the first lines until pressed; and its link, said for what it is, with the outside source's
// arrow. Props only.
import { useState } from 'react';
import type { ProposalView } from '../lib/proposal-view.ts';
import { Icon } from './ui/Icon.tsx';
import { LineRow } from './ui/LineRow.tsx';
import { Mono } from './ui/Mono.tsx';
import { TextLink } from './ui/TextLink.tsx';

export function MapProposal({ view }: { view: ProposalView }) {
  const [whole, setWhole] = useState(false);
  return (
    <div className="flex flex-col gap-space-4">
      <span className="type-ui text-primary wrap-anywhere">{view.title}</span>
      <Mono as="span" tone="muted">
        {view.facts}
      </Mono>
      {view.who && (
        <Mono as="span" tone="muted">
          {view.who}
        </Mono>
      )}
      <Mono as="span" tone="muted">
        {view.votes}
      </Mono>
      {view.words && (
        // a proposal's text can be long: its first lines, all of it when pressed
        <LineRow expanded={whole} onClick={() => setWhole((now) => !now)}>
          <span
            className={`type-ui whitespace-pre-line wrap-anywhere ${whole ? '' : 'line-clamp-4'}`}
          >
            {view.words}
          </span>
        </LineRow>
      )}
      {view.link && (
        <TextLink href={view.link.url} rel="noreferrer" target="_blank" variant="mono">
          {view.link.label} <Icon name="outside" />
        </TextLink>
      )}
    </div>
  );
}

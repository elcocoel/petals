'use client';
// The hero story with its review controls, for the lab only (HERO ART's V2): the same hero as the landing's,
// one layer at a time if asked (all, the words, the petals), and each beat's editorial note under it.
import { useState } from 'react';
import { HeroStoryView, type StoryLayer } from '../../components/landing/HeroStory.tsx';
import { Button } from '../../components/ui/Button.tsx';
import { Mono } from '../../components/ui/Mono.tsx';
import { Section } from '../../components/ui/Section.tsx';
import { landingCopy } from '../../lib/landing-copy.ts';
import { useHeroStory } from '../../viewmodels/useHeroStory.ts';
import { storyNotes } from './notes.ts';

const LAYERS: readonly { id: StoryLayer; label: string }[] = [
  { id: 'all', label: 'All layers' },
  { id: 'words', label: 'Words' },
  { id: 'petals', label: 'Petals' },
];

export function HeroStoryLab() {
  const clock = useHeroStory<HTMLDivElement>(landingCopy.heroStory.beats.length);
  const [layer, setLayer] = useState<StoryLayer>('all');
  const note = storyNotes[clock.beat] ?? storyNotes[0];
  return (
    <>
      <HeroStoryView clock={clock} layer={layer} />
      <Section rule="top" padding="bar">
        <div className="flex flex-col gap-block-gap">
          <div className="flex flex-wrap gap-space-8">
            {LAYERS.map((l) => (
              <Button
                key={l.id}
                variant="pill"
                pressed={layer === l.id}
                onClick={() => setLayer(l.id)}
              >
                {l.label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-block-gap md:grid-cols-2">
            <div>
              <Mono>{`0${clock.beat + 1} / 06 · ${note.title}`}</Mono>
              <p className="mt-space-8 mb-0 type-caption">{note.note}</p>
            </div>
            <div>
              <Mono>The feeling</Mono>
              <p className="mt-space-8 mb-0 type-caption">{note.feeling}</p>
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}

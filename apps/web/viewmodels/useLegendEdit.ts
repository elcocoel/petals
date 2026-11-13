// The legend's hands on /make: Settings' own, so a choice in the legend changes
// the person's view at once, everywhere, as a choice in Settings does (usePersonView keeps it, one source).
// The row whose choices are open is the legend's own, so opening one doesn't open Settings' too.
import { type ColourKey, colourKeysOf, type Dimension, withColourKeys } from '@petal/core/view';
import { useCallback, useState } from 'react';
import { CHOOSABLE, DEFAULT_PERSON_VIEW } from '../lib/person-view.ts';
import { isDefault, type LegendEdit, type Scale, withData, withScale } from '../lib/view-edit.ts';
import { usePersonView } from './usePersonView.ts';

export function useLegendEdit(): LegendEdit {
  const person = usePersonView();
  const [open, setOpen] = useState<Dimension | null>(null);
  // the row last changed, said while the map is drawn again in it
  const [changed, setChanged] = useState<Dimension | null>(null);
  // why the last change wasn't saved: a refused save leaves the view as it was, and Tools says why
  const [failed, setFailed] = useState<string | null>(null);
  const defaults = DEFAULT_PERSON_VIEW.view;
  const refused = useCallback(
    (e: unknown) => setFailed(e instanceof Error ? e.message : String(e)),
    [],
  );
  const keep = useCallback(
    (next: Parameters<typeof person.save>[0]) => {
      setFailed(null);
      person.save(next).catch(refused);
    },
    [person, refused],
  );
  return {
    defaults,
    choices: person.choices,
    open,
    onOpen: (d: Dimension) => setOpen((now) => (now === d ? null : d)),
    onPick: (d: Dimension, data: string | null) => {
      setChanged(d);
      keep(withData(person.view, d, data, CHOOSABLE, defaults));
    },
    onScale: (d: Dimension, scale: Scale) => {
      setChanged(d);
      keep(withScale(person.view, d, scale));
    },
    drawing: person.busy ? changed : null,
    // a value's colour, chosen by hand: the view becomes v3 while any is chosen (core's withColourKeys)
    colourKeys: colourKeysOf(person.view),
    onKey: (value: string, key: string | null) => {
      setChanged('colour');
      const now: Record<string, ColourKey> = { ...colourKeysOf(person.view) };
      if (key) now[value] = key as ColourKey;
      else delete now[value];
      keep(withColourKeys(person.view, now));
    },
    // usePersonView's reset, as Settings', a reset to the defaults kept at hand
    onReset: isDefault(person.view, defaults)
      ? undefined
      : () => {
          setFailed(null);
          person.reset().catch(refused);
        },
    failed,
  };
}

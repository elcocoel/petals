// The browser's half of the one place the person's view is read (coordinator/one-source.md, step 3; the
// server's half is lib/viewer-view.ts). The root layout reads it on the server and seeds the provider
// (app/PersonView.tsx), so nothing flashes in the default first; every live flower and picture the browser
// draws takes it from here. Saving keeps it on the server, redraws the live flowers at once, and asks the
// server-built pages (their tiles and pictures) again without a reload. A visitor's is kept too, by its hash,
// the hash in their browser (lib/visitor-view.ts; Elco's walk 3).

import type { View } from '@petal/core/types';
import { DEFAULT_VIEW } from '@petal/core/view';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useMemo, useState, useTransition } from 'react';
import { keepView, SignInFirst, saveView } from '../lib/agent-client.ts';
import {
  DEFAULT_PERSON_VIEW,
  type PersonView,
  type ViewChoices,
  viewChoices,
} from '../lib/person-view.ts';
import { visitorViewCookie } from '../lib/visitor-view.ts';

export interface PersonViewState extends PersonView {
  /** for each dimension, the data that fits it */
  choices: ViewChoices;
  /** Keeps this view for the person. Throws with the server's reason when it's refused. */
  save: (view: View) => Promise<void>;
  /** Puts the default back. */
  reset: () => Promise<void>;
  /**
   * A change is on its way: from the press until the server has read the pages again in it (Elco, 12 Nov, wave 3:
   * "some form of visual feedback that something is being updated in the back").
   */
  busy: boolean;
}

export const PersonViewContext = createContext<PersonViewState | null>(null);

/** The person's view, wherever a petal is drawn. The root layout holds it for every page. */
export function usePersonView(): PersonViewState {
  const state = useContext(PersonViewContext);
  if (!state)
    throw new Error('usePersonView: no PersonViewProvider above (app/layout.tsx holds it)');
  return state;
}

/** The provider's own: the view the server read for this page, and what a save changes. */
export function usePersonViewState(initial: PersonView): PersonViewState {
  const router = useRouter();
  const [person, setPerson] = useState(initial);
  // The server read it again (a refresh after a save, or another page's): its answer wins.
  const [read, setRead] = useState(initial.hash);
  if (initial.hash !== read) {
    setRead(initial.hash);
    setPerson(initial);
  }
  const [saving, setSaving] = useState(false);
  // the server's pages read again in the new view: pending until they're back
  const [refreshing, startRefresh] = useTransition();
  const save = useCallback(
    async (view: View) => {
      setSaving(true);
      try {
        let kept: PersonView;
        try {
          // the person's own, on the server; a visitor's browser has nothing more to keep
          kept = await saveView(view);
          document.cookie = visitorViewCookie(null);
        } catch (e) {
          if (!(e instanceof SignInFirst)) throw e;
          // a visitor's (Elco's walk 3): kept by its hash, the hash in their browser, the default forgotten
          kept = await keepView(view);
          document.cookie = visitorViewCookie(
            kept.hash === DEFAULT_PERSON_VIEW.hash ? null : kept.hash,
          );
        }
        setPerson(kept);
        startRefresh(() => router.refresh());
      } finally {
        setSaving(false);
      }
    },
    [router],
  );
  const reset = useCallback(() => save(DEFAULT_VIEW), [save]);
  const choices = useMemo(() => viewChoices(), []);
  const busy = saving || refreshing;
  return useMemo(
    () => ({ ...person, choices, save, reset, busy }),
    [person, choices, save, reset, busy],
  );
}

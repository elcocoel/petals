'use client';
// Holds the person's view for every page (viewmodels/usePersonView.ts), seeded by the root layout's read.
import type { ReactNode } from 'react';
import type { PersonView } from '../lib/person-view.ts';
import { PersonViewContext, usePersonViewState } from '../viewmodels/usePersonView.ts';

export function PersonViewProvider({
  initial,
  children,
}: {
  initial: PersonView;
  children: ReactNode;
}) {
  return (
    <PersonViewContext.Provider value={usePersonViewState(initial)}>
      {children}
    </PersonViewContext.Provider>
  );
}

// Server only. The one place a page reads whose view it draws with (coordinator/one-source.md, step 3):
// the person's own, from the server with their cookie, or the default the server gives a visitor. Every
// page built on the server (the flower and map pages, the lists, the landing, the root layout that seeds
// the browser's copy) asks here, so one person's change shows on every page they open.
import { api } from './api.ts';
import { DEFAULT_PERSON_VIEW, type PersonView } from './person-view.ts';
import { requestCookie } from './visitor.ts';

/** When the server can't answer, there's no view of theirs to draw with, and the default is what anyone sees. */
export async function viewerView(): Promise<PersonView> {
  const res = await api<PersonView>('/api/v1/me/view', { cookie: await requestCookie() });
  return res.ok ? res.value : DEFAULT_PERSON_VIEW;
}

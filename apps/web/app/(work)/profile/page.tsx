// The profile page (#79, the investigator's card): a person's own, like the lobby (memory: personal pages
// need sign-in). Nobody signed in goes to the front page, asked here before anything is drawn, so a visitor
// never sees it.
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { api } from '../../../lib/api.ts';
import { ProfileSurface } from './ProfileSurface.tsx';

export const dynamic = 'force-dynamic';

export default async function ProfileRoute() {
  // /api/v1/me answers only for a person with a wallet; an anonymous session or no answer is nobody
  const me = await api<{ person_id: string }>('/api/v1/me', {
    cookie: (await headers()).get('cookie'),
  });
  if (!me.ok) redirect('/');
  return <ProfileSurface />;
}

// A bare test tool, not product: a page that follows an exploration while someone talks to their own
// agent elsewhere (T402). It's unlinked and hidden unless PETAL_LAB=1. The real surface is designed
// separately. The token is a credential in a URL, so this page sends no referrer.
import { notFound } from 'next/navigation';
import { Follow } from './Follow.tsx';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Follow test',
  robots: { index: false },
  referrer: 'no-referrer' as const,
};

export default async function FollowTestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.PETAL_LAB !== '1') notFound();
  const { t } = await searchParams;
  return <Follow token={typeof t === 'string' ? t : ''} />;
}

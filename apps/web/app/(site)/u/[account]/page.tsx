// A person's public profile, by any one of their accounts (GET /api/v1/profiles/:account): the one profile,
// the same as NEAR Social's, or what they set on Petals; and their contribution to the map (GET
// /api/v1/credit/:account), so who added what shows to anyone. No sign-in; the lobby stays the person's own.
import type { Credit } from '@petal/core';
import type { Metadata } from 'next';
import { PublicProfile } from '../../../../components/workspace/PublicProfile.tsx';
import { api } from '../../../../lib/api.ts';
import {
  contributionView,
  creditAuthor,
  publicContributionWords,
} from '../../../../lib/contribution-view.ts';
import type { PublicProfileAnswer } from '../../../../lib/lobby-view.ts';
import { publicProfileWords } from '../../../../lib/lobby-view.ts';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ account: string }> };

const read = async (account: string) =>
  api<PublicProfileAnswer>(`/api/v1/profiles/${encodeURIComponent(account)}`);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { account } = await params;
  const res = await read(decodeURIComponent(account));
  const name = res.ok ? res.value.profile?.name : null;
  return { title: `${name ?? publicProfileWords.page} · Petals` };
}

export default async function PublicProfilePage({ params }: Params) {
  const { account } = await params;
  const res = await read(decodeURIComponent(account));
  if (!res.ok) return <p>{publicProfileWords.none}</p>;
  // their contribution, as the shared map counts it for the wallet that signs their publications
  const author = creditAuthor(res.value.chain, res.value.account);
  const credit = await api<Credit>(`/api/v1/credit/${encodeURIComponent(author)}`);
  return (
    <PublicProfile
      answer={res.value}
      {...(credit.ok && credit.value.totals
        ? { contribution: contributionView(credit.value, publicContributionWords) }
        : {})}
    />
  );
}

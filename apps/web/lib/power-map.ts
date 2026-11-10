// The Power Map on the landing (Elco, 9 Nov: "instead of these shitty place holders let's see how to put the
// actual map here - research yesterday grabbed data for SEVERAL DAOs"). Real readings from the night's
// mapping run (research/mapping-run-2026-11-09/INDEX.md), each a saved view on the server. A view's spec is
// content-addressed, so a drawing never changes and is cached for good. A view the server can't draw is left
// out. Titles and counts are the run's own.
import type { Spec } from '@petal/core/types';
import { forever } from './api.ts';
import { decodeDraft } from './draft.ts';
import type { Rendered } from './flower-data.ts';

export interface PowerMapView {
  sha: string;
  title: string;
  where: string;
  badge: string;
}

export const POWER_MAP: readonly PowerMapView[] = [
  {
    sha: '37def7bc0670b27a8d5145cdcef00eea579539ca07fd485bb582b4abffe6e49f',
    title: 'NEAR validators',
    where: '371 validators',
    badge: 'NEAR',
  },
  {
    sha: 'adbe90223b1db8f3476514d87027266196752759837b8948e586d15857f0cfd3',
    title: 'NEAR House of Stake',
    where: '507 veNEAR accounts',
    badge: 'NEAR',
  },
  {
    sha: '3e4bf8dba273d73fe1ce9061fc9fe6f15fe9c024d7a175357924c8bbf5ce3cac',
    title: 'ENS delegates',
    where: '8,561 delegates',
    badge: 'Ethereum',
  },
  {
    sha: '5ea0a48c55ae0b33057aaa77855dd5d27e70492bc0c926ef8e020dd1472edefb',
    title: 'Uniswap delegates',
    where: '21,919 delegates',
    badge: 'Ethereum',
  },
  {
    sha: '6c2bb46decd6c8a0d48a0efd5ea7ddd8f612a303799380eca131fb00bb6f98d5',
    title: 'Compound delegates',
    where: '4,283 delegates',
    badge: 'Ethereum',
  },
  {
    sha: 'dce5fa4984305c6a45335d8d42cd8562654fc026a72bcbb9c4918221306e91ab',
    title: 'Beanstalk, block 14,602,790',
    where: '2,036 voters',
    badge: 'Ethereum',
  },
  {
    sha: '78467e34ff252b1871a74706516bac0fb71fcfa3309b3f75db7f1bb64ad3250f',
    title: 'RaidGuild',
    where: '158 members',
    badge: 'Gnosis',
  },
  {
    sha: '0d19511cccd6601d059edca1d082fcf004cf8fed030f8f6e49b04cd47ef483fa',
    title: 'MetaCartel',
    where: '86 members',
    badge: 'Ethereum',
  },
  {
    sha: '0315b4b810fb5b5ebde03cdde4fb7b55d0f503bb2ebdc9ebb7d16641475c43ba',
    title: 'Jito',
    where: '89,708 holders',
    badge: 'Solana',
  },
];

export interface PowerMapTile extends PowerMapView {
  image: string;
  href: string;
}

async function viewSpec(sha: string): Promise<Spec | null> {
  const location = (await forever(`/d/${sha}`, { redirect: 'manual' }))?.headers.get('location');
  const param = location ? new URL(location, 'http://view').searchParams.get('spec') : null;
  const decoded = param ? decodeDraft(param) : null;
  return decoded?.ok ? decoded.spec : null;
}

async function draw(spec: Spec): Promise<string | null> {
  const res = await forever('/api/v1/render', { body: { spec, include_svg: true } });
  if (!res?.ok) return null;
  return ((await res.json()) as Rendered).svg || null;
}

async function tile(view: PowerMapView): Promise<PowerMapTile | null> {
  try {
    const spec = await viewSpec(view.sha);
    const svg = spec && (await draw(spec));
    if (!svg) return null;
    const image = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
    return { ...view, image, href: `/d/${view.sha}` };
  } catch {
    return null;
  }
}

export async function powerMapTiles(): Promise<PowerMapTile[]> {
  const tiles = await Promise.all(POWER_MAP.map(tile));
  return tiles.filter((t): t is PowerMapTile => t !== null);
}

// A bare test tool, not product: before Petals writes anyone's public profile on
// NEAR Social, prove on testnet what a real wallet does with its two kinds of write. Unlinked, and hidden
// unless PETAL_LAB=1. Writes go to the tester's own testnet account; nothing touches mainnet.
import { notFound } from 'next/navigation';
import { SocialProbe } from './SocialProbe.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'NEAR Social write test', robots: { index: false } };

export default function SocialTestPage() {
  if (process.env.PETAL_LAB !== '1') notFound();
  return <SocialProbe />;
}

// A bare test tool, not product: a real wallet signature through the sign-in routes (T192). It's
// unlinked and hidden unless PETAL_LAB=1. Surfaces for signing in are designed separately.
import { notFound } from 'next/navigation';
import { WalletProof } from './WalletProof.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Wallet test', robots: { index: false } };

export default function WalletTestPage() {
  if (process.env.PETAL_LAB !== '1') notFound();
  return <WalletProof />;
}

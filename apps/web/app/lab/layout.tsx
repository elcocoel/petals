// The lab is for local work. On Vercel (the public site) every /lab page answers 404, whatever PETAL_LAB says;
// elsewhere each lab page keeps its own PETAL_LAB rule.
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

export default function LabLayout({ children }: { children: ReactNode }) {
  if (process.env.VERCEL) notFound();
  return children;
}

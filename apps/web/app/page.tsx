// The landing page. The Power Map in it reads its own data once it's near (components/landing/LandingMap.tsx).
// The conversation is at /make.
import { Landing } from '../components/landing/Landing.tsx';

export const dynamic = 'force-dynamic';

export default function Page() {
  return <Landing />;
}

// `/` shows the workspace until the landing page replaces this one file. Nothing else depends on it.
import MakeLayout from './make/layout.tsx';
import MakePage from './make/page.tsx';

export const dynamic = 'force-dynamic';

export default function Home(props: Parameters<typeof MakePage>[0]) {
  return (
    <MakeLayout>
      <MakePage {...props} />
    </MakeLayout>
  );
}

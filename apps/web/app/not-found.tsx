// The site's 404 (#78, 11 Nov): the bouncer (components/Oops.tsx), and the way back, home or the Power Map.
import { Oops } from '../components/Oops.tsx';
import { Button } from '../components/ui/Button.tsx';
import { oopsWords } from '../lib/oops-words.ts';
import { siteLinks } from '../lib/site-links.ts';

export const metadata = { title: 'Not here · Petals' };

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <Oops
        title={oopsWords.notFound.title}
        body={oopsWords.notFound.body}
        primary={
          <Button href={siteLinks.home} arrow>
            {oopsWords.home}
          </Button>
        }
        secondary={
          <Button href={siteLinks.map} variant="quiet">
            {oopsWords.map}
          </Button>
        }
      />
    </div>
  );
}

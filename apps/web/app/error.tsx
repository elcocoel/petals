'use client';
// A page that broke (#78, 11 Nov): the bouncer (components/Oops.tsx), Try again, which renders the page
// again, and the way back to the front page. Next.js hands it the error and the way to retry.
import { Oops } from '../components/Oops.tsx';
import { Button } from '../components/ui/Button.tsx';
import { oopsWords } from '../lib/oops-words.ts';
import { siteLinks } from '../lib/site-links.ts';

export default function PageError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Oops
        title={oopsWords.broke.title}
        body={oopsWords.broke.body}
        primary={<Button onClick={reset}>{oopsWords.broke.again}</Button>}
        secondary={
          <Button href={siteLinks.home} variant="quiet">
            {oopsWords.home}
          </Button>
        }
      />
    </div>
  );
}

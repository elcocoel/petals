'use client';
// The one Connect, in the nav and in the hero. For a visitor it is the primary button to their place; once they're
// connected it shows the connected account, shortened as the site shortens accounts, in the green button look, and
// leads to the same place. While the session is still being read it stays Connect, so a static page draws it at once.
import { shortId } from '../../lib/flower-view.ts';
import { siteLinks } from '../../lib/site-links.ts';
import { useConnected } from '../../viewmodels/useConnected.ts';
import { Button } from './Button.tsx';

/** The button for one state: connected as `account`, or not yet. Props only, so the lab can show both. */
export function ConnectButtonView({ label, account }: { label: string; account: string | null }) {
  return (
    <Button href={siteLinks.lobby} variant={account ? 'done' : 'primary'} arrow>
      {account ? shortId(account) : label}
    </Button>
  );
}

export function ConnectButton({ label }: { label: string }) {
  return <ConnectButtonView label={label} account={useConnected()} />;
}

// The Connect button's menu once someone is connected: whether it's open, and its three ways on, so a person can
// go in, switch wallets or disconnect from wherever the button is, without going into the app first. Switching
// leaves the account and opens the same NEAR wallet picker the landing's door opens, landing in the lobby; if
// the person closes the picker, the page reloads signed out. Disconnecting leaves the account and reloads the page,
// where the button is Connect again.
import { useState } from 'react';
import { sessionClient } from '../lib/agent-client.ts';
import { siteLinks } from '../lib/site-links.ts';
import { SIGN_IN_NETWORK, signPrepared } from '../lib/wallet.ts';
import { useConnected } from './useConnected.ts';
import { signIn } from './useSession.ts';

export function useConnectMenu() {
  const account = useConnected();
  const [open, setOpen] = useState(false);
  return {
    account,
    open,
    toggle: () => setOpen((on) => !on),
    close: () => setOpen(false),
    enter: () => window.location.assign(siteLinks.lobby),
    switchWallet: () => {
      let arrived = false;
      void sessionClient
        .logout()
        .then(() =>
          signIn({
            client: sessionClient,
            sign: (challenge) => signPrepared({ ...challenge, entry_sha256: '' }, SIGN_IN_NETWORK),
            arrived: () => {
              arrived = true;
              window.location.assign(siteLinks.lobby);
            },
            failed: (words) => console.warn(words),
          }),
        )
        .finally(() => {
          if (!arrived) window.location.reload();
        });
    },
    leave: () => {
      void sessionClient.logout().finally(() => window.location.reload());
    },
  };
}

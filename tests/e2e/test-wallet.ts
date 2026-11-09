// A near-connect sandbox wallet for tests. One fixed key per name, derived at run time the way
// implicitSigner(name) derives it, so the same name in a new browser is the same wallet. Its account is
// implicit: the hex of its public key, on any network. It signs with no prompt, and the network it's
// given changes nothing: a NEP-413 signature doesn't name one. The site asks near-connect for it through
// the `debug-wallets` entry in localStorage, the door near-connect keeps for a wallet in development.
// Since 9 Nov it also sends one NEAR transfer, on testnet only, for the pay step: the journey server signs
// and sends it (testnetTransfer), so the account must hold testnet NEAR. On mainnet it refuses.
import { createHash } from 'node:crypto';
import { implicitSigner } from '@petal/near/auth/testing';

/** Letters, digits and hyphens: a name goes into a URL and a script. */
export const WALLET_NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** What comes before a 32-byte ed25519 seed in PKCS#8, the form WebCrypto imports. */
const ED25519_PKCS8_PREFIX = '302e020100300506032b657004220420';

/** The script near-connect runs in its sandboxed iframe. */
export function walletScript(name: string, base = ''): string {
  if (!WALLET_NAME.test(name)) throw new Error(`not a wallet name: ${name}`);
  const { accountId, publicKey } = implicitSigner(name);
  const seed = createHash('sha256').update(`petal-test-signer:${name}`).digest();
  const pkcs8 = Buffer.concat([Buffer.from(ED25519_PKCS8_PREFIX, 'hex'), seed]).toString('base64');
  return `// Test wallet: ${name}. Its key is public, in effect: never send it anything.
const accountId = ${JSON.stringify(accountId)};
const publicKey = ${JSON.stringify(publicKey)};
const pkcs8 = Uint8Array.from(atob(${JSON.stringify(pkcs8)}), (c) => c.charCodeAt(0));

const u32 = (n) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
};
const text = (s) => {
  const b = new TextEncoder().encode(s);
  return [u32(b.length), b];
};

// NEP-413: sha256 of borsh(u32 2^31+413) and borsh({ message, nonce, recipient, callbackUrl: None }).
async function signNep413({ message, nonce, recipient }) {
  const parts = [u32(2147484061), ...text(message), Uint8Array.from(nonce), ...text(recipient), new Uint8Array([0])];
  const payload = new Uint8Array(await new Blob(parts).arrayBuffer());
  const hash = await crypto.subtle.digest('SHA-256', payload);
  const key = await crypto.subtle.importKey('pkcs8', pkcs8, 'Ed25519', false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('Ed25519', key, hash));
  return { accountId, publicKey, signature: btoa(String.fromCharCode(...signature)) };
}

window.selector.ready({
  async getAccounts() {
    return [{ accountId, publicKey }];
  },
  async signIn() {
    return [{ accountId, publicKey }];
  },
  async signInAndSignMessage({ messageParams }) {
    return [{ accountId, publicKey, signedMessage: await signNep413(messageParams) }];
  },
  async signMessage(params) {
    return signNep413(params);
  },
  // One transfer, on testnet only; the journey server signs and sends it, and answers as a wallet would.
  async signAndSendTransaction({ network, receiverId, actions }) {
    const res = await fetch(${JSON.stringify(`${base}/wallet/${name}/send`)}, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ network, receiverId, actions }),
    });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error || 'the test wallet could not send it');
    return out;
  },
  async signOut() {},
});
`;
}

const ICON = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="gray"/></svg>',
).toString('base64');

/**
 * One line for a browser's console: lists these wallets in near-connect's picker, on mainnet and on
 * testnet alike, and reloads, because a page keeps its connector once it has made one.
 */
export function seedSnippet(base: string, names: string[]): string {
  const list = names.map((n) => `'${n}'`).join(',');
  return (
    `localStorage.setItem('debug-wallets',JSON.stringify([${list}].map(n=>({` +
    `id:'test-wallet-'+n,name:'Test wallet: '+n,icon:'data:image/svg+xml;base64,${ICON}',` +
    `website:'${base}',version:'1.0.0',executor:'${base}/wallet/'+n+'.js',type:'sandbox',` +
    'features:{signMessage:true,signInAndSignMessage:true,signAndSendTransaction:true,testnet:true},permissions:{}' +
    '}))));location.reload()'
  );
}

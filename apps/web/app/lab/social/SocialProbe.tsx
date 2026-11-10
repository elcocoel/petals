'use client';
// What a real wallet does with NEAR Social's two kinds of write, on testnet (Elco, 10 Nov, choice A). The
// writes go to the tester's own testnet account, which, like `social` on mainnet, has no contract, so the
// receipt fails with CodeDoesNotExist as expected. After each one the page reads back from NEAR what
// arrived and compares it with what it sent: for the text, the same JSON; for the picture, the same bytes.
// A check runs when it's pressed; nothing here waits on a timer.
import { useState } from 'react';
import { Button } from '../../../components/ui/Button.tsx';
import {
  base64Of,
  FASTFS_METHOD,
  fastfsSimple,
  KV_METHOD,
  WRITE_GAS,
} from '../../../lib/near-social.ts';
import { sentBy } from '../../../lib/pay.ts';
import { callFunction, connectWallet } from '../../../lib/wallet.ts';

const RPC = 'https://archival-rpc.testnet.fastnear.com';
const KV = 'https://kv.test.fastnear.com';
const EXPLORER_API = 'https://api-testnet.nearblocks.io/v3';
const EXPLORER = 'https://testnet.nearblocks.io/txns/';
const TEXT_KEY = 'petals-probe/text';

interface Result {
  wallet: string;
  hash: string | null;
  arrived: string | null;
  receipt: string | null;
  indexed: string | null;
}

const empty: Result = { wallet: '', hash: null, arrived: null, receipt: null, indexed: null };

async function rpc(method: string, params: unknown) {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'petals', method, params }),
  });
  return (await r.json()) as { result?: unknown; error?: unknown };
}

/** The account's newest transaction, when the wallet named none. */
async function newestTx(account: string): Promise<string | null> {
  const r = await fetch(`${EXPLORER_API}/accounts/${encodeURIComponent(account)}/txns?per_page=1`);
  const j = (await r.json().catch(() => null)) as { data?: { transaction_hash?: string }[] } | null;
  return j?.data?.[0]?.transaction_hash ?? null;
}

/** What NEAR holds for the transaction: the args its call carried, and how its receipts ended. */
async function onChain(hash: string, account: string) {
  const { result, error } = await rpc('tx', {
    tx_hash: hash,
    sender_account_id: account,
    wait_until: 'FINAL',
  });
  if (!result) return { args: null, receipt: `NEAR didn't answer: ${JSON.stringify(error)}` };
  const r = result as {
    transaction?: { actions?: { FunctionCall?: { args?: string } }[] };
    receipts_outcome?: { outcome?: { status?: unknown } }[];
  };
  const args = r.transaction?.actions?.[0]?.FunctionCall?.args ?? null;
  const statuses = (r.receipts_outcome ?? []).map((o) => JSON.stringify(o.outcome?.status));
  const failed = statuses.find((s) => s.includes('Failure'));
  return {
    args,
    receipt: failed
      ? failed.includes('CodeDoesNotExist')
        ? 'failed with CodeDoesNotExist, as expected (no contract runs)'
        : `failed otherwise: ${failed}`
      : 'succeeded',
  };
}

async function kvHas(account: string, value: string): Promise<string> {
  const r = await fetch(
    `${KV}/v0/latest/${encodeURIComponent(account)}/${encodeURIComponent(account)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: TEXT_KEY, limit: 1 }),
    },
  );
  const j = (await r.json().catch(() => null)) as { entries?: { value?: unknown }[] } | null;
  const got = j?.entries?.[0]?.value;
  if (got === undefined) return 'not yet';
  return got === value ? 'yes, the same text' : `a different value: ${JSON.stringify(got)}`;
}

const message = (e: unknown) => (e instanceof Error ? e.message : JSON.stringify(e));
const hashIn = (s: string) => /\b[1-9A-HJ-NP-Za-km-z]{43,44}\b/.exec(s)?.[0] ?? null;

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A 16 by 16 picture in the accent colour, as PNG bytes. */
async function tinyPicture(): Promise<Uint8Array<ArrayBuffer>> {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const g = c.getContext('2d');
  if (!g) throw new Error('No canvas here.');
  g.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  g.fillRect(0, 0, 16, 16);
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'));
  if (!blob) throw new Error('The picture could not be made.');
  return new Uint8Array(await blob.arrayBuffer());
}

export function SocialProbe() {
  const [account, setAccount] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [text, setText] = useState<Result>(empty);
  const [textValue, setTextValue] = useState<string | null>(null);
  const [picture, setPicture] = useState<Result>(empty);
  const [busy, setBusy] = useState(false);

  async function connect() {
    setProblem(null);
    try {
      setAccount(await connectWallet('testnet'));
    } catch (e) {
      setProblem(message(e));
    }
  }

  /** Sends one call and reads back what arrived. `same` says whether the arrived args match. */
  async function send(
    methodName: string,
    args: object | Uint8Array,
    same: (arrivedBase64: string) => boolean,
    set: (r: Result) => void,
  ) {
    if (!account) return;
    setBusy(true);
    const r: Result = { ...empty, wallet: 'waiting for your wallet…' };
    set(r);
    try {
      const outcome = await callFunction('testnet', account, methodName, args, WRITE_GAS);
      r.wallet = 'answered: sent';
      r.hash = sentBy(outcome)?.hash ?? null;
    } catch (e) {
      r.wallet = `answered with an error: ${message(e)}`;
      r.hash = hashIn(message(e));
    }
    if (!r.hash) r.hash = await newestTx(account).catch(() => null);
    set({ ...r });
    if (r.hash) {
      const chain = await onChain(r.hash, account).catch((e) => ({
        args: null,
        receipt: message(e),
      }));
      r.receipt = chain.receipt;
      r.arrived =
        chain.args === null
          ? 'not read'
          : same(chain.args)
            ? 'the same as what was sent'
            : `different from what was sent: ${chain.args.slice(0, 120)}`;
    }
    set({ ...r });
    setBusy(false);
  }

  async function writeText() {
    const value = `Petals test, ${new Date().toISOString()}`;
    setTextValue(value);
    const args = { [TEXT_KEY]: value };
    await send(
      KV_METHOD,
      args,
      (b64) => {
        try {
          return JSON.stringify(JSON.parse(atob(b64))) === JSON.stringify(args);
        } catch {
          return false;
        }
      },
      setText,
    );
  }

  async function checkText() {
    if (!account || !textValue) return;
    const indexed = await kvHas(account, textValue).catch((e) => message(e));
    setText((t) => ({ ...t, indexed }));
  }

  async function writePicture() {
    const bytes = await tinyPicture();
    const payload = fastfsSimple(`media/${await sha256Hex(bytes)}.png`, 'image/png', bytes);
    const sent = base64Of(payload);
    await send(FASTFS_METHOD, payload, (b64) => b64 === sent, setPicture);
  }

  const results = { account, text, picture };
  return (
    <main className="flex max-w-prose flex-col gap-block-gap p-column-gap">
      <h1 className="m-0 type-heading">NEAR Social write test, on testnet</h1>
      <p className="my-0 type-body">
        Two writes to your own testnet account, nothing on mainnet. Each asks your wallet once.
      </p>
      {!account ? (
        <div>
          <Button onClick={() => void connect()}>Connect a testnet wallet</Button>
        </div>
      ) : (
        <p className="my-0 type-label">Connected: {account}</p>
      )}
      {problem && <p className="my-0 type-caption">{problem}</p>}
      <section className="flex flex-col gap-text-gap">
        <h2 className="m-0 type-label">1. A line of text</h2>
        <div>
          <Button variant="secondary" disabled={!account || busy} onClick={() => void writeText()}>
            Write a line of text
          </Button>
        </div>
        <Readout r={text} />
        {text.hash && (
          <div className="flex items-center gap-text-gap">
            <Button variant="quiet" onClick={() => void checkText()}>
              Check FastData has it
            </Button>
            {text.indexed && <span className="type-caption">FastData: {text.indexed}</span>}
          </div>
        )}
      </section>
      <section className="flex flex-col gap-text-gap">
        <h2 className="m-0 type-label">2. A tiny picture</h2>
        <div>
          <Button
            variant="secondary"
            disabled={!account || busy}
            onClick={() => void writePicture()}
          >
            Write a tiny picture
          </Button>
        </div>
        <Readout r={picture} />
      </section>
      <div>
        <Button
          variant="quiet"
          onClick={() => void navigator.clipboard.writeText(JSON.stringify(results, null, 2))}
        >
          Copy the results
        </Button>
      </div>
    </main>
  );
}

function Readout({ r }: { r: Result }) {
  if (!r.wallet) return null;
  return (
    <ul className="m-0 flex list-none flex-col gap-space-4 p-0 type-caption">
      <li>Your wallet {r.wallet}</li>
      {r.hash && (
        <li>
          Transaction:{' '}
          <a href={`${EXPLORER}${r.hash}`} target="_blank" rel="noopener">
            {r.hash}
          </a>
        </li>
      )}
      {r.arrived && <li>What reached NEAR: {r.arrived}</li>}
      {r.receipt && <li>Its receipt: {r.receipt}</li>}
    </ul>
  );
}

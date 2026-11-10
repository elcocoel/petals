// Paying for Petals' own agent (9 Nov; specs/003-target/proposal-payment.md).
//   GET  /api/v1/pay   where to send NEAR, on the network the person signed in on, and NEAR's price now
//   POST /api/v1/pay   {network, account_id, tx_hash}: the server reads that transaction on chain, and a
//                      successful NEAR transfer from one of this person's wallets to Petals' account goes
//                      onto their credit, in dollars at NEAR's price now, once however often it's sent
//
// The server holds no key: Petals' account is Elco's, and the server only reads the chain. Each turn of the
// agent then draws the credit down by what NEAR AI charged (invites.ts, personLedger).
//
// A public site counts mainnet NEAR only. Testnet NEAR is free, and NEAR AI bills real dollars, so on the
// live site a testnet payment would spend Elco's money. A site that isn't public (a lane, the journey
// server) takes testnet too, so the pay step can be walked for nothing.
//
// With the credit contract (credit.ts; Elco, 9 Nov), the person deposits into it instead: GET says the
// contract and `method: "deposit"`, and POST, sent after a deposit or a withdrawal, checks that transaction
// and sets the person's credit to what the wallet they signed in with holds in the contract now.
import type { Price } from '@petal/core';
import { TOOLS_VERSION } from '@petal/core';
import {
  type DepositDeps,
  depositQuote,
  nearUsd,
  PAY_RECEIVER,
  payTokens,
  readTransfer,
  swapStatus,
  type Transfer,
  TX_HASH,
  yoctoToNear,
} from '@petal/near/pay';
import type { Store } from '@petal/store';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { Network, RouteAuth } from './auth-routes.ts';
import { type CreditChain, chainChat } from './credit.ts';
import { payPerson, personCredit } from './invites.ts';
import { chargePetals, PRICE } from './price.ts';
import { fail } from './routes.ts';

export interface PayDeps {
  store: Store;
  gate: RouteAuth;
  /** what Petals charges at (price/v1); default price.json */
  price?: Price;
  /** NEAR Intents' 1Click, for a top-up from any token on any chain; tests give a fake fetch */
  oneClick?: DepositDeps;
  /** the transfer as the chain shows it; default readTransfer on the public RPC */
  readTransfer?: (network: Network, txHash: string, sender: string) => Promise<Transfer>;
  /** dollars per NEAR now; default NEAR Intents' token list */
  nearUsd?: () => Promise<number | null>;
  /** where a chat on the person's own credit stops, as /api/v1/me says it */
  usdPerChat: number;
  /** a public site (Config.public): only mainnet NEAR counts */
  mainnetOnly: boolean;
  /** the credit contract; none: plain transfers to Petals' account */
  credit?: CreditChain | null;
  clock?: () => number;
}

const NEAR_ACCOUNT = /^[a-z0-9._-]{2,64}$/;

export function payRoutes(d: PayDeps): Hono {
  const read = d.readTransfer ?? ((network, hash, sender) => readTransfer(network, hash, sender));
  const price = d.nearUsd ?? (() => nearUsd({ onWarning: (m) => console.warn(`petal: ${m}`) }));
  const clock = d.clock ?? Date.now;
  const ok = (c: Context, body: Record<string, unknown>) =>
    c.json({ ...body, tools_version: TOOLS_VERSION });
  const app = new Hono();

  app.use('/api/v1/pay', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });

  app.get('/api/v1/pay', async (c) => {
    const chain = d.credit;
    if (chain) {
      const { network, contract } = chain.contract;
      const near_usd = await price();
      // signed in on this network: their balance in the contract, read now
      const me = await d.gate.personOf(c);
      let credit: Record<string, unknown> | null = null;
      if (me?.account && me.network === network && near_usd !== null) {
        const now = () => new Date(clock());
        const synced = await chainChat(d.store, chain, me.person, me.account, near_usd, now).catch(
          () => null,
        );
        if (synced) {
          credit = {
            ...synced.credit,
            usd_per_chat: d.usdPerChat,
            balance_yocto: synced.yocto.toString(),
          };
        }
      }
      return ok(c, { network, receiver: contract, method: 'deposit', near_usd, credit });
    }
    const signedIn = d.mainnetOnly ? null : (await d.gate.personOf(c))?.network;
    const network: Network = signedIn ?? 'mainnet';
    return ok(c, {
      network,
      receiver: PAY_RECEIVER[network],
      method: null,
      near_usd: await price(),
    });
  });

  app.post(
    '/api/v1/pay',
    bodyLimit({
      maxSize: 16 * 1024,
      onError: (c) => fail(c, 'bad_input', 'the body is larger than 16 KiB'),
    }),
    async (c) => {
      const foreign = d.gate.refuseForeign(c);
      if (foreign) return foreign;
      const me = await d.gate.personOf(c);
      if (!me) return fail(c, 'unauthorised', 'Sign in with your wallet first.');
      const body = (await c.req.json().catch(() => null)) as {
        network?: unknown;
        account_id?: unknown;
        tx_hash?: unknown;
      } | null;
      const { network, account_id, tx_hash } = body ?? {};
      if (d.mainnetOnly && me.network !== 'mainnet') {
        return fail(c, 'bad_input', 'Only mainnet NEAR pays here: sign in with a mainnet wallet.');
      }
      if (network !== me.network) {
        return fail(c, 'bad_input', `network must be ${me.network}, the one you signed in on`);
      }
      if (typeof account_id !== 'string' || !NEAR_ACCOUNT.test(account_id)) {
        return fail(c, 'bad_input', 'account_id must be a NEAR account');
      }
      if (typeof tx_hash !== 'string' || !TX_HASH.test(tx_hash)) {
        return fail(c, 'bad_input', 'tx_hash must be a NEAR transaction hash');
      }
      if (!me.accounts.includes(account_id)) {
        return fail(c, 'unauthorised', `${account_id} isn't one of your wallets here.`);
      }
      if (d.credit) return contractPaid(c, d.credit, me, account_id, tx_hash);
      const receiver = PAY_RECEIVER[me.network];
      let t: Transfer;
      try {
        t = await read(me.network, tx_hash, account_id);
      } catch (e) {
        const code = (e as { code?: string }).code;
        const message = (e as Error).message;
        if (code === 'not_found') return fail(c, 'not_found', message);
        if (code === 'bad_input') return fail(c, 'bad_input', message);
        return fail(
          c,
          'source_failed',
          "Couldn't read the transaction on NEAR, so nothing changed. Send it again.",
        );
      }
      if (
        t.signer_id !== account_id ||
        t.receiver_id !== receiver ||
        !t.succeeded ||
        t.yocto === '0'
      ) {
        return fail(
          c,
          'bad_input',
          `That transaction isn't a successful NEAR transfer from ${account_id} to ${receiver}.`,
        );
      }
      const near_usd = await price();
      if (near_usd === null) {
        return fail(
          c,
          'source_failed',
          "Couldn't read NEAR's price, so nothing changed. Send it again.",
        );
      }
      const near = yoctoToNear(t.yocto);
      const usd = Math.round(near * near_usd * 1e6) / 1e6;
      const paid = await payPerson(d.store, me.person, {
        id: `paid:${me.network}:${t.tx_hash}`,
        usd,
        now: new Date(clock()),
      });
      // Petals' part of a top-up (price/v1's B), only when it's switched on, once per transfer
      const kept =
        paid.added_usd > 0
          ? await chargePetals(
              d.store,
              d.price ?? PRICE,
              me.person,
              { kind: 'top_up', usd: paid.added_usd },
              `${me.network}:${t.tx_hash}`,
              new Date(clock()).toISOString(),
            )
          : 0;
      const credit = kept ? ((await personCredit(d.store, me.person)) ?? paid.credit) : paid.credit;
      return ok(c, {
        added_usd: paid.added_usd,
        added_near: paid.added_usd > 0 ? near : 0,
        near_usd,
        ...(kept ? { petals_usd: kept } : {}),
        credit: { ...credit, usd_per_chat: d.usdPerChat },
      });
    },
  );

  /** A deposit or a withdrawal on the contract, read back, and the person's credit set to what they hold. */
  async function contractPaid(
    c: Context,
    chain: CreditChain,
    me: { person: string; network: Network; account: string | null },
    account: string,
    txHash: string,
  ) {
    const { network, contract } = chain.contract;
    if (me.network !== network) {
      return fail(
        c,
        'bad_input',
        `Credit here is on ${network}: sign in with a ${network} wallet.`,
      );
    }
    if (account !== me.account) {
      return fail(c, 'unauthorised', `${account} isn't the wallet you signed in with.`);
    }
    let t: Transfer;
    try {
      t = await read(network, txHash, account);
    } catch (e) {
      const code = (e as { code?: string }).code;
      const message = (e as Error).message;
      if (code === 'not_found') return fail(c, 'not_found', message);
      if (code === 'bad_input') return fail(c, 'bad_input', message);
      return fail(
        c,
        'source_failed',
        "Couldn't read the transaction on NEAR, so nothing changed. Send it again.",
      );
    }
    const deposit = t.methods.includes('deposit');
    if (
      t.signer_id !== account ||
      t.receiver_id !== contract ||
      !t.succeeded ||
      !(deposit || t.methods.includes('withdraw'))
    ) {
      return fail(
        c,
        'bad_input',
        `That transaction isn't a deposit or withdrawal in ${contract} from ${account}.`,
      );
    }
    const near_usd = await price();
    if (near_usd === null) {
      return fail(
        c,
        'source_failed',
        "Couldn't read NEAR's price, so nothing changed. Send it again.",
      );
    }
    const before = (await personCredit(d.store, me.person))?.left_usd ?? 0;
    let after: Awaited<ReturnType<typeof chainChat>>;
    try {
      after = await chainChat(
        d.store,
        chain,
        me.person,
        account,
        near_usd,
        () => new Date(clock()),
      );
    } catch {
      return fail(
        c,
        'source_failed',
        "Couldn't read your balance on NEAR, so nothing changed. Send it again.",
      );
    }
    return ok(c, {
      added_usd: Math.round((after.credit.left_usd - before) * 1e6) / 1e6,
      added_near: deposit ? yoctoToNear(t.yocto) : 0,
      near_usd,
      credit: {
        ...after.credit,
        usd_per_chat: d.usdPerChat,
        balance_yocto: after.yocto.toString(),
      },
    });
  }

  // -- a top-up through NEAR Intents (Elco, 10 Nov: "let users pay with anything from anywhere"):
  //    GET  /api/v1/pay/tokens          what a person can pay from: every token and chain 1Click lists
  //    POST /api/v1/pay/intents         { usd, origin_asset, refund_to } → a deposit address to send to
  //    GET  /api/v1/pay/intents/:deposit where it stands; once it's landed, the dollars are on their credit
  // Into NEAR Intents under Petals' account, mainnet only, as NEAR Intents is. It lands as the dollars of
  // USDC it delivered, once, with its own entry, at the price it came in at.

  app.get('/api/v1/pay/tokens', async (c) => {
    c.header('Cache-Control', 'no-store');
    return ok(c, { tokens: await payTokens(d.oneClick) });
  });

  app.post(
    '/api/v1/pay/intents',
    bodyLimit({
      maxSize: 16 * 1024,
      onError: (c) => fail(c, 'bad_input', 'the body is larger than 16 KiB'),
    }),
    async (c) => {
      c.header('Cache-Control', 'no-store');
      const foreign = d.gate.refuseForeign(c);
      if (foreign) return foreign;
      const me = await d.gate.personOf(c);
      if (!me) return fail(c, 'unauthorised', 'Sign in with your wallet first.');
      const body = (await c.req.json().catch(() => null)) as {
        usd?: unknown;
        origin_asset?: unknown;
        refund_to?: unknown;
      } | null;
      const { usd, origin_asset, refund_to } = body ?? {};
      if (typeof usd !== 'number' || !(usd > 0) || usd > 1000) {
        return fail(c, 'bad_input', 'usd is how many dollars to add, more than 0 and at most 1000');
      }
      if (typeof origin_asset !== 'string' || !origin_asset) {
        return fail(
          c,
          'bad_input',
          'origin_asset is the token to pay with, as GET /api/v1/pay/tokens names it',
        );
      }
      if (typeof refund_to !== 'string' || !refund_to) {
        return fail(
          c,
          'bad_input',
          "refund_to is your address on the token's chain, where anything unswapped goes back",
        );
      }
      let quote: Awaited<ReturnType<typeof depositQuote>>;
      try {
        quote = await depositQuote(
          { usd, originAsset: origin_asset, refundTo: refund_to, recipient: PAY_RECEIVER.mainnet },
          d.oneClick,
        );
      } catch (e) {
        return fail(c, 'source_failed', `NEAR Intents couldn't quote it: ${(e as Error).message}`);
      }
      await d.store.topUp.add({
        deposit_address: quote.deposit_address,
        person: me.person,
        usd,
        quote: JSON.stringify(quote),
        status: 'PENDING_DEPOSIT',
        credited_usd: null,
        created_at: new Date(clock()).toISOString(),
        settled_at: null,
      });
      return ok(c, { top_up: { ...quote, usd, status: 'PENDING_DEPOSIT' } });
    },
  );

  app.get('/api/v1/pay/intents/:deposit', async (c) => {
    c.header('Cache-Control', 'no-store');
    const me = await d.gate.personOf(c);
    if (!me) return fail(c, 'unauthorised', 'Sign in with your wallet first.');
    const row = await d.store.topUp.get(c.req.param('deposit'));
    if (!row || row.person !== me.person)
      return fail(c, 'not_found', 'No top-up of yours at that address.');
    const quote = JSON.parse(row.quote) as { deposit_memo: string | null };
    if (row.settled_at) {
      return ok(c, {
        top_up: {
          deposit_address: row.deposit_address,
          status: row.status,
          credited_usd: row.credited_usd,
        },
        credit: await personCredit(d.store, me.person),
      });
    }
    let s: Awaited<ReturnType<typeof swapStatus>>;
    try {
      s = await swapStatus(row.deposit_address, quote.deposit_memo, d.oneClick);
    } catch (e) {
      return fail(c, 'source_failed', `NEAR Intents couldn't say: ${(e as Error).message}`);
    }
    let credited: number | null = null;
    if (s.status === 'SUCCESS') {
      // the dollars it delivered, as USDC (six decimals), at the price it came in at
      const delivered =
        s.amount_out_usd !== null
          ? Number(s.amount_out_usd)
          : s.amount_out !== null
            ? Number(s.amount_out) / 1e6
            : row.usd;
      const usdIn = Math.round(delivered * 1e6) / 1e6;
      const at = new Date(clock()).toISOString();
      if (await d.store.topUp.settle(row.deposit_address, usdIn, at)) {
        await payPerson(d.store, me.person, {
          id: `intents:${row.deposit_address}`,
          usd: usdIn,
          now: new Date(clock()),
        });
        await chargePetals(
          d.store,
          d.price ?? PRICE,
          me.person,
          { kind: 'top_up', usd: usdIn },
          `intents:${row.deposit_address}`,
          at,
        );
      }
      credited = usdIn;
    } else if (s.status !== row.status) {
      await d.store.topUp.setStatus(row.deposit_address, s.status);
    }
    return ok(c, {
      top_up: {
        deposit_address: row.deposit_address,
        status: s.status,
        credited_usd: credited,
        origin_tx: s.origin_tx,
        destination_tx: s.destination_tx,
      },
      credit: await personCredit(d.store, me.person),
    });
  });

  return app;
}

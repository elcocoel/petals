// prepare_publish and publish_flower (tools.md; shared-map.md, Writing, Phase A relayed
// publish). The maker signs one NEP-413 message naming the entry hash; Petal's writer writes
// petal/v1/spec/<id>, and the mirror keeps a local copy. What is signed is the facts and the
// recipe's build; the drawing is only a receipt beside them, so nothing is refused over it.
import {
  canonicalJson,
  DEFAULT_VIEW,
  entryId,
  NotImplementedError,
  RENDER_VERSION,
  renderFlower,
  schemas,
  specHash,
} from '@petal/core';
import type { Entry, EntryV2, Nep413Proof } from '@petal/core/types';
import { verifyNep413 } from '@petal/near/auth';
import { MAP_LIMITS, mapKeys } from '@petal/near/map';
import { compile, defineTool, describeErrors } from '../define.ts';
import { draftStore, nonceStore } from '../drafts.ts';
import { ToolFailure } from '../errors.ts';
import { assertRoom } from '../limits.ts';
import type { ToolContext } from '../types.ts';
import { type DraftEntry, draftOf, entrySha256, publishMessage } from '../verify.ts';
import { base, DATETIME, ENTRY_ID, galleryUrl, obj, SHA256 } from './shared.ts';
import { checkSpec, summarise } from './specs.ts';

const checkEntrySchema = compile(schemas.entry as Record<string, unknown>);
const checkDraftSchema = compile(schemas.entryV2 as Record<string, unknown>);

const entryBytes = (entry: unknown) => new TextEncoder().encode(canonicalJson(entry)).length;

/** Everything prepared from here on is flower/v2. A draft in the older form is lifted, not refused,
 * and any receipt it came with is dropped: prepare_publish writes its own. */
function asV2(entry: DraftEntry): Omit<EntryV2, 'id'> {
  const {
    render_sha256: _drawing,
    drawn_with: _receipt,
    ...rest
  } = entry as DraftEntry & {
    render_sha256?: string;
    drawn_with?: EntryV2['drawn_with'];
  };
  return (rest.petal === 'flower/v1' ? { ...rest, petal: 'flower/v2' } : rest) as Omit<
    EntryV2,
    'id'
  >;
}

function writerAccount(ctx: ToolContext): string {
  return ctx.config.map?.writer ?? ctx.map.trustedWriters[0] ?? 'unknown';
}

function explorerUrl(ctx: ToolContext, tx: string): string {
  const net = ctx.config.map?.network ?? 'testnet';
  return net === 'mainnet'
    ? `https://nearblocks.io/txns/${tx}`
    : `https://testnet.nearblocks.io/txns/${tx}`;
}

export const preparePublish = defineTool<{ entry: Partial<Entry> }, object>({
  name: 'prepare_publish',
  onTheirMachine: true,
  title: 'Prepare to publish',
  description:
    'Get the exact NEP-413 message a maker signs to publish a flower, with a fresh nonce. Pass ' +
    'the entry without id and maker (petal, spec, spec_sha256, interpretation, snapshot, ' +
    'provenance). Petals adds the drawing receipt itself. Hand sign_url to the human: their wallet ' +
    'signs; never ask anyone for a key.',
  input: obj(
    ['entry'],
    { entry: { type: 'object', description: 'flower/v2 entry without id and provenance.maker' } },
    { additionalProperties: false },
  ),
  output: obj(['entry_sha256', 'nonce', 'recipient', 'message', 'expires_at', 'sign_url'], {
    entry_sha256: SHA256,
    nonce: { type: 'string' },
    recipient: { type: 'string' },
    message: { type: 'string' },
    expires_at: DATETIME,
    sign_url: { type: 'string' },
  }),
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
  async run({ entry }, ctx) {
    if (typeof entry.provenance !== 'object' || entry.provenance === null) {
      throw new ToolFailure('bad_input', 'entry.provenance is missing.', 'See $defs.entry.');
    }
    const lifted = asV2(draftOf(entry));
    if (!checkDraftSchema({ ...lifted, id: '0'.repeat(24) })) {
      throw new ToolFailure(
        'bad_input',
        `The entry does not match flower/v2: ${describeErrors(checkDraftSchema.errors)}`,
        'Build it from propose_spec and validate_spec results.',
      );
    }
    if (lifted.spec_sha256 !== specHash(lifted.spec)) {
      throw new ToolFailure('bad_input', 'spec_sha256 is not the hash of the spec.');
    }
    if (lifted.snapshot.sha256 !== lifted.spec.snapshot.sha256) {
      throw new ToolFailure('bad_input', "snapshot.sha256 is not the spec's snapshot.");
    }
    const { validation, snapshot } = await checkSpec(ctx, lifted.spec, lifted.interpretation);
    if (!validation.valid || !snapshot) {
      throw new ToolFailure(
        'invalid_spec',
        `The spec or interpretation is not valid: ${summarise(validation)}`,
        'validate_spec with the interpretation lists every error.',
      );
    }
    const draft: Omit<EntryV2, 'id'> = {
      ...lifted,
      drawn_with: {
        render: RENDER_VERSION,
        // the drawing everyone without their own view sees: never its own choices (one-source.md, step 2)
        sha256: renderFlower(lifted.spec, snapshot, { view: DEFAULT_VIEW }).render_sha256,
      },
    };
    // Before anything is kept: nothing else stands between a stranger's entry and the disk.
    if (entryBytes(draft) > MAP_LIMITS.valueBytes) {
      throw new ToolFailure(
        'bad_input',
        `The entry is over ${MAP_LIMITS.valueBytes} bytes, the map's limit.`,
      );
    }
    await assertRoom(ctx.config, ctx.now());
    const entry_sha256 = entrySha256(draft);
    const { nonce, expires_at } = await nonceStore(ctx.config).issue();
    const recipient = ctx.map.receiver;
    const message = publishMessage(entry_sha256);
    await draftStore(ctx.config).put({
      entry_sha256,
      entry: draft,
      nonce,
      expires_at,
      recipient,
      message,
      created_at: ctx.now().toISOString(),
    });
    // The publish page (W6) rebuilds the message from the entry hash; the URL carries the rest,
    // since no route reads a prepared draft back.
    const q = new URLSearchParams({ nonce, recipient, expires_at });
    return {
      entry_sha256,
      nonce,
      recipient,
      message,
      expires_at,
      sign_url: `${base(ctx)}/publish/${entry_sha256}?${q}`,
    };
  },
});

const PROOF = obj(
  ['type', 'account_id', 'public_key', 'signature', 'message', 'nonce', 'recipient'],
  {
    type: { const: 'nep413' },
    account_id: { type: 'string', minLength: 1 },
    public_key: { type: 'string', pattern: '^ed25519:' },
    signature: { type: 'string', minLength: 1 },
    message: { type: 'string', minLength: 1 },
    nonce: { type: 'string', minLength: 1 },
    recipient: { type: 'string', minLength: 1 },
  },
  { additionalProperties: false, description: "the wallet's NEP-413 signMessage result" },
);

const unauthorised = (message: string) =>
  new ToolFailure('unauthorised', message, 'Call prepare_publish again and sign the new message.');

export const publishFlower = defineTool<{ entry_sha256: string; proof: Nep413Proof }, object>({
  name: 'publish_flower',
  onTheirMachine: true,
  title: 'Publish a flower',
  description:
    "Publish a prepared flower to the shared map on NEAR with the maker's NEP-413 proof. Checks " +
    'the nonce is fresh and unused, the signature, and that the key is a full-access key of the ' +
    "account; then Petals' writer writes petal/v1/spec/<id>.",
  input: obj(
    ['entry_sha256', 'proof'],
    { entry_sha256: SHA256, proof: PROOF },
    {
      additionalProperties: false,
    },
  ),
  output: obj(['id', 'key', 'receiver', 'writer', 'tx_hash', 'explorer_url', 'gallery_url'], {
    id: ENTRY_ID,
    key: { type: 'string' },
    receiver: { type: 'string' },
    writer: { type: 'string' },
    tx_hash: { type: 'string' },
    explorer_url: { type: 'string' },
    gallery_url: { type: 'string' },
  }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  async run({ entry_sha256, proof }, ctx) {
    const drafts = draftStore(ctx.config);
    const draft = await drafts.get(entry_sha256);
    if (!draft) {
      throw new ToolFailure(
        'not_found',
        `No prepared draft ${entry_sha256}.`,
        'Call prepare_publish first; it returns the entry_sha256 and the message to sign.',
      );
    }
    if (draft.used_at) throw unauthorised('This draft was already published; the nonce is used.');
    if (ctx.now().getTime() > Date.parse(draft.expires_at)) {
      throw unauthorised('The nonce has expired.');
    }
    if (proof.nonce !== draft.nonce) throw unauthorised('The proof is for another nonce.');
    if (proof.message !== draft.message || proof.recipient !== draft.recipient) {
      throw unauthorised('The proof signs another message or recipient.');
    }
    let check: { ok: boolean; reason?: string };
    try {
      check = await verifyNep413(
        proof,
        { message: draft.message, recipient: draft.recipient },
        ctx.rpc,
        { nonces: nonceStore(ctx.config) },
      );
    } catch (err) {
      if (err instanceof NotImplementedError) throw err;
      throw new ToolFailure(
        'source_failed',
        `Could not check the proof against NEAR RPC: ${(err as Error).message}`,
        'Try again in a moment.',
      );
    }
    if (!check.ok) throw unauthorised(`The proof did not verify: ${check.reason ?? 'bad proof'}.`);

    const signed = { ...draft.entry, provenance: { ...draft.entry.provenance, maker: proof } };
    const entry = { ...signed, id: entryId(signed) } as Entry;
    if (!checkEntrySchema(entry)) {
      throw new ToolFailure(
        'internal',
        `The final entry is not valid: ${describeErrors(checkEntrySchema.errors)}`,
      );
    }
    if (entryBytes(entry) > MAP_LIMITS.valueBytes) {
      throw new ToolFailure(
        'bad_input',
        `The entry is over ${MAP_LIMITS.valueBytes} bytes, the map's limit.`,
      );
    }
    const writer = ctx.map.writer;
    if (!writer) {
      throw new ToolFailure(
        'source_failed',
        "Petals' map writer is not configured on this server, so nothing was written.",
        'Set PETAL_WRITER_ACCOUNT and PETAL_WRITER_KEY_FILE (testnet only).',
      );
    }
    await assertRoom(ctx.config, ctx.now());
    if (!(await drafts.claim(entry_sha256, ctx.now().toISOString()))) {
      throw unauthorised('This draft was already published; the nonce is used.');
    }
    const key = mapKeys.spec(entry.id);
    let tx_hash: string;
    try {
      ({ tx_hash } = await writer.write({ [key]: entry }));
    } catch (err) {
      if (err instanceof NotImplementedError) throw err;
      throw new ToolFailure(
        'source_failed',
        `Writing to the shared map failed: ${(err as Error).message}`,
        'The entry stays in the local mirror as pending and is retried.',
      );
    }
    return {
      id: entry.id,
      key,
      receiver: ctx.map.receiver,
      writer: writerAccount(ctx),
      tx_hash,
      explorer_url: explorerUrl(ctx, tx_hash),
      gallery_url: galleryUrl(ctx, entry.id),
    };
  },
});

# Petals' protocols: one rule for every format

Elco, 9 Nov, asked for the data protocol, the visual protocol and the brain to be versioned protocols, so work improves on solid ground instead of "lost versions scattered". Elco's go: "1, yes". This page is that rule. It holds for every side: data and the brain (SYSTEMS), the look (LOOK, for `view/v1`).

## What a format is

A document Petals stores, hashes, signs, or hands from one side to another: a snapshot, a layer, a seam, a spec, a flower entry, a view, a recipe, a claim, the brain's index. A tool's answer or an API response is not a format: it may gain fields, marked "additive", and nothing breaks.

## What every format has

1. **A version string** inside each document (its `petal` field), written `<name>/vN`, such as `layer/v1`.
2. **A JSON Schema** in `packages/core/schema/`, with `$id` `urn:petal:schema:<name>:vN`. The schema is the format: code that writes or reads it is checked against the schema, never the other way round.
3. **Fixtures:** at least one real document per version, in `packages/core/schema/fixtures/`, valid against its schema.
4. **Pinned hashes:** `packages/core/schema/pins.json` names each fixture, its schema and the SHA-256 of its canonical JSON. If anything changes how a document reads or hashes, a pin breaks.
5. **The check:** `scripts/check-protocols.ts`, run by `scripts/check.sh` before every merge. It fails if a schema has no `urn:petal:schema:<name>:vN` id, a schema has no pinned fixture, a fixture doesn't validate, a pin doesn't match, or a version that was pinned has lost its schema.

## When a format becomes v2

A change is a new version when it would:
- make a valid v1 document invalid;
- change what a field means;
- change a v1 document's hash.

A format that's stored or hashed refuses fields it doesn't know, so a new field is a new version too. Fixing a typo in a description, or a check that refuses what v1 already said was wrong, stays v1.

## How old versions stay readable

- **v1 stays.** Its schema, fixtures and pins stay in the repo, and the check keeps them passing.
- **Documents say their version,** and a reader picks by it. A reader that meets a version it doesn't know says so, and never guesses.
- **Nothing is rewritten in place.** A stored document's hash is its name. Moving it to v2 makes a new document, which names the old one in `from`.
- **Both run side by side** until nothing in use is v1, and then v1 still reads.

## Who decides

The side that owns a format proposes its next version: SYSTEMS for data and the brain, LOOK for the look, with the other side when it crosses the seam. A new version that changes what people see waits for Elco's go.

## Adding a format

Its schema, a fixture and its pin go in one commit. The check fails otherwise.

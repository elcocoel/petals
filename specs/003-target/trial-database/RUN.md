# The database trial: what ran, and what came back

**What it ran on**: only throwaway test data, in throwaway containers on an internal network with no published
ports except one on localhost, all deleted afterwards. No live data was opened.

**What the test data holds:**
- one person;
- two linked NEAR wallets, `alice-trial.testnet` and `bob-trial.testnet`;
- two explorations, each with a step, and one with a note;
- a reading made elsewhere and posted to the site;
- a followed address;
- a private note.

**Keys:** the wallet-sealing key and the Postgres password were made fresh (`openssl rand`) and never printed.

## The scripts

- `seed.ts`: makes the test data with Petals' own code, through the real routes, in process: a challenge, a
  NEP-413 signature by a test wallet checked by a fake NEAR RPC, then the workspace and exploration routes,
  including the route for posting a reading. `scripts/bind-wallet.ts` links the second wallet.
- `read.ts`: reads back what the person would see, through the HTTP API with the person's session, and writes a
  hash of the answers so two runs can be compared.
- `blocking.ts`: whether one waiting SQLite call holds up everyone else in the same Node process.
- `pg-trial.ts`: loads the store's schema and rows into Postgres 17 and compares them table by table.

The server ran from its own image, read-only, with a throwaway data folder and a throwaway secrets folder;
Postgres ran from the official `postgres:17-alpine` image with its data on a named volume.

## 1. Serve it from a container, then replace the container (SQLite)

The first container served the seeded data; `read.ts` read it back (me 200, both wallets, 2 explorations with
their steps, 1 follow, 1 note, the posted reading with a matching hash). The container was deleted and a new one
started on the same folder: the answers were **identical**.

## 2. Back up while it runs, lose the folder, restore (SQLite)

A backup was made with SQLite's own backup API from inside the running container, plus the posted-reading
files; `PRAGMA integrity_check` said ok. Then the container and the whole data folder were deleted, the backup
was copied into a new folder, and a new container served it: the answers were **identical**.

## 3. The same restore with the wrong wallet-sealing key

Answers differed only in "me": 2 wallets became 0. The workspace was still reachable through the existing
session, but the wallets no longer opened, and signing in with either wallet would have found no account.
**The key must survive along with the data.**

## 4. One waiting call holds up everyone (blocking.ts)

```
A. synchronous, on the main thread (today): the write took 2006 ms; everyone else waited up to 2006 ms
B. the same write on a worker thread: the write took 2042 ms; everyone else waited up to 12 ms
```

## 5. Postgres: load, compare, replace, back up, lose, restore (pg-trial.ts)

`results/5-postgres-load.txt` shows what came back, in full:
- **The schema as it is:** 44 of 45 statements were taken. The refusal is the FTS5 search table.
- **The translated schema:** loaded.
- **The rows:** every row was copied in one transaction. 24 of 24 tables are identical row for row.
- **The wallet seals:** 2 of 2 open, and still find their account.
- **The store's 126 SQL statements:** Postgres parsed and planned 123 of them as they are, with `?` written as
  `$1`. It refused three:
  - `ON CONFLICT … DO UPDATE SET n = n + 1`: "n" is ambiguous;
  - `UPDATE OR IGNORE`;
  - FTS5 search, through `MATCH` and `snippet`.

Then the Postgres container was replaced on the same volume (24 of 24 identical, 2 of 2 seals open:
`results/6-postgres-replaced.txt`), dumped with `pg_dump -Fc`, the container and volume deleted, and the dump
restored into a fresh one with `pg_restore --exit-on-error` (the same result: `results/7-postgres-restored.txt`).

## Found along the way

`GET /api/v1/snapshots/:sha256` through the web app sent a gzipped body to a client that accepts gzip, without
its `Content-Encoding: gzip` header, so a client got compressed bytes labelled as JSON. `read.ts` detects the
gzip bytes and unpacks them. This isn't part of the database proposal.

# The database trial: exactly what ran, and what came back

**Run**: 8 Nov 2026 by SYSTEMS, on main `e8cb7f3` and the Petals image `petals:b589610aecbc`.
**What it ran on**: only throwaway test data, in throwaway containers on a host-only network that was deleted afterwards. Never `Petals/elco`, never `Petals/data`, and never the container on 3090, which kept running untouched the whole time.

**Two placeholders below:**
- `$SP` is a scratch folder.
- `$REPO` is a checkout of `build/`.

**What the test data holds:**
- one person;
- two linked NEAR wallets, `alice-trial.testnet` and `bob-trial.testnet`;
- two explorations, each with a step, and one with a note;
- a reading made elsewhere and posted to the site;
- a followed address;
- a private note.

**Where the keys came from:** the wallet-sealing key and the Postgres password were made fresh (`openssl rand`) and never printed.

## 1. Seed the test data with Petals' own code

```sh
PETAL_WALLET_KEY=<test key> node seed.ts "$REPO" "$SP/data-1" http://127.0.0.1:3188
#   seeded: person prs_6b51…, explorations exp_837b…, exp_ca8a…, posted reading 5a5542a59eea…
PETAL_WALLET_KEY=<test key> node "$REPO/scripts/bind-wallet.ts" --state "$SP/data-1" \
  --person prs_6b51… --wallet near:testnet:bob-trial.testnet
#   wallet near:testnet:bob-trial.testnet: bound
#   person prs_6b51…: 2 wallet(s): near:testnet:alice-trial.testnet, near:testnet:bob-trial.testnet
```

- **Sign-in:** it went through the real sign-in routes: a challenge, a NEP-413 signature by a test wallet, and verification. A fake NEAR RPC checked the signature.
- **The workspace:** made through the real workspace and exploration routes, including the new route for posting a reading.
- **The second wallet:** linked by the real `bind-wallet.ts`, the tool that linked Elco's own wallets.

## 2. Serve it from a container, then replace the container (SQLite, today's engine)

```sh
container network create --internal --subnet 192.168.97.0/24 petals-trial
trial-run.sh petals-trial-1 "$SP/data-1" "$SP/secrets"   # flags as in petals_run.sh; port 127.0.0.1:3188
node read.ts http://127.0.0.1:3188 seed.json 1-first-container.json
#   me 200, wallets [alice-trial.testnet, bob-trial.testnet], explorations 2 (steps 1+1),
#   follows 1, notes 1, posted reading 200 (hash matches); answers sha256 041c1846444aab10
container stop petals-trial-1 && container delete petals-trial-1
trial-run.sh petals-trial-2 "$SP/data-1" "$SP/secrets"
node read.ts … 2-replaced-container.json        # answers sha256 041c1846444aab10: IDENTICAL
```

`read.ts` reads back what the person would see, through the HTTP API, with the person's session.

## 3. Back up while it runs, lose the folder, restore (SQLite)

```sh
container exec petals-trial-2 node -e '…backup(new DatabaseSync("/data/private.db", {readOnly: true}), "/data/.backup-tmp/private.db")…'
#   inside the container: backup copied 71 pages
mv "$SP/data-1/.backup-tmp/private.db" "$SP/backup/2026-11-08/" ; cp -Rp "$SP/data-1/cache" "$SP/backup/2026-11-08/"
sqlite3 -readonly "file:…/private.db?immutable=1" 'PRAGMA integrity_check;'      #   ok
#   person 1, wallet_binding 2, exploration 2, step 2, note 1, follow 1, workspace_note 1, session 1
container stop petals-trial-2 && container delete petals-trial-2 ; rm -rf "$SP/data-1"
mkdir "$SP/data-2" && cp -p backup/…/private.db "$SP/data-2/" && cp -Rp backup/…/cache "$SP/data-2/"
trial-run.sh petals-trial-3 "$SP/data-2" "$SP/secrets"
node read.ts … 3-restored.json                  # answers sha256 041c1846444aab10: IDENTICAL
```

- **The backup:** made with SQLite's own backup, from inside the container, as `coordinator/backup.sh` does, plus the posted-reading files.
- **The loss:** then the container and the whole data folder were deleted.

## 4. The same restore with the wrong wallet-sealing key

```sh
trial-run.sh petals-trial-4 <a copy of data-2> <a folder with a different key>
node read.ts … 4-wrong-key.json
#   me 200, wallets [], explorations 2, follows 1, notes 1 — answers differ only in "me": 2 wallets → 0
```

The workspace was still reachable through the existing session, but the wallets no longer opened. Signing in with either wallet would have found no account. **The key must survive along with the data.**

## 5. One waiting call holds up everyone (blocking.ts)

```
A. synchronous, on the main thread (today): the write took 2006 ms; everyone else waited up to 2006 ms
B. the same write on a worker thread: the write took 2042 ms; everyone else waited up to 12 ms
```

## 6. Postgres: load, compare, replace, back up, lose, restore (pg-trial.ts, pg-run.sh)

```sh
container image pull docker.io/library/postgres:17-alpine          # PostgreSQL 17.11
pg-run.sh petals-pg-trial-1 petals-pg-trial-vol <password file>    # data on a named volume
PETAL_WALLET_KEY=<test key> node pg-trial.ts "$REPO" source-copy.db petals-pg-trial-1 load 5-postgres-load.txt
```

`results/5-postgres-load.txt` shows what came back, in full:
- **The schema as it is:** 44 of 45 statements were taken. The refusal is the FTS5 search table.
- **The translated schema:** loaded.
- **The rows:** every row was copied in one transaction. 24 of 24 tables are identical row for row.
- **The wallet seals:** 2 of 2 open, and still find their account.
- **The store's 126 SQL statements:** Postgres parsed and planned 123 of them as they are, with `?` written as `$1`. It refused three:
  - `ON CONFLICT … DO UPDATE SET n = n + 1`: "n" is ambiguous;
  - `UPDATE OR IGNORE`;
  - FTS5 search, through `MATCH` and `snippet`.

```sh
container stop petals-pg-trial-1 && container delete petals-pg-trial-1      # volume kept
pg-run.sh petals-pg-trial-2 petals-pg-trial-vol …
node pg-trial.ts … petals-pg-trial-2 check …   # 24 of 24 identical; 2 of 2 seals open
container exec petals-pg-trial-2 pg_dump -U postgres -Fc petals > backup/pg/petals.dump   # 34,741 bytes, 24 tables with data
container stop petals-pg-trial-2 && container delete petals-pg-trial-2 && container volume delete petals-pg-trial-vol
pg-run.sh petals-pg-trial-3 petals-pg-trial-vol2 …
container exec petals-pg-trial-3 psql -U postgres -c 'CREATE DATABASE petals;'
container exec -i petals-pg-trial-3 pg_restore -U postgres -d petals --exit-on-error < backup/pg/petals.dump   # ok
node pg-trial.ts … petals-pg-trial-3 check …   # 24 of 24 identical; 2 of 2 seals open
```

## 7. Cleaned up

These were all deleted afterwards:
- the containers `petals-trial-1` to `-4` and `petals-pg-trial-1` to `-3`;
- the volumes `petals-pg-trial-vol` and `petals-pg-trial-vol2`;
- the network `petals-trial`;
- the pulled Postgres image;
- the test password.

`container ls` showed only `petals` on `b589610aecbc`, and 3090's health was unchanged.

## Found along the way

`GET /api/v1/snapshots/:sha256` through the web app sends a gzipped body to a client that accepts gzip, without its `Content-Encoding: gzip` header. That's on image `b589610`. So a client gets compressed bytes labelled as JSON. `read.ts` detects the gzip bytes and unpacks them. This isn't part of the database proposal.

# Proposal: Petals' database

**Created**: 2026-11-08
**Status**: An architecture proposal, to explain and agree on before anything is implemented. Nothing in it is built. The backup, restore and Postgres trial in section 6 really ran, on throwaway data. Exactly what ran is in `trial-database/RUN.md`.
**Brief**, 8 Nov:
- A portable, self-hosted Petals system. During the hackathon, one host machine provides the application hosting and database hosting.
- The application is separated from its database through a clear interface, with asynchronous operation, so slow operations don't block other users.
- Accounts, linked wallets and workspaces survive application restarts and container replacement.
- The main database moves to PostgreSQL.

**Measured against** `spec.md`:
- TGT-010: everything a person makes survives restarts, a move to another host, and the loss of a disk.
- TGT-001: one account with many proven links.
- TGT-040: the server is built to move to any host.
- TGT-041: nothing to steal.

## In one page

**Postgres is the destination, and it can run on the host now, in its own container beside the application.** Postgres is a database that runs as its own program, and other programs talk to it over a connection. A container is a sealed box that runs one program with only what it needs.

The application stops knowing that its data is a file in its folder. It asks a **store** for things by name: "the account for this wallet", "add this step". The store answers later, **asynchronously**: the application asks, carries on with other work, and picks the answer up when it's ready. So one slow answer no longer stops everyone else. Postgres's own container keeps its data on its own **volume**, a storage area the container runtime keeps outside any one container.

**Today's SQLite database** is a single file the application opens directly. In this proposal it's only the starting point: its tables and rows are copied into Postgres once, checked, and then retired.

What the trial on throwaway data showed:
- **The schema:** Postgres takes 44 of today's 45 schema statements as they are.
- **The store's SQL:** it accepts 123 of the store's 126 SQL statements as they are.
- **The data:** every row copied across exactly, in all 24 tables. The sealed wallets still opened.
- **Container replacement:** replacing the Postgres container kept everything.
- **Backup and restore:** a backup taken while it ran, a deleted container and volume, and a restore into a fresh one brought back every row. The same was shown for today's SQLite, through the application's own API: the person's account, both linked wallets and the workspace came back identical.

**What makes it permanent is a copy kept off this machine, plus the key that seals wallets kept apart from it.** Moving to another host is then a restore there, step by step (section 7).

## 1. The interface between the application and its database

**What it is.** One package, `@petal/store`, is the only code that speaks to the database. Everything else asks it for things by name.
- **Asks:** "find the person whose wallet fingerprint is this", "add a step to this exploration", "count today's posted readings".
- **Gets back:** plain values: a person's id, a list of steps, a number.

That boundary is the interface. The store already exists, with its tables grouped by kind (people, wallet bindings, sessions, explorations, steps, notes, follows, and the rest). What this proposal changes is what crosses it, and what may go around it.

**What crosses it:**
- requests by name, with plain values;
- answers, with plain values;
- one setting that says where the database is: a **connection address**, for example `postgres://petals@db:5432/petals`. It names the database server, the database, and the user to log in as, with the password kept apart as a secret.

**What may never cross it:**
- SQL, the language databases are asked in;
- file paths;
- open connections.

**What goes around it today**, and has to stop:
- **Opening the database by folder:** 17 places in 7 files of the application, and 3 scripts, open it by pointing at the server's state folder.
- **Measuring by folder size:** the data limit (`PETAL_DATA_MAX_MB`) measures the folder on disk.
- **Copying files:** the backup script copies files, not data.

With Postgres, none of those can work. The store has to be the only way in. The data limit asks Postgres how big the database is. The scripts that link a wallet or fund a person call the store too.

**Where it sits, on one machine:**

```
 ┌─ container: the application ─┐    private network     ┌─ container: Postgres ─┐
 │  pages, API, agent doors     │ ── connection address ─▶│  the database         │
 │  @petal/store (the only code │    + password (secret)  │  data on its volume   │
 │  that speaks SQL)            │                         │  (outside both boxes) │
 └──────────────────────────────┘                         └───────────────────────┘
```

**How that keeps them apart, even on one machine:**
- They're two containers, each with only its own job.
- The application holds no database files at all. It reaches Postgres only over a private container network, by the connection address.
- Postgres can't be reached from outside: it has no published port. It needs a password, and it holds nothing of the application's code.
- Either can be replaced or moved without touching the other.
- Later, the connection address can point at a Postgres on another machine, or at Supabase. Supabase is a company that runs Postgres for you. Nothing else in the application changes.

## 2. Asynchronous access, and why today's calls can hold everyone up

**How Node works.** Petals' server is a Node.js program. Node runs our code on **one main thread**: one line of work that takes requests one at a time, very quickly. It feels parallel because each request gives the thread back whenever it waits for something, a network answer for example. While the thread is busy, every other visitor's request waits in line.

**What today's database does.** Today's store uses Node's built-in SQLite in its **synchronous** form. When the code asks the database something, the main thread stops and waits right there, and doesn't give itself back. That's fine when the answer takes microseconds. It isn't when the answer is slow, for example:
- when another process holds the database's **write lock**, the database's way of letting one writer in at a time. A backup, or a script like `bind-wallet.ts`, holds it while it works. Our store then waits up to 5 seconds for it, and holds the main thread the whole time;
- a large search, or a big list read in one go.

**Demonstrated** (`trial-database/blocking.ts`): another process held the write lock for 2 seconds, and a 10-millisecond timer stood in for every other visitor.

| How the write ran | Everyone else waited up to |
|---|---|
| Today's way: synchronous, on the main thread | 2,006 ms |
| The same write on a worker thread, a second line of work the main thread hands jobs to | 12 ms |

**What fixes it:**
- **With Postgres:** every Postgres driver for Node is asynchronous. A driver is the library our code talks to Postgres through. The query goes to Postgres, which does the work in its own processes, and the main thread is free until the answer comes back. A **pool** of connections lets several requests talk to Postgres at once. Two limits keep slow work from hogging that pool: a time limit on each query (`statement_timeout`), and a limit on how long to wait for a connection.
- **With SQLite, until the switch:** the same interface can be served by SQLite on a worker thread, which is what row B shows. That only matters if the application has to run on the asynchronous interface before Postgres is ready (choice D4).
- **What it doesn't fix:** heavy work in our own JavaScript, like turning a large reading into a drawing, still holds the main thread. That's a separate matter from the database.

## 3. Postgres locally now, compared honestly with SQLite behind the same interface

Both can sit behind the same asynchronous store. The question is what each gives Petals now, against the target.

| Against 003-target | SQLite behind the interface | Postgres in its own container, now |
|---|---|---|
| **Survives restarts and container replacement** | Yes: the file lives outside the container (shown) | Yes: the data lives on a volume outside the container (shown) |
| **Survives a lost disk** (TGT-010) | Only with copies off the machine | Only with copies off the machine. Same need |
| **Moves to another host** (TGT-040) | Copy the file and restore it | Restore a dump there. Or later, point at a Postgres elsewhere, with no move at all |
| **One account, many links** (TGT-001) | A table of links, each wallet or social account unique to one account | The same |
| **Claims and challenges, with their history** | Only ever add rows, and a trigger refuses edits and deletes | The same, and permissions can also refuse edits for the application's own user |
| **Several servers at once** | No: one machine writes | Yes |
| **The road to Supabase** | A migration still to do | Already Postgres. The connection address changes |
| **Nothing to steal** (TGT-041) | No password, nothing listening | A database password is a new secret. Nothing listens outside the private network |
| **What runs** | One program | Two containers, and Postgres's upgrades |
| **Cost** | $0 | $0: the official image, on the host |

**What a trigger is:** a rule inside the database that runs on every change and can refuse it. **What permissions are:** which database user may do what.

**Where it leaves us.** Because Postgres is the destination, running it locally now does the migration once, on the host, while the data is small. Later the move to Supabase or any host is only a change of address. SQLite's gain would be one less program to run for a while. Its cost is a second migration later, with more data.

## 4. Migrating to it

### The code

Each of these is real work, named so it can be understood. They aren't timed.

1. **The store answers asynchronously.**
   - **The store:** every function in it answers later.
   - **Its callers:** about 180 places in 8 files call it, by a rough search, and mostly they get the word `await`.
   - **The session check:** "who is this?" runs synchronously inside the request pipeline today, and its interface becomes asynchronous too.
2. **Transactions:** "do these writes together, or not at all".
   - **Today:** the store's `tx` runs a block of code synchronously, inside one SQLite transaction.
   - **With Postgres:** a transaction borrows one connection from the pool, runs the block asynchronously, and commits or rolls back. Other requests never mix into it, because they use other connections.
3. **A Postgres store** beside today's SQLite one, behind the same interface, with one change in how the SQL is written: Postgres writes the values a query takes as `$1, $2…`, where SQLite writes `?`.
4. **The three statements Postgres refused in the trial:**
   - `ON CONFLICT (day, what) DO UPDATE SET n = n + 1`: Postgres needs `daily_count.n + 1`.
   - `UPDATE OR IGNORE`, which is SQLite-only: it becomes an update that skips rows that would clash.
   - **Search:** today it uses SQLite's FTS5, the text index behind the workspace's search box. Postgres has its own full-text search. A `tsvector` column holds each item's words, kept fast by a GIN index, and matching, ranking and the highlighted snippet each have a Postgres form. The trial loaded that table, but there were no search rows to test it on. Ignoring accents, as today's search does, needs Postgres's `unaccent` extension.
5. **The schema, as Postgres takes it:**
   - **The two changes the trial needed:** the search table above, and the one automatically numbered id (`search_doc.id`), written for Postgres.
   - **Everything else as it is:** the other 44 statements, plus the store's own bookkeeping table.
   - **Dates and JSON:** they stay text at first (choice D5).
6. **Numbers come back as numbers.** Some Postgres drivers return large whole numbers as text. Counters stay ordinary integers, and the driver is told how to return them.
7. **The data limit** asks Postgres the database's size, instead of measuring a folder.
8. **The scripts** (`bind-wallet.ts`, `fund-person.ts`, `mint-invite.ts`) go through the store, so they work on either engine.
9. **Tests:**
   - **One suite, run against both engines:** today's store tests run against SQLite and against Postgres.
   - **Postgres for the tests comes from PGlite,** Postgres built to run inside Node itself, so no server is needed for them.
   - **What it proves:** the same answers from both engines, before anyone depends on it.

### The data

The trial did each of these on a copy of throwaway data (section 6). On real data, it would run first on a copy made from inside the running container, never by opening the live file.

1. **Load the schema into an empty Postgres.**
2. **Copy every row of every table in one transaction:** all of it, or nothing. Then set the automatic numbering to continue after the highest id copied.
3. **Check, before anything depends on it:**
   - the same number of rows in every table;
   - every row identical in both, compared table by table;
   - every sealed wallet opens with the server's key and still finds its account.
4. **Keep the wallet seals working.** A linked wallet is stored scrambled under the server's wallet-sealing key (`PETAL_WALLET_KEY`), and it's found by a fingerprint made with that key. The copy moves those values unchanged, so the same key opens them. The trial showed both seals opening from Postgres.
5. **The switch:**
   - pause sign-ins and writes;
   - make a final copy and check it;
   - change the connection address;
   - restart the application;
   - read back what a person sees.

   The SQLite file is kept as it was, as the way back, until the switch is confirmed.
6. **The posted readings** (snapshot files) aren't in the database. They stay files on the application's own volume, and backups include them (choice D6).

## 5. Surviving restarts and container replacement

**Where the data lives, relative to the container:**

| | The data lives | Restart | Replace the container | Lose the disk |
|---|---|---|---|---|
| **Today: SQLite** | A folder on the host, lent to the application's container (a "bind mount") | Kept | Kept (shown: the same answers from a new container) | Gone, unless copied elsewhere |
| **Proposed: Postgres here** | A named volume, lent to the Postgres container. The application holds none of it | Kept | Kept (shown: a new Postgres container on the same volume, all 24 tables identical) | Gone, unless copied elsewhere |
| **Later: Supabase** | Supabase's machines | Kept | Nothing of ours to replace | Supabase's backups, on a paid plan |

**What survives depends on three things together:**
1. **The database**, on its volume.
2. **The posted-reading files**, on the application's volume.
3. **The wallet-sealing key**, in the server's secrets.

Losing any one of the three loses something. The trial showed what losing only the key does: the workspace was still there, but both wallets became unreadable, so signing in with them would have found no account.

## 6. Backup and restore, demonstrated

All of this ran on 8 Nov:
- on throwaway test data, made by Petals' own sign-in and workspace routes;
- in throwaway containers, from the same image the live server runs;
- on a private network, deleted afterwards.

Commands and output are in `trial-database/RUN.md`, and the scripts beside it. The test data was one person, signed in with a test wallet, with:
- a second wallet linked by `bind-wallet.ts`;
- two explorations with steps;
- a note;
- a reading posted from "their machine";
- a followed address;
- a private note.

**Today's SQLite, through the application:**

| Step | What came back |
|---|---|
| Serve the data from a container, and read it as the person | Account, 2 linked wallets, 2 explorations, 1 follow, 1 note, the posted reading. The answers' fingerprint was `041c1846…` |
| Delete the container, start a new one on the same folder | Identical, byte for byte |
| Back up while it runs (SQLite's own backup, from inside the container), plus the reading files | Integrity check ok, every row present |
| Delete the container **and the whole data folder**, restore the backup into a new folder, start a new container | Identical, byte for byte |
| The same restore with a different wallet-sealing key | Workspace there, wallets **0**: the key has to survive too |

**Postgres 17, in its own container, on a named volume:**

| Step | What came back |
|---|---|
| Load the schema | 44 of 45 statements as they are. The search table needed translating |
| Copy every row in one transaction | All 24 tables identical to SQLite, row for row |
| Open the sealed wallets read from Postgres | 2 of 2 open, and still find their account |
| Prepare every store statement | 123 of 126 accepted as they are. The three refusals are named in section 4 |
| Delete the Postgres container, start a new one on the same volume | 24 of 24 identical, 2 of 2 seals open |
| Back up while it runs (`pg_dump`, Postgres's own backup, to a file outside) | A 34,741-byte backup with all 24 tables |
| Delete the container **and its volume**, start a fresh one on a new volume, restore (`pg_restore`) | 24 of 24 identical, 2 of 2 seals open |

**What the trial didn't do:**
- run the application itself on Postgres, since there's no Postgres store yet;
- test search on Postgres, since the test data had no search rows;
- copy anything off this machine.

**A backup isn't proven until a restore from it has been tried.** So the proposal includes a regular restore test, like the one above, run against the latest real backup into a throwaway container (choice D3).

## 7. Moving the system to another host, step by step

The other host could be a VPS (a rented server), another computer, or any machine that runs containers.

1. **Prepare the new host:**
   - a container runtime;
   - a firewall that lets in only what the server needs;
   - the same private network layout: one for the application, one for its database.
2. **Bring the image:** build it there from the same commit, or copy the image itself. It's the same image the current host runs, and nothing in it is tied to one machine (TGT-040).
3. **Bring the secrets, by a safe channel, never with the backups:**
   - the wallet-sealing key;
   - the database password.
4. **Freeze the old host:** pause sign-ins and writes, so nothing changes during the move.
5. **Take a final backup there:** `pg_dump` of the database, plus the posted-reading files.
6. **Restore on the new host:**
   - start Postgres on a new volume;
   - restore the backup into it (`pg_restore`);
   - copy the reading files to the application's volume.
7. **Start the application** with the connection address of the new Postgres, the same public address (`PETAL_API`) and the same secrets.
8. **Check before anyone uses it:**
   - health;
   - the row-for-row check against the old host;
   - a person's account, linked wallets and workspace read back through the API.
9. **Point the traffic at the new host:** the tunnel, or the address Vercel forwards to (Q7).
10. **Keep the old host as it was until the new one is confirmed,** then retire it, and wipe its disk.

**With Supabase later,** steps 5 and 6 happen once, into Supabase. After that, moving the application to another host is only steps 1 to 3 and 7 to 9, because the database doesn't move.

## 8. The choices

| # | Choice | Options | Lean, and why |
|---|---|---|---|
| D1 | Where Postgres runs for the hackathon | In its own container on the host · Supabase now | **Its own container on the host.** It's self-hosted and $0, as the brief asks. Supabase later is a change of address |
| D2 | Where the backups go: the database dump, the reading files, and later the continuous copies | Cloudflare R2, Cloudflare's file storage (an outside service with a free tier) · another machine the operator owns · an external drive (covers a dead internal disk, not a lost host) | **Off this machine:** another machine the operator owns, or R2 if one outside service for copies is acceptable. Encrypted either way, with the external drive as an extra copy. This is the one choice that decides whether TGT-010's "loss of a disk" is met |
| D3 | How often to back up, and to test a restore | A nightly dump, plus a restore test on a schedule · continuous copies (Postgres's own write-ahead-log archiving, sent off the machine as it happens) | **A nightly dump and a regular restore test first, continuous copies next.** A nightly dump can lose up to a day. Continuous copies lose seconds, and can go back to a moment before a mistake |
| D4 | The order of the change | The asynchronous store on SQLite first, then switch · the asynchronous store and the Postgres store together, then switch | **Together, then switch.** SQLite is only the starting point, so it doesn't need its own asynchronous version beyond what the tests use |
| D5 | Dates and JSON during the migration | Move them as text, as today · convert them now to Postgres's own date and JSON types | **Move as text.** One change at a time. Converting later is its own small migration |
| D6 | The posted-reading files | Files on the application's volume, in the backups · inside Postgres · in file storage | **Files on the volume, in the backups.** They never change once written, so they're easy to copy, and the database stays small |
| D7 | The wallet-sealing key | Only in the server's secrets · also in the operator's password manager | **Also in the password manager, never beside the backups.** Without it, a perfect restore can't find anyone's account |
| D8 | Search on Postgres | Full-text search with accent-folding (`unaccent`) · fuzzy matching on parts of words (`pg_trgm`) | **Full-text with accent-folding.** It's closest to today's search |

## What I checked, and what I didn't

**Checked:**
- In our code (main `e8cb7f3`): the store, its tables, how it opens the database, the session check, the wallet seal, the backup script, and the places that go around the store.
- In the trial: everything in section 6, which ran and is recorded.

**Not done:**
- the application running on Postgres;
- search on Postgres;
- copies off this machine;
- a restore with real data.

**Rough:** the count of about 180 store calls comes from a search, not a careful tally.

**Found along the way:** the snapshot route sends gzipped bytes without saying so. That's noted in `trial-database/RUN.md`. It isn't part of this proposal.

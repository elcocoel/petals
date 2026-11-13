# Contract: the website and its server

**Created**: 2026-11-08
**Status**: Proposed. It follows the leans in `../research.md`. Where a lean isn't chosen yet, the choice is named (C1 to C10).

## Who is who

| | The website | The server |
|---|---|---|
| **Where** | Vercel, at the site's address | A container. On one host for now, reached by Vercel at the server's own name through a tunnel (C9). Built as for any host |
| **Runs** | The Next.js pages | Today's app (C3): the HTTP API (`http-api.md`), `/mcp`, `/skill.md`, `/petal.mjs`, `/d/:hash` and `/s/:token` |
| **Holds** | Nothing private. No database, and no secret but the site key | Everything private, and the live hub (below) |
| **Settings** | `PETAL_SERVER` (the server's name), `PETAL_SITE_KEY` | `PETAL_API` (the website's address), `PETAL_PUBLIC=1`, `PETAL_SITE_KEY`, the data folder and the wallet-sealing key |

## What crosses the seam

| From | To | What | How |
|---|---|---|---|
| A browser | The website's address | Pages | Vercel serves them |
| A browser | The website's address | `/api/*`: reads, sign-in, the workspace, live updates | Vercel forwards it to the server (C2), with the visitor's address and the site key (C4) |
| A person's agent | The website's address | `/skill.md`, `/petal.mjs`, `/mcp`, the exploration routes, posted readings | Forwarded the same way. The agent only ever knows the one address (C1) |
| The website's page code | The server's name | The data for `/f/[id]`, `/gallery` and `/publish/[draft]` | HTTP from Vercel, with the site key, the visitor's address, and the visitor's cookie for the publish page (C6) |
| Anyone else | The server's name | Anything | Refused without the site key, except `/api/v1/health` (C4) |

The forwarded paths are exactly `/api/:path*`, `/mcp`, `/skill.md`, `/petal.mjs`, `/d/:hash` and `/s/:token`. Every other path is a page.

## What the server holds

- **`private.db`** (SQLite, written as if it were Postgres, C8). It holds:
  - people, and their wallet bindings, sealed under the wallet-sealing key
  - sessions and links, as hashes only
  - sign-in challenges
  - explorations, steps and notes
  - runs and their events
  - the spend ledger, and the daily counts
  - follows and workspace notes
  - the search index
  - the marks on posted readings
- **The snapshot files**: content-addressed `.json.gz` files, both read here before public mode and posted by people's agents.
- **What ships in the image**: the fixtures, and the copies of published map rows.
- **The live hub**, in memory. It tells open pages that an exploration changed. A restart empties it, and pages catch up when they reconnect.
- **Secrets**: the wallet-sealing key and the site key. As a public site, it holds no model key and no writer key.

## What the website holds

Pages, components and static files. In transit only, it handles the session cookie, which belongs to the website's address, as every page request carries it. It never stores the cookie or reads anything private.

## Sign-in across the seam

- **The cookie**: the session cookie is `__Host-petal_session`, on the website's address only, unchanged. The server sets it in its answer, and Vercel passes it back. That's to confirm in the spike (`../research.md`, section 5).
- **The origin check**: a sign-in POST must come from the website's origin, the same rule as today.
- **Under two addresses** (C1), all of this changes. See `../research.md`, C1.

## Live updates

- **The stream**: `GET /api/v1/explorations/:ref/live`, forwarded, with a heartbeat every 25 seconds (C5).
- **After a drop**: the browser reconnects, the first event says "changed", and the page reads again.
- **The fallback, if forwarding cuts streams**: a long poll at the same path, with `?wait=25`.

## Failure

- **The server is down**: pages still load, and the website says plainly that the records can't be reached. Agents can't work.
- **Vercel is down**: pages and agents are both down. That's the cost of one address.

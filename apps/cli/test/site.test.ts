// T405: petal as one file. The site door sends only the exploration tools and snapshots to the
// site; every other tool stays on the person's machine as it is.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { TOOLS_VERSION } from '@petal/core';
import { isToolError, type Tool, type ToolContext } from '@petal/tools';
import { describe, expect, test } from 'vitest';
import { nodeIsNew, siteOf } from '../src/file.ts';
import { LEFT_OUT, SITE_TOOLS, siteDoor, workerCurrentFile } from '../src/site.ts';

const SITE = 'https://petals.example';
const TOKEN = 'YVySpb9eOQx50-27nFFm4wRPn6a3OZq0yLTf5i61Y94';
const LINK = `${SITE}/s/${TOKEN}`;
const SNAP = 'a'.repeat(64);
const SPEC = { spec: 'spec/v1', snapshot: { sha256: SNAP, as_of: '2026-11-03T00:00:00Z' } };

interface Seen {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Uint8Array | string | null;
}

/** A site that answers from a table, and remembers what it was sent. */
function fakeSite(held: Set<string> = new Set()) {
  const seen: Seen[] = [];
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetch = async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const body = init.body ?? null;
    seen.push({
      method,
      url,
      headers: (init.headers ?? {}) as Record<string, string>,
      body: body as Seen['body'],
    });
    const path = url.slice(SITE.length);
    if (method === 'HEAD' && path.startsWith('/api/v1/snapshots/')) {
      return new Response(null, { status: held.has(path.split('/').pop() as string) ? 200 : 404 });
    }
    if (method === 'PUT') {
      held.add(path.split('/').pop() as string);
      return json({ sha256: SNAP, stored: true, origin: 'their_machine' });
    }
    if (method === 'POST' && path === '/api/v1/explorations') {
      return json({ exploration: 'exp_1', link: { url: LINK }, open_url: `${SITE}/make?x` });
    }
    if (method === 'POST' && path.endsWith('/steps')) {
      return json({
        exploration: 'exp_1',
        step: { seq: 0 },
        short_url: `${SITE}/d/${'b'.repeat(64)}`,
      });
    }
    if (method === 'POST' && path.endsWith('/notes')) return json({ note: { seq: 0 } });
    if (method === 'POST' && path === '/api/v1/agents/wait') {
      return json({
        job: { id: 'job_2', kind: 'map', title: 'Map Moloch', brief: 'Who?', inputs: {}, to: null },
        project: { exploration: `${SITE}/s/${TOKEN}`, question: 'who?' },
      });
    }
    if (method === 'POST' && path.endsWith('/jobs/take')) {
      return json({
        job: {
          id: 'job_1',
          kind: 'map',
          title: 'Map RaidGuild',
          brief: 'Who holds power in RaidGuild?',
          inputs: {},
        },
      });
    }
    if (method === 'POST' && /\/jobs\/[^/]+\/report$/.test(path))
      return json({ job: { id: 'job_1', status: 'done' } });
    if (method === 'GET' && path.endsWith('/jobs')) return json({ jobs: [] });
    if (method === 'GET' && path.startsWith('/api/v1/brain'))
      return json({ commit: 'c0ffee', path });
    if (method === 'POST' && path.endsWith('/layers'))
      return json({ hash: 'e'.repeat(64), version: { id: 'dsv_1', seq: 0 } });
    if (method === 'GET' && path.includes('/layers')) return json({ layers: [], versions: [] });
    if (method === 'POST' && path.endsWith('/datasets/fork'))
      return json({ version: { id: 'dsv_2' } });
    if (method === 'GET' && path.startsWith('/api/v1/explorations')) return json({ steps: [] });
    return json({ error: { code: 'not_found', message: 'no' } }, 404);
  };
  return { seen, fetch, held };
}

const tool = (name: string, run?: Tool<unknown, unknown>['run']): Tool<unknown, unknown> =>
  ({
    name,
    input: { type: 'object', required: name === 'start_exploration' ? [] : ['exploration'] },
    output: { type: 'object' },
    run: run ?? (async () => ({ local: name })),
  }) as unknown as Tool<unknown, unknown>;

const ctx = (gz: Uint8Array | null = new Uint8Array([1, 2, 3])) =>
  ({
    config: { root: '/nowhere' },
    store: { gz: async () => gz, get: async () => null },
  }) as unknown as ToolContext;

const registry = [
  ...SITE_TOOLS.map((n) => tool(n)),
  ...LEFT_OUT.map((n) => tool(n)),
  tool('find_target'),
  tool('add_layer', async () => ({ hash: 'e'.repeat(64), about: 'eip155:100:0xraid', rows: 1 })),
  tool('render_flower', async () => ({
    spec_sha256: 'b'.repeat(64),
    view_url: '/draft?spec=x',
    short_url: '/d/x',
    legend: [],
  })),
];

const byName = (tools: Tool<unknown, unknown>[], name: string) => {
  const t = tools.find((x) => x.name === name);
  if (!t) throw new Error(`no ${name}`);
  return t;
};

describe('what goes to the site, and what stays', () => {
  test("local tools are the registry's own; publishing and quotes are left out", () => {
    const tools = siteDoor({ site: SITE, fetch: fakeSite().fetch }).tools(registry);
    expect(byName(tools, 'find_target')).toBe(registry.find((t) => t.name === 'find_target'));
    for (const n of LEFT_OUT) expect(tools.some((t) => t.name === n)).toBe(false);
  });

  test('a local tool makes no request to the site', async () => {
    const site = fakeSite();
    const tools = siteDoor({ site: SITE, fetch: site.fetch }).tools(registry);
    await byName(tools, 'find_target').run({}, ctx());
    expect(site.seen).toEqual([]);
  });

  test('the exploration it started is the default, and exploration is no longer required', async () => {
    const site = fakeSite();
    const tools = siteDoor({ site: SITE, fetch: site.fetch }).tools(registry);
    expect((byName(tools, 'add_note').input as { required: string[] }).required).toEqual([]);
    await byName(tools, 'start_exploration').run({ question: 'q', client: 'Codex' }, ctx());
    await byName(tools, 'add_note').run({ text: 'hello' }, ctx());
    const note = site.seen.at(-1) as Seen;
    expect(note.url).toBe(`${SITE}/api/v1/explorations/${TOKEN}/notes`);
    expect(JSON.parse(note.body as string)).toEqual({ text: 'hello' });
    expect(JSON.parse(site.seen[0]?.body as string)).toEqual({ question: 'q', client: 'Codex' });
  });

  test('with no exploration, a write says to start one and sends nothing', async () => {
    const site = fakeSite();
    const tools = siteDoor({ site: SITE, fetch: site.fetch }).tools(registry);
    const out = (await byName(tools, 'add_note').run({ text: 'x' }, ctx())) as {
      error: { code: string; hint: string };
    };
    expect(out.error.code).toBe('bad_input');
    expect(out.error.hint).toMatch(/start_exploration/);
    expect(site.seen).toEqual([]);
  });

  test('the CLI keeps the last one in a file, for the next command', async () => {
    const currentFile = join(mkdtempSync(join(tmpdir(), 'petal-site-')), 'current.json');
    const site = fakeSite();
    const first = siteDoor({ site: SITE, fetch: site.fetch, currentFile }).tools(registry);
    await byName(first, 'start_exploration').run({ question: 'q' }, ctx());
    const next = siteDoor({ site: SITE, fetch: site.fetch, currentFile }).tools(registry);
    await byName(next, 'get_exploration').run({}, ctx());
    expect(site.seen.at(-1)?.url).toBe(`${SITE}/api/v1/explorations/${TOKEN}`);
  });
});

describe('a flower read on this machine goes to the page with its reading', () => {
  test('a snapshot the site lacks is put under the exploration, gzipped, then the step', async () => {
    const site = fakeSite();
    const tools = siteDoor({ site: SITE, fetch: site.fetch }).tools(registry);
    const gz = new Uint8Array([31, 139, 8]);
    const out = (await byName(tools, 'save_step').run(
      { exploration: LINK, spec: SPEC, note: 'n' },
      ctx(gz),
    )) as { short_url: string };
    expect(site.seen.map((s) => `${s.method} ${s.url.slice(SITE.length)}`)).toEqual([
      `HEAD /api/v1/snapshots/${SNAP}`,
      `PUT /api/v1/explorations/${TOKEN}/snapshots/${SNAP}`,
      `POST /api/v1/explorations/${TOKEN}/steps`,
    ]);
    const put = site.seen[1] as Seen;
    expect(put.headers['content-encoding']).toBe('gzip');
    expect(put.body).toEqual(gz);
    expect(JSON.parse(site.seen[2]?.body as string)).toEqual({ spec: SPEC, note: 'n' });
    expect(out.short_url).toMatch(/^https:\/\/petals\.example\/d\//);
  });

  test('a spec not drawn here, such as a published flower, is left to the site to find', async () => {
    const site = fakeSite();
    const tools = siteDoor({ site: SITE, fetch: site.fetch }).tools(registry);
    const c = {
      config: { root: mkdtempSync(join(tmpdir(), 'petal-site-')) },
      store: { gz: async () => null, get: async () => null },
    } as unknown as ToolContext;
    await byName(tools, 'save_step').run({ exploration: LINK, spec_sha256: SNAP }, c);
    expect(site.seen.map((s) => `${s.method} ${s.url.slice(SITE.length)}`)).toEqual([
      `POST /api/v1/explorations/${TOKEN}/steps`,
    ]);
    expect(JSON.parse(site.seen[0]?.body as string)).toEqual({ spec_sha256: SNAP });
  });

  test('a snapshot the site holds is not sent, and is checked once a process', async () => {
    const site = fakeSite(new Set([SNAP]));
    const tools = siteDoor({ site: SITE, fetch: site.fetch }).tools(registry);
    await byName(tools, 'save_step').run({ exploration: LINK, spec: SPEC }, ctx());
    await byName(tools, 'save_step').run({ exploration: LINK, spec: SPEC }, ctx());
    expect(site.seen.map((s) => s.method)).toEqual(['HEAD', 'POST', 'POST']);
  });

  test('the snapshot from the store is the canonical body when no .gz is kept', async () => {
    const site = fakeSite();
    const tools = siteDoor({ site: SITE, fetch: site.fetch }).tools(registry);
    const snapshot = { b: 1, a: 2 };
    const c = {
      config: { root: '/nowhere' },
      store: { gz: async () => null, get: async () => snapshot },
    } as unknown as ToolContext;
    await byName(tools, 'save_step').run({ exploration: LINK, spec: SPEC }, c);
    const put = site.seen.find((s) => s.method === 'PUT') as Seen;
    expect(gunzipSync(put.body as Uint8Array).toString('utf8')).toBe('{"a":2,"b":1}');
  });
});

describe('render_flower', () => {
  test('with no exploration: drawn here, no link that would open nothing, and why', async () => {
    const site = fakeSite();
    const tools = siteDoor({ site: SITE, fetch: site.fetch }).tools(registry);
    const out = (await byName(tools, 'render_flower').run({ spec: SPEC }, ctx())) as Record<
      string,
      unknown
    >;
    expect(out.view_url).toBeUndefined();
    expect(out.short_url).toBeUndefined();
    expect(out.next).toMatch(/start_exploration/);
    expect(site.seen).toEqual([]);
  });

  test("with one: the step is saved, and the links are the site's", async () => {
    const site = fakeSite(new Set([SNAP]));
    const tools = siteDoor({ site: SITE, fetch: site.fetch }).tools(registry);
    await byName(tools, 'start_exploration').run({ question: 'q' }, ctx());
    const out = (await byName(tools, 'render_flower').run({ spec: SPEC }, ctx())) as Record<
      string,
      unknown
    >;
    expect(out.view_url).toBe(`${SITE}/d/${'b'.repeat(64)}`);
    expect(out.short_url).toBe(out.view_url);
    expect(out.saved_step).toBe(0);
    const step = site.seen.at(-1) as Seen;
    expect(JSON.parse(step.body as string)).toEqual({ spec: SPEC });
  });

  test('a site that is down is said in a line, and the drawing still comes back', async () => {
    const up = fakeSite();
    let down = false;
    const tools = siteDoor({
      site: SITE,
      fetch: async (url, init) => {
        if (down) throw new Error('ECONNREFUSED');
        return up.fetch(url, init);
      },
    }).tools(registry);
    await byName(tools, 'start_exploration').run({ question: 'q' }, ctx());
    down = true;
    const out = (await byName(tools, 'render_flower').run({ spec: SPEC }, ctx())) as Record<
      string,
      unknown
    >;
    expect(out.spec_sha256).toBe('b'.repeat(64));
    expect(out.next).toMatch(/didn't take it/);
  });

  test('a site error keeps its code and carries tools_version', async () => {
    const tools = siteDoor({
      site: SITE,
      fetch: async () => {
        throw new Error('ECONNREFUSED');
      },
    }).tools(registry);
    const out = (await byName(tools, 'start_exploration').run({ question: 'q' }, ctx())) as {
      error: { code: string };
      tools_version: string;
    };
    expect(out.error.code).toBe('source_failed');
    expect(out.tools_version).toBe(TOOLS_VERSION);
  });
});

describe('the file itself', () => {
  test('knows its site from PETALS_SITE when nothing was written in', () => {
    expect(siteOf({})).toBeUndefined();
    expect(siteOf({ PETALS_SITE: 'https://x.example/' })).toBe('https://x.example');
  });

  test('needs node:sqlite without a flag', () => {
    expect(nodeIsNew('22.12.0')).toBe(false);
    expect(nodeIsNew('22.13.0')).toBe(true);
    expect(nodeIsNew('24.14.0')).toBe(true);
    expect(nodeIsNew('20.19.0')).toBe(false);
  });
});

// Elco, 9 Nov (B with C): the page's agent hands jobs out in a project, and the person's own agent
// takes one, does it on their machine and reports back. The project is reached by its link.
describe('jobs from the page’s agent', () => {
  test('take_job claims the next job in the project the agent is in', async () => {
    const site = fakeSite();
    const tools = siteDoor({ site: SITE, fetch: site.fetch, initial: LINK }).tools(registry);
    expect((byName(tools, 'take_job').input as { required: string[] }).required).toEqual([]);
    const out = (await byName(tools, 'take_job').run({}, ctx())) as { job: { id: string } };
    expect(out.job.id).toBe('job_1');
    const sent = site.seen.at(-1) as Seen;
    expect(sent.method).toBe('POST');
    expect(sent.url).toBe(`${SITE}/api/v1/explorations/${TOKEN}/jobs/take`);
    expect(JSON.parse(sent.body as string)).toEqual({});
  });

  test("with the person's agent key, take_job takes their next job now, and keeps its project", async () => {
    const site = fakeSite();
    const tools = siteDoor({ site: SITE, fetch: site.fetch }).tools(registry);
    const key = `petal_agent_${'a'.repeat(43)}`;
    const out = (await byName(tools, 'take_job').run(
      { agent_key: key, as: 'claude-app' },
      ctx(),
    )) as {
      link: string;
      job: { id: string };
    };
    expect(out).toMatchObject({ link: `${SITE}/s/${TOKEN}`, job: { id: 'job_2' } });
    const sent = site.seen.at(-1) as Seen;
    expect(sent.url).toBe(`${SITE}/api/v1/agents/wait`);
    expect(sent.headers.authorization).toBe(`Bearer ${key}`);
    expect(JSON.parse(sent.body as string)).toEqual({ as: 'claude-app', wait_s: 0 });
    // the job's project is the one the next calls go to
    await byName(tools, 'report_job').run({ job: 'job_2', result: { summary: 'Done.' } }, ctx());
    expect((site.seen.at(-1) as Seen).url).toBe(
      `${SITE}/api/v1/explorations/${TOKEN}/jobs/job_2/report`,
    );
  });

  test('report_job sends the result to that job, without the link or the id in the body', async () => {
    const site = fakeSite();
    const tools = siteDoor({ site: SITE, fetch: site.fetch }).tools(registry);
    const result = { summary: 'Three members hold most of the shares.', steps: [0, 1] };
    await byName(tools, 'report_job').run({ exploration: LINK, job: 'job_1', result }, ctx());
    const sent = site.seen.at(-1) as Seen;
    expect(sent.url).toBe(`${SITE}/api/v1/explorations/${TOKEN}/jobs/job_1/report`);
    expect(JSON.parse(sent.body as string)).toEqual({ result });
    await byName(tools, 'report_job').run(
      { exploration: LINK, job: 'job_1', failed: 'No data' },
      ctx(),
    );
    expect(JSON.parse((site.seen.at(-1) as Seen).body as string)).toEqual({ failed: 'No data' });
  });

  test('list_jobs reads the project’s jobs from the site, not this machine', async () => {
    const site = fakeSite();
    const tools = siteDoor({ site: SITE, fetch: site.fetch, initial: LINK }).tools(registry);
    expect(await byName(tools, 'list_jobs').run({}, ctx())).toMatchObject({ jobs: [] });
    expect((site.seen.at(-1) as Seen).url).toBe(`${SITE}/api/v1/explorations/${TOKEN}/jobs`);
  });

  test('without a project, or without the job’s id, nothing is sent', async () => {
    const site = fakeSite();
    const tools = siteDoor({ site: SITE, fetch: site.fetch }).tools(registry);
    expect(isToolError(await byName(tools, 'take_job').run({}, ctx()))).toBe(true);
    expect(isToolError(await byName(tools, 'report_job').run({ exploration: LINK }, ctx()))).toBe(
      true,
    );
    expect(site.seen).toEqual([]);
  });

  test('the brain comes from the site, which holds the latest, with its commit', async () => {
    const site = fakeSite();
    const tools = siteDoor({ site: SITE, fetch: site.fetch }).tools(registry);
    const route = (await byName(tools, 'brain_route').run(
      { question: 'who controls this treasury', answers: ['sharesToken()', 'lootToken()'] },
      ctx(),
    )) as { commit: string };
    expect(route.commit).toBe('c0ffee');
    const url = new URL((site.seen.at(-1) as Seen).url);
    expect(url.pathname).toBe('/api/v1/brain/route');
    expect(url.searchParams.get('q')).toBe('who controls this treasury');
    expect(url.searchParams.get('answers')).toBe('sharesToken(),lootToken()');
    await byName(tools, 'brain_file').run({ id: 'where-power-lives' }, ctx());
    expect((site.seen.at(-1) as Seen).url).toBe(`${SITE}/api/v1/brain/files/where-power-lives`);
    await byName(tools, 'brain_index').run({}, ctx());
    expect((site.seen.at(-1) as Seen).url).toBe(`${SITE}/api/v1/brain`);
  });

  test('add_layer keeps the layer here, then in the open project on the site too', async () => {
    const site = fakeSite();
    const tools = siteDoor({ site: SITE, fetch: site.fetch, initial: LINK }).tools(registry);
    const layer = { petal: 'layer/v1', about: 'eip155:100:0xraid' };
    const out = (await byName(tools, 'add_layer').run({ layer }, ctx())) as Record<string, unknown>;
    expect(out).toMatchObject({ hash: 'e'.repeat(64), kept_on_site: { version: { id: 'dsv_1' } } });
    const sent = site.seen.at(-1) as Seen;
    expect(sent.url).toBe(`${SITE}/api/v1/explorations/${TOKEN}/layers`);
    expect(JSON.parse(sent.body as string)).toEqual({ layer });
  });

  test('with no project open, add_layer keeps it here only, and says so', async () => {
    const site = fakeSite();
    const tools = siteDoor({ site: SITE, fetch: site.fetch }).tools(registry);
    const out = (await byName(tools, 'add_layer').run({ layer: {} }, ctx())) as Record<
      string,
      unknown
    >;
    expect(out.next).toMatch(/start_exploration/);
    expect(site.seen).toEqual([]);
  });

  test('list_layers and fork_dataset go to the project on the site', async () => {
    const site = fakeSite();
    const tools = siteDoor({ site: SITE, fetch: site.fetch, initial: LINK }).tools(registry);
    await byName(tools, 'list_layers').run({ about: 'eip155:100:0xraid' }, ctx());
    expect((site.seen.at(-1) as Seen).url).toBe(
      `${SITE}/api/v1/explorations/${TOKEN}/layers?about=eip155%3A100%3A0xraid`,
    );
    await byName(tools, 'fork_dataset').run({ version: 'dsv_1', drop: ['e'.repeat(64)] }, ctx());
    const sent = site.seen.at(-1) as Seen;
    expect(sent.url).toBe(`${SITE}/api/v1/explorations/${TOKEN}/datasets/fork`);
    expect(JSON.parse(sent.body as string)).toEqual({ version: 'dsv_1', drop: ['e'.repeat(64)] });
  });
});

// Elco's glasses rule, 10 Nov: a job brings the person's view, and every flower drawn for it goes
// through that view, in the CLI (one process per command) and in an MCP session alike.
describe("a job's flowers are drawn as the person sees them", () => {
  const VIEW = { petal: 'view/v1', color: { data: 'kind' } };
  const withView = () => {
    const site = fakeSite();
    const fetch = async (url: string, init: RequestInit = {}) => {
      const res = await site.fetch(url, init);
      const path = url.slice(SITE.length);
      if (
        (init.method ?? 'GET') === 'POST' &&
        (path === '/api/v1/agents/wait' || path.endsWith('/jobs/take'))
      ) {
        const body = (await res.json()) as Record<string, unknown>;
        return new Response(JSON.stringify({ ...body, view: VIEW }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      return res;
    };
    return { ...site, fetch };
  };
  /** render_flower that answers with the view it was given */
  const seenView = tool('render_flower', async (i) => ({
    spec_sha256: 'b'.repeat(64),
    legend: [],
    drawn_with: (i as { view?: unknown }).view ?? null,
  }));
  const reg = [...registry.filter((t) => t.name !== 'render_flower'), seenView];
  const draw = (tools: Tool<unknown, unknown>[]) =>
    byName(tools, 'render_flower').run({ spec: SPEC } as never, ctx()) as Promise<
      Record<string, unknown>
    >;

  test('take_job by agent key keeps the view, and render_flower draws with it', async () => {
    const tools = siteDoor({ site: SITE, fetch: withView().fetch }).tools(reg);
    const taken = (await byName(tools, 'take_job').run(
      { agent_key: 'petal_agent_x', as: 'claude-code' } as never,
      ctx(),
    )) as Record<string, unknown>;
    expect(taken.view).toEqual(VIEW);
    expect((await draw(tools)).drawn_with).toEqual(VIEW);
  });

  test("take_job by a project's link keeps it too; a view the call names wins", async () => {
    const tools = siteDoor({ site: SITE, fetch: withView().fetch }).tools(reg);
    await byName(tools, 'take_job').run({ exploration: LINK } as never, ctx());
    expect((await draw(tools)).drawn_with).toEqual(VIEW);
    const own = { petal: 'view/v1', color: { data: 'stake' } };
    const out = (await byName(tools, 'render_flower').run(
      { spec: SPEC, view: own } as never,
      ctx(),
    )) as Record<string, unknown>;
    expect(out.drawn_with).toEqual(own);
  });

  test('a new conversation leaves the job and its view behind', async () => {
    const tools = siteDoor({ site: SITE, fetch: withView().fetch }).tools(reg);
    await byName(tools, 'take_job').run({ exploration: LINK } as never, ctx());
    await byName(tools, 'start_exploration').run(
      { question: 'q', client: 'Codex' } as never,
      ctx(),
    );
    expect((await draw(tools)).drawn_with).toBeNull();
  });

  test('jobs wait, in a shell, hands its view to a running MCP session through the file', async () => {
    const { writeFileSync } = await import('node:fs');
    const currentFile = join(mkdtempSync(join(tmpdir(), 'petal-view-')), 'current.json');
    const tools = siteDoor({ site: SITE, fetch: withView().fetch, currentFile }).tools(reg);
    // the session started its own conversation first
    await byName(tools, 'start_exploration').run(
      { question: 'q', client: 'Claude Code' } as never,
      ctx(),
    );
    expect((await draw(tools)).drawn_with).toBeNull();
    // then `jobs wait`, another process, wrote the job's project and view a moment later
    await new Promise((r) => setTimeout(r, 15));
    writeFileSync(currentFile, `${JSON.stringify({ link: LINK, view: VIEW })}\n`);
    expect((await draw(tools)).drawn_with).toEqual(VIEW);
  });
});

// What an agent finds about accounts goes into the project as data (annotation-layer.md step 4): through
// the site, never only on this machine, with the job's project and the worker's name filled in.
describe('annotations go to the project on the site', () => {
  const CLAIM = {
    subject: 'eip155:100:0x0000000000000000000000000000000000000001',
    verb: 'named',
    object: { value: 'Example Member' },
    kind: 'sourced',
    evidence: [{ url: 'https://example.org/proposal/1' }],
  };
  const answering = () => {
    const site = fakeSite();
    const fetch = async (url: string, init: RequestInit = {}) => {
      const path = url.slice(SITE.length);
      if (path.includes('/annotations')) {
        site.seen.push({
          method: init.method ?? 'GET',
          url,
          headers: {},
          body: (init.body as string) ?? null,
        });
        return new Response(
          JSON.stringify({ exploration: 'exp_1', added: 1, existed: 0, ids: ['c'.repeat(64)] }),
          {
            headers: { 'content-type': 'application/json' },
          },
        );
      }
      return site.fetch(url, init);
    };
    return { ...site, fetch };
  };

  test("a batch goes to the job's project, said by the name the worker joined with", async () => {
    const { writeFileSync } = await import('node:fs');
    const currentFile = join(mkdtempSync(join(tmpdir(), 'petal-annot-')), 'current.json');
    writeFileSync(currentFile, `${JSON.stringify({ link: LINK, as: 'codex' })}\n`);
    const site = answering();
    const tools = siteDoor({ site: SITE, fetch: site.fetch, currentFile }).tools(
      registry.concat([tool('add_annotation'), tool('list_annotations')]),
    );
    const out = (await byName(tools, 'add_annotation').run(
      { annotations: [CLAIM, CLAIM] } as never,
      ctx(),
    )) as Record<string, unknown>;
    expect(out.ids).toHaveLength(1);
    const sent = site.seen.find((x) => x.url.endsWith('/annotations'));
    expect(sent?.method).toBe('POST');
    expect(sent?.url).toBe(`${SITE}/api/v1/explorations/${TOKEN}/annotations`);
    expect(JSON.parse(sent?.body as string)).toEqual({ annotations: [CLAIM, CLAIM], as: 'codex' });
  });

  test('a name the call gives wins; listing asks the same project, about one account', async () => {
    const site = answering();
    const tools = siteDoor({ site: SITE, fetch: site.fetch, initial: LINK }).tools(
      registry.concat([tool('add_annotation'), tool('list_annotations')]),
    );
    await byName(tools, 'add_annotation').run(
      { annotations: [CLAIM], as: 'claude-code' } as never,
      ctx(),
    );
    expect(JSON.parse(site.seen.at(-1)?.body as string).as).toBe('claude-code');
    await byName(tools, 'list_annotations').run({ about: CLAIM.subject } as never, ctx());
    expect(site.seen.at(-1)?.url).toBe(
      `${SITE}/api/v1/explorations/${TOKEN}/annotations?about=${encodeURIComponent(CLAIM.subject)}`,
    );
  });
});

// Swarm step 3: a job stopped or handed over from the page. The worker's next call through its link is
// refused with why; petal.mjs forgets that project and says to wait again, as this worker.
describe('a job that ended under the worker', () => {
  const refusing = (ended: 'stopped' | 'handed_over') => {
    const site = fakeSite();
    const fetch = async (url: string, init: RequestInit = {}) => {
      if (url.includes(`/explorations/${TOKEN}/`)) {
        const message =
          ended === 'stopped'
            ? 'This job was stopped: report nothing, and run jobs wait for your next one.'
            : 'This job was handed to another worker: report nothing, and run jobs wait for your next one.';
        return new Response(JSON.stringify({ error: { code: 'unauthorised', message, ended } }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        });
      }
      return site.fetch(url, init);
    };
    return { ...site, fetch };
  };
  const inJob = async () => {
    const { writeFileSync } = await import('node:fs');
    const currentFile = join(mkdtempSync(join(tmpdir(), 'petal-ended-')), 'current.json');
    writeFileSync(
      currentFile,
      `${JSON.stringify({ link: LINK, as: 'codex', worker: 'k3m9qa' })}\n`,
    );
    return currentFile;
  };

  test('stopped: the project is forgotten, and next says to wait again as this worker', async () => {
    const { readFileSync } = await import('node:fs');
    const currentFile = await inJob();
    const tools = siteDoor({ site: SITE, fetch: refusing('stopped').fetch, currentFile }).tools(
      registry,
    );
    const out = (await byName(tools, 'add_note').run({ text: 'step 2' } as never, ctx())) as Record<
      string,
      unknown
    >;
    expect(isToolError(out as never)).toBe(true);
    expect(out.next).toBe(
      'This job was stopped: report nothing, and run jobs wait for your next one. Run node ~/.petals/petal.mjs jobs wait --worker k3m9qa now.',
    );
    expect(JSON.parse(readFileSync(currentFile, 'utf8'))).toEqual({});
    // nothing more goes to that project
    const drawn = (await byName(tools, 'render_flower').run(
      { spec: SPEC } as never,
      ctx(),
    )) as Record<string, unknown>;
    expect(drawn.next).toMatch(/start_exploration first/);
  });

  test('handed over: the same, with its own words', async () => {
    const currentFile = await inJob();
    const tools = siteDoor({ site: SITE, fetch: refusing('handed_over').fetch, currentFile }).tools(
      registry,
    );
    const out = (await byName(tools, 'report_job').run(
      { job: 'job_1', result: { summary: 'x' } } as never,
      ctx(),
    )) as Record<string, unknown>;
    expect(out.next).toMatch(/^This job was handed to another worker.* --worker k3m9qa now\.$/);
  });

  test("a refusal for another project leaves this worker's project alone", async () => {
    const { readFileSync } = await import('node:fs');
    const currentFile = await inJob();
    const other = `${SITE}/s/${'Z'.repeat(43)}`;
    const site = refusing('stopped');
    const fetch = async (url: string, init: RequestInit = {}) =>
      url.includes('/explorations/ZZZZ')
        ? new Response(
            JSON.stringify({
              error: { code: 'unauthorised', message: 'stopped', ended: 'stopped' },
            }),
            {
              status: 403,
              headers: { 'content-type': 'application/json' },
            },
          )
        : site.fetch(url, init);
    const tools = siteDoor({ site: SITE, fetch, currentFile }).tools(registry);
    await byName(tools, 'add_note').run({ text: 'x', exploration: other } as never, ctx());
    expect(JSON.parse(readFileSync(currentFile, 'utf8')).link).toBe(LINK);
  });
});

describe('several workers on one computer, each with its own job (swarm.md step 5)', () => {
  const A = 'A'.repeat(43);
  const B = 'B'.repeat(43);
  const PAGE = `${SITE}/s/${'P'.repeat(43)}`;
  const VIEW_A = { petal: 'view/v2', color: { data: 'kind' } };
  const VIEW_B = { petal: 'view/v2', color: { data: 'role' } };
  /** The person's own conversation in the current file, older, and two workers each holding a job. */
  const twoJobs = async () => {
    const { mkdirSync, utimesSync, writeFileSync } = await import('node:fs');
    const currentFile = join(mkdtempSync(join(tmpdir(), 'petal-workers-')), 'current.json');
    writeFileSync(currentFile, `${JSON.stringify({ link: PAGE })}\n`);
    utimesSync(currentFile, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000));
    const held = (worker: string, token: string, view: object, as: string) => {
      const file = workerCurrentFile(currentFile, worker);
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, `${JSON.stringify({ link: `${SITE}/s/${token}`, view, as, worker })}\n`);
      return file;
    };
    return {
      currentFile,
      a: held('w1', A, VIEW_A, 'claude-code'),
      b: held('w2', B, VIEW_B, 'codex'),
    };
  };
  const drawing = () => {
    const got: unknown[] = [];
    const render = tool('render_flower', async (input) => {
      got.push(input);
      return { spec_sha256: 'b'.repeat(64), view_url: '/draft?spec=x', short_url: '/d/x' };
    });
    return { got, reg: [...registry.filter((t) => t.name !== 'render_flower'), render] };
  };
  const answering = () => {
    const site = fakeSite();
    const fetch = async (url: string, init: RequestInit = {}) => {
      if (!url.includes('/annotations')) return site.fetch(url, init);
      site.seen.push({
        method: init.method ?? 'GET',
        url,
        headers: {},
        body: (init.body as string) ?? null,
      });
      return new Response(JSON.stringify({ ids: ['c'.repeat(64)] }), {
        headers: { 'content-type': 'application/json' },
      });
    };
    return { ...site, fetch };
  };

  test("a call that names its job's project goes there, with that worker's view and name", async () => {
    const { currentFile } = await twoJobs();
    const site = answering();
    const d = drawing();
    const tools = siteDoor({ site: SITE, fetch: site.fetch, currentFile }).tools(d.reg);
    const drawn = (await byName(tools, 'render_flower').run(
      { spec: SPEC, exploration: `${SITE}/s/${B}` } as never,
      ctx(),
    )) as Record<string, unknown>;
    expect(isToolError(drawn as never)).toBe(false);
    // drawn here as B's job sees it, without the project, and saved in B's project
    expect(d.got).toEqual([{ spec: SPEC, view: VIEW_B }]);
    expect(site.seen.some((s) => s.url.endsWith(`/explorations/${B}/steps`))).toBe(true);
    await byName(tools, 'add_annotation').run(
      { exploration: `${SITE}/s/${A}`, annotations: [] } as never,
      ctx(),
    );
    const said = site.seen.find((s) => s.url.endsWith(`/explorations/${A}/annotations`));
    expect(JSON.parse(said?.body as string).as).toBe('claude-code');
  });

  test("a call that names no project can't tell whose, so it says to name it and sends nothing", async () => {
    const { currentFile } = await twoJobs();
    const site = fakeSite();
    const d = drawing();
    const tools = siteDoor({ site: SITE, fetch: site.fetch, currentFile }).tools(d.reg);
    for (const [name, input] of [
      ['add_note', { text: 'step 2' }],
      ['render_flower', { spec: SPEC }],
      ['add_layer', { layer: {} }],
    ] as const) {
      const out = (await byName(tools, name).run(input as never, ctx())) as {
        error?: { message: string; hint: string };
      };
      expect(out.error?.message).toBe(
        'Several workers hold jobs on this computer, so this needs to know whose.',
      );
      expect(out.error?.hint).toMatch(/as exploration \(--exploration on a command\)/);
    }
    expect(d.got).toEqual([]);
    expect(site.seen).toEqual([]);
  });

  test('a report frees its worker, and then the one job left takes the calls that name none', async () => {
    const { existsSync } = await import('node:fs');
    const { currentFile, a, b } = await twoJobs();
    const site = fakeSite();
    const tools = siteDoor({ site: SITE, fetch: site.fetch, currentFile }).tools(registry);
    await byName(tools, 'report_job').run(
      { exploration: `${SITE}/s/${A}`, job: 'job_1', result: { summary: 'x' } } as never,
      ctx(),
    );
    expect(existsSync(a)).toBe(false);
    expect(existsSync(b)).toBe(true);
    await byName(tools, 'add_note').run({ text: 'found 40 names' } as never, ctx());
    expect(site.seen.at(-1)?.url).toBe(`${SITE}/api/v1/explorations/${B}/notes`);
  });

  test("a job stopped under one worker: each of its sub-agents hears that worker named, and the other's job is left", async () => {
    const { existsSync, readFileSync } = await import('node:fs');
    const { currentFile, a, b } = await twoJobs();
    const site = fakeSite();
    const fetch = async (url: string, init: RequestInit = {}) =>
      url.includes(`/explorations/${A}/`)
        ? new Response(
            JSON.stringify({
              error: { code: 'unauthorised', message: 'This job was stopped.', ended: 'stopped' },
            }),
            { status: 403, headers: { 'content-type': 'application/json' } },
          )
        : site.fetch(url, init);
    // w1's sub-agents, each its own process, calling after the stop
    for (const text of ['first', 'second']) {
      const tools = siteDoor({ site: SITE, fetch, currentFile }).tools(registry);
      const out = (await byName(tools, 'add_note').run(
        { text, exploration: `${SITE}/s/${A}` } as never,
        ctx(),
      )) as Record<string, unknown>;
      expect(out.next).toBe(
        'This job was stopped. Run node ~/.petals/petal.mjs jobs wait --worker w1 now.',
      );
    }
    expect(JSON.parse(readFileSync(a, 'utf8'))).toMatchObject({ worker: 'w1', ended: 'stopped' });
    expect(existsSync(b)).toBe(true);
    // the stopped job isn't held any more: a call that names none goes to the one job left
    const tools = siteDoor({ site: SITE, fetch, currentFile }).tools(registry);
    await byName(tools, 'add_note').run({ text: 'found 40 names' } as never, ctx());
    expect(site.seen.at(-1)?.url).toBe(`${SITE}/api/v1/explorations/${B}/notes`);
    // the person's own conversation is left as it was
    expect(JSON.parse(readFileSync(currentFile, 'utf8')).link).toBe(PAGE);
  });
});

describe("the map's search goes to the site (SEARCH, #105)", () => {
  test('search_petals asks GET /api/v1/search with q, kinds and limit, and runs nothing here', async () => {
    const site = fakeSite();
    const fetch = async (url: string, init: RequestInit = {}) => {
      if (url.includes('/api/v1/search')) {
        site.seen.push({ method: init.method ?? 'GET', url, headers: {}, body: null });
        return new Response(
          JSON.stringify({ meaning: 'on', results: [{ kind: 'organisation', id: 'x' }] }),
          {
            headers: { 'content-type': 'application/json' },
          },
        );
      }
      return site.fetch(url, init);
    };
    let ranHere = false;
    const local = tool('search_petals', async () => {
      ranHere = true;
      return { results: [] };
    });
    const tools = siteDoor({ site: SITE, fetch }).tools([...registry, local]);
    const out = (await byName(tools, 'search_petals').run(
      { q: 'Gnars', kinds: ['organisation', 'proposal'], limit: 5 } as never,
      ctx(),
    )) as { meaning: string; results: unknown[] };
    expect(ranHere).toBe(false);
    expect(out).toMatchObject({ meaning: 'on', results: [{ kind: 'organisation' }] });
    expect(site.seen.at(-1)?.url).toBe(
      `${SITE}/api/v1/search?q=Gnars&kinds=organisation%2Cproposal&limit=5`,
    );
  });
});

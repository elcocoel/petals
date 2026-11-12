// Open calls, read keyless (Elco, 12 Nov: "open calls is the most useful ... let's bias towards keyless"):
// each source's open calls as calls/v1, every field as the source says it. A source that doesn't answer
// throws, so its calls already kept stay as they were (research/treasury-2026-11-12.md, section 3).
import type { Call, CallKind } from '@petal/core';
import type { Fetch } from '../marks/lists.ts';
import { nsToIso, type RpcPool } from '../rpc/pool.ts';

export const KARMA_PROGRAMS = 'https://gapapi.karmahq.xyz/v2/program-registry/search';
export const INFRASTRUCTURE_COMMITTEE = 'infrastructure-committee.near';

/** A public http(s) address, or null: a source's own words can name a site without one. */
function httpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** A date-time as said, or null when there's none or it isn't one. */
function isoOrNull(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

const text = (raw: unknown): string | null =>
  typeof raw === 'string' && raw.trim() ? raw.trim() : typeof raw === 'number' ? String(raw) : null;

const KARMA_KINDS: Record<string, CallKind> = {
  grant: 'grants',
  hackathon: 'hackathon',
  bounty: 'bounty',
  accelerator: 'accelerator',
  vc_fund: 'fund',
  rfp: 'rfp',
};

interface KarmaProgram {
  programId?: string | number;
  type?: string;
  name?: string;
  isActive?: boolean;
  deadline?: string | null;
  submissionUrl?: string | null;
  communities?: { name?: string }[];
  metadata?: {
    title?: string;
    shortDescription?: string;
    status?: string;
    startsAt?: string;
    endsAt?: string;
    organizations?: unknown[];
    programBudget?: unknown;
    website?: string;
    socialLinks?: { grantsSite?: string };
  };
}

/**
 * Karma's program registry, the active programs: grants programs, RFPs, bounties, hackathons, accelerators
 * and funds across ecosystems. Only the fields calls/v1 names are kept (its records also hold people's emails).
 */
export async function karmaCalls(fetchImpl: Fetch, readAt: string): Promise<Call[]> {
  const out: Call[] = [];
  for (let page = 1; ; page++) {
    const url = `${KARMA_PROGRAMS}?status=active&limit=100&page=${page}`;
    const res = await fetchImpl(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`${KARMA_PROGRAMS} answered ${res.status}`);
    const body = (await res.json()) as { programs?: KarmaProgram[]; hasNext?: boolean };
    for (const p of body.programs ?? []) {
      const m = p.metadata ?? {};
      const id = text(p.programId);
      const title = text(m.title) ?? text(p.name);
      if (!id || !title) continue;
      const org = (m.organizations ?? []).map(text).find(Boolean);
      out.push({
        petal: 'calls/v1',
        id: `karma:${id}`,
        kind: KARMA_KINDS[p.type ?? ''] ?? 'other',
        title,
        summary: text(m.shortDescription),
        offered_by: {
          name: (p.communities ?? []).map((c) => text(c.name)).find(Boolean) ?? org ?? title,
          about: null,
        },
        budget: text(m.programBudget),
        opens: isoOrNull(m.startsAt),
        closes: isoOrNull(p.deadline) ?? isoOrNull(m.endsAt),
        status: text(m.status) ?? (p.isActive ? 'active' : null),
        link:
          httpUrl(p.submissionUrl) ??
          httpUrl(m.socialLinks?.grantsSite) ??
          httpUrl(m.website) ??
          `https://www.karmahq.org/funding-map?programId=${encodeURIComponent(id)}`,
        source: { name: 'karma', ref: `${KARMA_PROGRAMS}?status=active`, read_at: readAt },
        how: 'sourced',
      });
    }
    if (!body.hasNext) break;
  }
  return out;
}

interface CommitteeRfp {
  id?: number;
  snapshot?: {
    name?: string;
    summary?: string;
    submission_deadline?: string | number;
    timeline?: { status?: string };
  };
}

/**
 * NEAR's Infrastructure Committee, its RFPs on the chain (get_rfps), the ones whose status says they take
 * submissions. Their status is kept as said, beside the deadline, even when the deadline has passed.
 */
export async function committeeCalls(pool: RpcPool, readAt: string): Promise<Call[]> {
  const { value } = await pool.view<CommitteeRfp[]>(
    INFRASTRUCTURE_COMMITTEE,
    'get_rfps',
    {},
    { finality: 'final' },
  );
  const out: Call[] = [];
  for (const r of value ?? []) {
    const s = r.snapshot ?? {};
    const title = text(s.name);
    if (typeof r.id !== 'number' || !title || s.timeline?.status !== 'ACCEPTING_SUBMISSIONS')
      continue;
    out.push({
      petal: 'calls/v1',
      id: `${INFRASTRUCTURE_COMMITTEE}:${r.id}`,
      kind: 'rfp',
      title,
      summary: text(s.summary),
      offered_by: { name: 'NEAR Infrastructure Committee', about: null },
      budget: null,
      opens: null,
      closes: s.submission_deadline ? new Date(nsToIso(s.submission_deadline)).toISOString() : null,
      status: s.timeline.status,
      link: `https://near.social/${INFRASTRUCTURE_COMMITTEE}/widget/app?page=rfp&id=${r.id}`,
      source: {
        name: INFRASTRUCTURE_COMMITTEE,
        ref: `near:${INFRASTRUCTURE_COMMITTEE} get_rfps`,
        read_at: readAt,
      },
      how: 'sourced',
    });
  }
  return out;
}

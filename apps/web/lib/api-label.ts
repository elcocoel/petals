// The gallery's one line on what is answering. It must tell the truth: "real" only says the real
// API code answers, so fake mode says what is faked, and map and agent report their own state.

export interface ApiHealth {
  /** the API mock answers (PETAL_API_MOCK) */
  mock?: boolean;
  /** petalApp runs on fakes (PETAL_FAKE=1) */
  fake?: boolean;
  map: string;
  llm: string;
  /** open, gated, or none when the site runs no agent for visitors (assumed when the server leaves it out) */
  agent_access?: string;
}

export function apiLabel(h: ApiHealth): string {
  if (h.mock) return 'API mock: fixtures on the same routes, not the real API.';
  if (h.fake) {
    return 'Fake mode: the real API on a fake map, with a recorded agent and a recorded quote. Nothing reaches NEAR.';
  }
  return `API: real; map ${h.map}; agent ${h.llm}.`;
}

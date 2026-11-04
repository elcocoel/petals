// mapKeys: builders for every key in shared-map.md. Each part is checked, so no caller can build a
// key that escapes its folder (a `/` inside a part) or that FastData would drop (over 1,024 bytes).
import { MAP_KEY_PREFIX, MAP_LIMITS, utf8Length } from './limits.ts';

const HEX24 = /^[0-9a-f]{24}$/;
const HEX64 = /^[0-9a-f]{64}$/;
/** CAIP-2: namespace:reference */
const CAIP2 = /^[-a-z0-9]{3,8}:[-_a-zA-Z0-9]{1,32}$/;
/** NEAR account ids: 2–64 chars of lower-case parts joined by . */
const NEAR_ACCOUNT = /^(?=.{2,64}$)(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
/** one path part: printable, no slash, no whitespace */
const PART = /^[^\s/]+$/;

function need(ok: boolean, what: string, value: unknown): void {
  if (!ok) throw new Error(`mapKeys: bad ${what}: ${JSON.stringify(value)}`);
}

function key(...parts: string[]): string {
  const k = `${MAP_KEY_PREFIX}${parts.join('/')}`;
  if (utf8Length(k) > MAP_LIMITS.keyBytes)
    throw new Error(`mapKeys: key over ${MAP_LIMITS.keyBytes} bytes: ${k.slice(0, 60)}…`);
  return k;
}

export const isNearAccount = (s: string) => NEAR_ACCOUNT.test(s);

export const mapKeys: {
  spec(id: string): string;
  snapshot(sha256: string): string;
  index(caip2: string, population: string, block: number): string;
  label(caip2: string, address: string): string;
  correction(flowerId: string, id: string): string;
  vouch(account: string): string;
} = {
  spec(id) {
    need(HEX24.test(id), 'entry id (24 hex)', id);
    return key('spec', id);
  },
  snapshot(sha256) {
    need(HEX64.test(sha256), 'snapshot sha256 (64 hex)', sha256);
    return key('snapshot', sha256);
  },
  index(caip2, population, block) {
    need(CAIP2.test(caip2), 'caip2', caip2);
    need(PART.test(population), 'population', population);
    need(Number.isSafeInteger(block) && block >= 0, 'block height', block);
    return key('index', caip2, population, String(block));
  },
  label(caip2, address) {
    need(CAIP2.test(caip2), 'caip2', caip2);
    need(PART.test(address), 'address', address);
    return key('label', caip2, address);
  },
  correction(flowerId, id) {
    need(HEX24.test(flowerId), 'flower id (24 hex)', flowerId);
    need(HEX24.test(id), 'correction id (24 hex)', id);
    return key('correction', flowerId, id);
  },
  vouch(account) {
    need(isNearAccount(account), 'NEAR account', account);
    return key('vouch', account);
  },
};

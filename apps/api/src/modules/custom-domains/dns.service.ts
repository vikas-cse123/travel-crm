import { promises as dns } from 'node:dns';

/**
 * Minimal DNS CNAME resolution for custom-domain activation.
 *
 * Returns the chain of CNAME targets for a hostname (following aliases up to a
 * bounded number of hops, de-duplicated, trailing-dot/case normalized). A host
 * with no CNAME record yields an empty array.
 */
export async function resolveCnameChain(hostname: string): Promise<string[]> {
  const seen = new Set<string>();
  const targets: string[] = [];
  let current = hostname.trim().toLowerCase().replace(/\.$/, '');
  for (let i = 0; i < 10; i += 1) {
    if (seen.has(current)) break;
    seen.add(current);
    let records: string[];
    try {
      records = await dns.resolveCname(current);
    } catch {
      break;
    }
    const first = records[0];
    if (!first) break;
    const target = first.toLowerCase().replace(/\.$/, '');
    targets.push(target);
    if (target === current) break;
    current = target;
  }
  return targets;
}

/** Normalize a hostname/target for comparison (lower-case, no trailing dot). */
export function normalizeDnsTarget(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, '');
}

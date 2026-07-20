import { describe, expect, it } from 'vitest';
import {
  generateSlug,
  generateUniqueSlug,
  normalizeEmail,
  normalizeUsername,
  trimOrUndefined,
} from '../src/utils/normalize.js';
import {
  generateNumericOtp,
  generateSecureToken,
  hashPassword,
  hashToken,
  safeCompare,
  verifyPassword,
} from '../src/utils/crypto.js';
import {
  buildPaginationMeta,
  resolvePagination,
  toPrismaPagination,
} from '../src/utils/pagination.js';
import { localDayBounds } from '../src/utils/timezone.js';

/** Pure-function tests. No database involved. */

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Owner@Example.COM  ')).toBe('owner@example.com');
  });

  it('is idempotent', () => {
    const once = normalizeEmail('User@Example.com');
    expect(normalizeEmail(once)).toBe(once);
  });
});

describe('normalizeUsername', () => {
  it('lowercases and trims', () => {
    expect(normalizeUsername('  SalesLead ')).toBe('saleslead');
  });
});

describe('generateSlug', () => {
  it('converts a company name to a URL-safe slug', () => {
    expect(generateSlug('Interscale Demo Travels')).toBe('interscale-demo-travels');
  });

  it('strips accents rather than dropping the words', () => {
    expect(generateSlug('Voyages Été')).toBe('voyages-ete');
  });

  it('collapses punctuation and trims stray hyphens', () => {
    expect(generateSlug('  Sky & Sea -- Holidays!  ')).toBe('sky-sea-holidays');
  });

  it('handles a name with no usable characters', () => {
    expect(generateSlug('!!!')).toBe('');
  });
});

describe('generateUniqueSlug', () => {
  it('returns the base slug when it is free', async () => {
    const slug = await generateUniqueSlug('Blue Sky', async () => false);
    expect(slug).toBe('blue-sky');
  });

  it('appends a suffix until it finds a free slug', async () => {
    const taken = new Set(['blue-sky', 'blue-sky-2']);
    const slug = await generateUniqueSlug('Blue Sky', async (candidate) => taken.has(candidate));
    expect(slug).toBe('blue-sky-3');
  });

  it('falls back to a usable base for an unusable name', async () => {
    const slug = await generateUniqueSlug('!!!', async () => false);
    expect(slug).toBe('company');
  });
});

describe('trimOrUndefined', () => {
  it('collapses blank values to undefined', () => {
    expect(trimOrUndefined('   ')).toBeUndefined();
    expect(trimOrUndefined(null)).toBeUndefined();
    expect(trimOrUndefined(undefined)).toBeUndefined();
    expect(trimOrUndefined('  value ')).toBe('value');
  });
});

describe('password hashing', () => {
  it('produces an Argon2id hash that verifies', async () => {
    const hash = await hashPassword('Interscale@2026');

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('Interscale@2026');
    expect(await verifyPassword(hash, 'Interscale@2026')).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('Interscale@2026');
    expect(await verifyPassword(hash, 'interscale@2026')).toBe(false);
  });

  it('salts, so the same password hashes differently each time', async () => {
    const [first, second] = await Promise.all([
      hashPassword('Interscale@2026'),
      hashPassword('Interscale@2026'),
    ]);
    expect(first).not.toBe(second);
  });

  it('returns false instead of throwing on a malformed hash', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
  });
});

describe('token hashing', () => {
  it('produces a stable 64-character SHA-256 digest', () => {
    const digest = hashToken('some-random-token');
    expect(digest).toHaveLength(64);
    expect(hashToken('some-random-token')).toBe(digest);
  });

  it('differs for different inputs', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });

  it('generates distinct URL-safe tokens', () => {
    const first = generateSecureToken();
    const second = generateSecureToken();

    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('OTP generation', () => {
  it('always returns six digits, including leading zeros', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(generateNumericOtp()).toMatch(/^\d{6}$/);
    }
  });
});

describe('safeCompare', () => {
  it('matches identical strings and rejects others', () => {
    expect(safeCompare('abc123', 'abc123')).toBe(true);
    expect(safeCompare('abc123', 'abc124')).toBe(false);
    expect(safeCompare('short', 'longer-value')).toBe(false);
  });
});

describe('pagination', () => {
  it('applies defaults', () => {
    expect(resolvePagination({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('clamps a page size above the maximum', () => {
    // Prevents a request from asking for the whole table.
    expect(resolvePagination({ pageSize: 5000 }).pageSize).toBe(100);
  });

  it('clamps non-positive input', () => {
    expect(resolvePagination({ page: 0, pageSize: 0 })).toEqual({ page: 1, pageSize: 1 });
    expect(resolvePagination({ page: -5 }).page).toBe(1);
  });

  it('converts to Prisma skip/take', () => {
    expect(toPrismaPagination({ page: 3, pageSize: 20 })).toEqual({ skip: 40, take: 20 });
  });

  it('builds the pagination envelope', () => {
    expect(buildPaginationMeta({ page: 1, pageSize: 20 }, 45)).toEqual({
      page: 1,
      pageSize: 20,
      total: 45,
      totalPages: 3,
    });
  });

  it('reports zero pages for an empty result', () => {
    expect(buildPaginationMeta({ page: 1, pageSize: 20 }, 0).totalPages).toBe(0);
  });
});

describe('company timezone boundaries', () => {
  it('maps an Asia/Kolkata local day to UTC boundaries', () => {
    const bounds = localDayBounds('Asia/Kolkata', new Date('2026-07-21T12:00:00.000Z'));
    expect(bounds.start.toISOString()).toBe('2026-07-20T18:30:00.000Z');
    expect(bounds.end.toISOString()).toBe('2026-07-21T18:30:00.000Z');
  });

  it('honours daylight-saving transitions for other valid company timezones', () => {
    const bounds = localDayBounds('America/New_York', new Date('2026-03-08T12:00:00.000Z'));
    expect(bounds.start.toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(bounds.end.toISOString()).toBe('2026-03-09T04:00:00.000Z');
  });
});

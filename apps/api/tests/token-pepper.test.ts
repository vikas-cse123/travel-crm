import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashToken } from '../src/utils/crypto.js';
import { env } from '../src/config/env.js';

/**
 * `hashToken` must be a keyed HMAC over TOKEN_PEPPER, not a bare digest, so a
 * leaked token-hash table cannot be matched offline without the pepper.
 */
describe('token hashing with TOKEN_PEPPER', () => {
  it('is stable for the same token', () => {
    expect(hashToken('some-random-token')).toBe(hashToken('some-random-token'));
  });

  it('differs for different tokens', () => {
    expect(hashToken('token-a')).not.toBe(hashToken('token-b'));
  });

  it('is a keyed HMAC, not a bare SHA-256', () => {
    const bare = createHash('sha256').update('some-random-token').digest('hex');
    expect(hashToken('some-random-token')).not.toBe(bare);
  });

  it('matches HMAC-SHA256 computed with the configured pepper', () => {
    const expected = createHmac('sha256', env.TOKEN_PEPPER).update('abc123').digest('hex');
    expect(hashToken('abc123')).toBe(expected);
  });

  it('a different pepper produces a different hash for the same token', () => {
    const withOtherPepper = createHmac('sha256', 'a_completely_different_pepper_value_x')
      .update('abc123')
      .digest('hex');
    expect(hashToken('abc123')).not.toBe(withOtherPepper);
  });
});

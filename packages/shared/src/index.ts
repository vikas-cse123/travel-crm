/**
 * @interscale/shared
 *
 * Contracts shared between the Express API and the React web app:
 * response envelopes, error codes, constants and health types.
 *
 * Phase 1 scope only. Domain enums, permission keys and the auth/user
 * schemas arrive in Phase 2 alongside the Prisma schema.
 */

export * from './constants.js';
export * from './api-response.js';
export * from './health.js';

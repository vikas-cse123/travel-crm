/**
 * @interscale/shared
 *
 * Contracts shared between the Express API and the React web app: response
 * envelopes, error codes, domain enums, the permission catalogue, default role
 * definitions and validation limits.
 *
 * This package must never import Prisma or any server-only dependency — the
 * frontend bundles it.
 */

export * from './constants.js';
export * from './api-response.js';
export * from './health.js';
export * from './enums.js';
export * from './permissions.js';
export * from './roles.js';
export * from './validation.js';
export * from './auth.js';
export * from './users.js';
export * from './administration.js';
export * from './queries.js';

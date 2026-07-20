/**
 * Tenant-scoping primitives.
 *
 * The rule this file exists to enforce: `companyId` comes from the
 * authenticated session and nowhere else. It is never read from a request
 * body, query string or URL parameter.
 *
 * There is deliberately no generic `findById(model, id)` helper here. A
 * convenience wrapper that *can* run unscoped is a wrapper that eventually
 * *will* run unscoped, so scoping lives in each typed repository instead,
 * where `companyId` is a required argument the compiler checks.
 */

/**
 * The tenant a request operates within, derived from the session.
 *
 * Nominal typing via the `readonly __brand` field means a bare
 * `{ companyId: someString }` from request input will not type-check as a
 * TenantContext — it has to be built by `createTenantContext`.
 */
export interface TenantContext {
  readonly companyId: string;
  readonly __brand: 'TenantContext';
}

/**
 * Build a tenant context. Call this only with a company id that came from a
 * verified session record, never with client-supplied input.
 */
export function createTenantContext(companyId: string): TenantContext {
  if (!companyId) {
    throw new Error('createTenantContext requires a non-empty companyId.');
  }
  return { companyId, __brand: 'TenantContext' };
}

/** Reusable `where` fragment restricting a query to one company. */
export function tenantWhere(tenant: TenantContext): { companyId: string } {
  return { companyId: tenant.companyId };
}

/**
 * `where` fragment matching one record *and* asserting its tenant.
 *
 * Both halves matter: filtering on id alone lets a modified URL reach another
 * company's row, which is exactly the attack the isolation tests cover.
 */
export function tenantScopedId(
  tenant: TenantContext,
  id: string,
): { id: string; companyId: string } {
  return { id, companyId: tenant.companyId };
}

/** Excludes soft-deleted rows. */
export const NOT_DELETED = { deletedAt: null } as const;

/** Company scope plus the soft-delete filter, the common read case. */
export function activeTenantWhere(tenant: TenantContext): {
  companyId: string;
  deletedAt: null;
} {
  return { companyId: tenant.companyId, deletedAt: null };
}

/** One live record within a company. */
export function activeTenantScopedId(
  tenant: TenantContext,
  id: string,
): { id: string; companyId: string; deletedAt: null } {
  return { id, companyId: tenant.companyId, deletedAt: null };
}

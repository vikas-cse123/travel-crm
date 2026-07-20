import type { Company, Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import type { TenantContext } from '../../db/tenant.js';
import { generateUniqueSlug } from '../../utils/normalize.js';

/**
 * Company is the tenant root, so its lookups are by primary key rather than by
 * a `companyId` filter. `findForTenant` still takes a TenantContext to keep
 * call sites honest: a session can only ever read its own company.
 */

export const COMPANY_SELECT = {
  id: true,
  name: true,
  slug: true,
  email: true,
  phone: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CompanySelect;

export type CompanySummary = Prisma.CompanyGetPayload<{ select: typeof COMPANY_SELECT }>;

export const companiesRepository = {
  /** The company the current session belongs to. */
  async findForTenant(tenant: TenantContext): Promise<CompanySummary | null> {
    return prisma.company.findUnique({
      where: { id: tenant.companyId },
      select: COMPANY_SELECT,
    });
  },

  async findBySlug(slug: string): Promise<Company | null> {
    return prisma.company.findUnique({ where: { slug } });
  },

  async isSlugTaken(slug: string): Promise<boolean> {
    const found = await prisma.company.findUnique({ where: { slug }, select: { id: true } });
    return found !== null;
  },

  /**
   * Derive a free slug from a company name.
   *
   * Advisory only — the unique constraint on `slug` is the real guarantee,
   * since two concurrent registrations can both pass this check.
   */
  async buildUniqueSlug(name: string): Promise<string> {
    return generateUniqueSlug(name, (candidate) => this.isSlugTaken(candidate));
  },

  async count(): Promise<number> {
    return prisma.company.count();
  },
};

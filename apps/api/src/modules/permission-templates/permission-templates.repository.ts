import type { Prisma, TemplateStatus } from '@prisma/client';
import { prisma } from '../../config/prisma.js';
import {
  activeTenantScopedId,
  activeTenantWhere,
  tenantScopedId,
  type TenantContext,
} from '../../db/tenant.js';

/** Tenant-scoped data access for permission templates. */

export const TEMPLATE_SELECT = {
  id: true,
  companyId: true,
  name: true,
  description: true,
  status: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, fullName: true } },
  _count: { select: { permissions: true } },
} satisfies Prisma.PermissionTemplateSelect;

export type TemplateSummary = Prisma.PermissionTemplateGetPayload<{
  select: typeof TEMPLATE_SELECT;
}>;

export const permissionTemplatesRepository = {
  /** Live templates for the company. */
  async list(tenant: TenantContext, status?: TemplateStatus): Promise<TemplateSummary[]> {
    return prisma.permissionTemplate.findMany({
      where: { ...activeTenantWhere(tenant), ...(status ? { status } : {}) },
      select: TEMPLATE_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  },

  async findById(tenant: TenantContext, templateId: string): Promise<TemplateSummary | null> {
    return prisma.permissionTemplate.findFirst({
      where: activeTenantScopedId(tenant, templateId),
      select: TEMPLATE_SELECT,
    });
  },

  /** Template with its granted permission keys. */
  async findByIdWithPermissions(tenant: TenantContext, templateId: string) {
    return prisma.permissionTemplate.findFirst({
      where: activeTenantScopedId(tenant, templateId),
      select: {
        ...TEMPLATE_SELECT,
        permissions: { select: { permission: { select: { key: true, isAvailable: true } } } },
      },
    });
  },

  /** Grantable permission keys from a template. */
  async listPermissionKeys(tenant: TenantContext, templateId: string): Promise<string[]> {
    const template = await prisma.permissionTemplate.findFirst({
      where: activeTenantScopedId(tenant, templateId),
      select: {
        permissions: {
          where: { permission: { isAvailable: true } },
          select: { permission: { select: { key: true } } },
        },
      },
    });
    if (!template) return [];
    return template.permissions.map((entry) => entry.permission.key);
  },

  async isNameTaken(
    tenant: TenantContext,
    name: string,
    excludeTemplateId?: string,
  ): Promise<boolean> {
    const found = await prisma.permissionTemplate.findFirst({
      where: {
        companyId: tenant.companyId,
        name,
        ...(excludeTemplateId ? { id: { not: excludeTemplateId } } : {}),
      },
      select: { id: true },
    });
    return found !== null;
  },

  async updateStatus(
    tenant: TenantContext,
    templateId: string,
    status: TemplateStatus,
  ): Promise<boolean> {
    const result = await prisma.permissionTemplate.updateMany({
      where: activeTenantScopedId(tenant, templateId),
      data: { status },
    });
    return result.count > 0;
  },

  /** Soft delete, keeping the row so historical assignments stay readable. */
  async softDelete(tenant: TenantContext, templateId: string): Promise<boolean> {
    const result = await prisma.permissionTemplate.updateMany({
      where: activeTenantScopedId(tenant, templateId),
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
    return result.count > 0;
  },

  async findByIdIncludingDeleted(
    tenant: TenantContext,
    templateId: string,
  ): Promise<TemplateSummary | null> {
    return prisma.permissionTemplate.findFirst({
      where: tenantScopedId(tenant, templateId),
      select: TEMPLATE_SELECT,
    });
  },

  async count(tenant: TenantContext): Promise<number> {
    return prisma.permissionTemplate.count({ where: activeTenantWhere(tenant) });
  },
};

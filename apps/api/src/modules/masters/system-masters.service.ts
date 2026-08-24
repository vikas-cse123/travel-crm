import { isMasterType, MASTER_TYPE_LABELS, type MasterType } from '@interscale/shared';
import { prisma } from '../../config/prisma.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import {
  companyHiddenMastersRepository,
  type HideMasterContext,
} from './company-hidden-masters.repository.js';
import { masterTypeInfo, type MasterRegistryRow } from './master-types.js';
import { getSystemCompanyId } from './master-visibility.js';

/**
 * Generic hide/restore flow for global Master records.
 *
 * A tenant may hide any active global record for its own company. The original
 * record is never modified — only a `company_hidden_masters` row is written.
 * Restoring simply marks that row restored.
 *
 * The master type is always resolved through the static registry, so a client
 * can never name an arbitrary table.
 */

/** Load one record through the registry, returning null when it is gone. */
async function loadRegistryRecord(
  type: MasterType,
  masterId: string,
): Promise<MasterRegistryRow | null> {
  const info = masterTypeInfo(type);
  // The registry is a static allowlist; the cast bridges Prisma's generated
  // per-model delegate types to the shared row shape without dynamic access.
  const delegate = prisma[info.model] as unknown as {
    findUnique: (args: {
      where: { id: string };
      select: Record<string, true>;
    }) => Promise<Record<string, unknown> | null>;
  };
  const select: Record<string, true> = {
    id: true,
    companyId: true,
    status: true,
    deletedAt: true,
  };
  if (info.nameField) select[info.nameField] = true;
  if (info.type === 'TESTIMONIAL') select.destinationName = true;

  const row = await delegate.findUnique({ where: { id: masterId }, select });
  if (!row) return null;
  return {
    id: String(row.id),
    companyId: String(row.companyId),
    status: String(row.status),
    deletedAt: (row.deletedAt as Date | null) ?? null,
    name: row.name != null ? String(row.name) : null,
    title: row.title != null ? String(row.title) : null,
    clientName: row.clientName != null ? String(row.clientName) : null,
    destinationName: row.destinationName != null ? String(row.destinationName) : null,
    question: row.question != null ? String(row.question) : null,
  };
}

export const systemMastersService = {
  /**
   * Hide an active global record for the current tenant.
   * Returns a stable response whether the record was already hidden.
   */
  async hide(auth: AuthContext, rawType: string, masterId: string, context: HideMasterContext) {
    if (!isMasterType(rawType)) {
      throw new ValidationError(`Unsupported master type "${rawType}".`);
    }
    const type: MasterType = rawType;

    const systemCompanyId = await getSystemCompanyId();
    if (!systemCompanyId) {
      throw new NotFoundError('Global master records are not available yet.');
    }
    if (auth.companyId === systemCompanyId) {
      throw new ValidationError('System administrators do not hide global records.');
    }

    const record = await loadRegistryRecord(type, masterId);
    if (!record || record.deletedAt !== null || record.status === 'ARCHIVED') {
      throw new NotFoundError(`${MASTER_TYPE_LABELS[type]} not found.`);
    }
    if (record.companyId !== systemCompanyId) {
      throw new ValidationError(
        `This ${MASTER_TYPE_LABELS[type].toLowerCase()} is not a global record and cannot be hidden.`,
      );
    }

    await prisma.$transaction(async (tx) => {
      await companyHiddenMastersRepository.hide(
        auth.companyId,
        auth.userId,
        type,
        masterId,
        context,
        tx,
      );
    });

    return {
      hidden: true,
      masterType: type,
      masterId,
    };
  },

  /** Restore a previously hidden global record for the current tenant. */
  async restore(auth: AuthContext, rawType: string, masterId: string, context: HideMasterContext) {
    if (!isMasterType(rawType)) {
      throw new ValidationError(`Unsupported master type "${rawType}".`);
    }
    const type: MasterType = rawType;

    const restored = await prisma.$transaction(async (tx) =>
      companyHiddenMastersRepository.restore(
        auth.companyId,
        auth.userId,
        type,
        masterId,
        context,
        tx,
      ),
    );
    if (!restored) {
      throw new NotFoundError('That global record is not currently hidden for your company.');
    }

    return { restored: true, masterType: type, masterId };
  },

  /**
   * List the global records the current tenant has hidden, optionally for one
   * master type. Rows whose original record was archived or removed are
   * omitted, and the original record is included with a friendly display name.
   */
  async listHidden(auth: AuthContext, rawType?: string | undefined) {
    const type = rawType === undefined || rawType === '' ? undefined : rawType;
    if (type !== undefined && !isMasterType(type)) {
      throw new ValidationError(`Unsupported master type "${type}".`);
    }

    const rows = await companyHiddenMastersRepository.listActive(
      auth.companyId,
      type as MasterType | undefined,
    );

    const decorated = await Promise.all(
      rows.map(async (row) => {
        if (!isMasterType(row.masterType)) return null;
        const record = await loadRegistryRecord(row.masterType, row.masterId);
        if (!record || record.deletedAt !== null || record.status === 'ARCHIVED') return null;
        const info = masterTypeInfo(row.masterType);
        const hiddenBy = row.hiddenByUserId
          ? await prisma.user.findUnique({
              where: { id: row.hiddenByUserId },
              select: { id: true, fullName: true },
            })
          : null;
        return {
          hideId: row.id,
          masterType: row.masterType,
          masterId: row.masterId,
          masterTypeLabel: info.label,
          name: info.displayName(record),
          hiddenAt: row.hiddenAt.toISOString(),
          hiddenBy,
        };
      }),
    );

    const data = decorated.filter((row): row is NonNullable<typeof row> => row !== null);

    return {
      data,
      count: data.length,
    };
  },
};

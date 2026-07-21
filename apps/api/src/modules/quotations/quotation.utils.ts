import type { Prisma } from '@prisma/client';
import type { AuthContext } from '../../middleware/authenticate.js';

export type RequestContext = { ipAddress: string | null; userAgent: string | null };

export async function nextCompanyNumber(
  tx: Prisma.TransactionClient,
  companyId: string,
  kind: 'quotation' | 'template',
) {
  const year = new Date().getUTCFullYear();
  const counter = await tx.quotationCounter.upsert({
    where: { companyId_year: { companyId, year } },
    create: {
      companyId,
      year,
      quotationValue: kind === 'quotation' ? 1 : 0,
      templateValue: kind === 'template' ? 1 : 0,
    },
    update:
      kind === 'quotation'
        ? { quotationValue: { increment: 1 } }
        : { templateValue: { increment: 1 } },
    select: { quotationValue: true, templateValue: true },
  });
  const value = kind === 'quotation' ? counter.quotationValue : counter.templateValue;
  return `${kind === 'quotation' ? 'QT' : 'QTP'}-${year}-${String(value).padStart(6, '0')}`;
}

export function quotationAudit(
  auth: AuthContext,
  action: Prisma.ActivityLogCreateInput['action'],
  entityType: 'Quotation' | 'QuotationTemplate' | 'QuotationDocument',
  entityId: string,
  context: RequestContext,
  metadata?: Prisma.InputJsonValue,
) {
  return {
    companyId: auth.companyId,
    actorUserId: auth.userId,
    action,
    entityType,
    entityId,
    ...(metadata === undefined ? {} : { metadata }),
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  } as const;
}

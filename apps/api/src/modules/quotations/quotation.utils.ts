import type { Prisma } from '@prisma/client';
import type { AuthContext } from '../../middleware/authenticate.js';

export type RequestContext = { ipAddress: string | null; userAgent: string | null };

export async function nextCompanyNumber(
  tx: Prisma.TransactionClient,
  companyId: string,
  kind: 'quotation' | 'template',
) {
  // One lifetime counter keeps IDs compact and prevents yearly resets.
  const year = 0;
  const quotation = kind === 'quotation';
  // Atomic upsert. New quotation sequences start at QT-001000; template
  // sequences still start at QTP-000001. Existing counters increment their own
  // kind and the quotation value is floored so a legacy counter below 1000
  // jumps straight to QT-001000 without moving backwards or issuing duplicates.
  const rows = await tx.$queryRaw<Array<{ quotationValue: number; templateValue: number }>>`
    INSERT INTO "quotation_counters" ("companyId", "year", "quotationValue", "templateValue")
    VALUES (${companyId}::uuid, ${year}::int, ${quotation ? 1000 : 0}, ${quotation ? 0 : 1})
    ON CONFLICT ("companyId", "year") DO UPDATE SET
      "quotationValue" = CASE
        WHEN ${quotation} THEN GREATEST("quotation_counters"."quotationValue" + 1, 1000)
        ELSE "quotation_counters"."quotationValue"
      END,
      "templateValue" = CASE
        WHEN ${quotation} THEN "quotation_counters"."templateValue"
        ELSE GREATEST("quotation_counters"."templateValue" + 1, 1)
      END
    RETURNING "quotationValue", "templateValue";
  `;
  const counter = rows[0];
  if (!counter) throw new Error('Quotation counter allocation returned no row.');
  const value = quotation ? counter.quotationValue : counter.templateValue;
  return `${quotation ? 'QT' : 'QTP'}-${String(value).padStart(6, '0')}`;
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

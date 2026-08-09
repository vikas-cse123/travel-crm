import {
  LEAD_SOURCES,
  LEAD_STAGES,
  LEAD_TYPES,
  QUERY_PRIORITIES,
  SERVICE_TYPES,
  labelForLookup,
  queryInputSchema,
  type LeadImportInput,
  type LeadImportRow,
  type QueryInput,
} from '@interscale/shared';
import { prisma } from '../../config/prisma.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import { normalizeEmail, normalizePhone } from '../../utils/normalize.js';
import { queriesService, type RequestContext } from './queries.service.js';

/**
 * CSV lead import (bulk). The frontend parses the CSV (papaparse), maps columns
 * to the shared Lead field vocabulary, and sends every row in one request. This
 * service validates each row individually against the same rules as normal lead
 * creation, resolves assignees/destinations strictly inside the caller's
 * company, detects duplicates, and reuses the existing per-lead creation logic
 * so imported leads get the same numbering, history and activity logs.
 */

const LEAD_IMPORT_DEFAULT_SERVICES = ['GENERAL_ENQUIRY'] as const;

export interface LeadImportRowResult {
  row: number;
  customerName: string;
  status: 'IMPORTED' | 'SKIPPED' | 'FAILED';
  reason?: string;
}

export interface LeadImportSummary {
  total: number;
  imported: number;
  skipped: number;
  failed: number;
  results: LeadImportRowResult[];
  errorCsv: { fileName: string; mimeType: string; content: string };
}

/** Case-insensitive match of a CSV value against enum values or their labels. */
function matchEnumValue(
  value: string | null | undefined,
  values: readonly string[],
): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  const byValue = values.find((v) => v.toLowerCase() === lower);
  if (byValue) return byValue;
  return values.find((v) => labelForLookup(v).toLowerCase() === lower) ?? null;
}

/** Strict YYYY-MM-DD calendar date; returns null for blank/absent. */
function toCalendarDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new Error(`Invalid date "${text}". Use YYYY-MM-DD.`);
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    throw new Error(`Invalid date "${text}".`);
  }
  return date;
}

function toNonNegativeInteger(value: unknown, label: string): number | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  const num = Number(text);
  if (!Number.isInteger(num) || num < 0) throw new Error(`Invalid ${label}: "${text}".`);
  return num;
}

function toNonNegativeMoney(value: unknown, label: string): number | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  const num = Number(text);
  if (!Number.isFinite(num) || num < 0) throw new Error(`Invalid ${label}: "${text}".`);
  return num;
}

function toOptionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;

function buildErrorCsv(failed: Array<{ row: number; customerName: string; reason: string }>): string {
  const headers = ['Row', 'Customer', 'Reason'];
  const lines = failed.map((entry) =>
    [entry.row, entry.customerName, entry.reason].map(quote).join(','),
  );
  return [headers.map(quote).join(','), ...lines].join('\n');
}

/** Build the same QueryInput the create form submits, from a mapped CSV row. */
function toQueryInput(row: LeadImportRow): QueryInput {
  const leadSource = matchEnumValue(row.leadSource, LEAD_SOURCES);
  if (!leadSource) throw new Error('Missing or invalid lead source.');
  const leadType = (matchEnumValue(row.leadType, LEAD_TYPES) ?? 'FRESH') as QueryInput['leadType'];
  const leadStage = (matchEnumValue(row.leadStage, LEAD_STAGES) ??
    'NEW_LEAD') as QueryInput['leadStage'];
  const priority = (matchEnumValue(row.priority, QUERY_PRIORITIES) ??
    'MEDIUM') as QueryInput['priority'];

  const services = row.services?.length
    ? ([
        ...new Set(row.services.map((s) => matchEnumValue(s, SERVICE_TYPES)).filter(Boolean)),
      ] as QueryInput['services'])
    : ([...LEAD_IMPORT_DEFAULT_SERVICES] as QueryInput['services']);
  if (!services.length) throw new Error('No valid services provided.');

  const travelStartDate = toCalendarDate(row.travelStartDate);
  const travelEndDate = toCalendarDate(row.travelEndDate);
  if (travelStartDate && travelEndDate && travelStartDate > travelEndDate) {
    throw new Error('Travel end must be after travel start.');
  }

  // Reuse the shared create schema so imported leads pass the exact same
  // validation and defaults as the create form. The schema fills defaults
  // (createNewCustomer, flexibleDates, rooms, etc.), then we return the result.
  const parsed = queryInputSchema.safeParse({
    customerName: (row.customerName ?? '').trim(),
    phone: (row.phone ?? '').trim(),
    email: row.email && row.email.trim() ? normalizeEmail(row.email.trim()) : null,
    alternatePhone: toOptionalString(row.alternatePhone),
    leadSource: leadSource as QueryInput['leadSource'],
    leadType,
    leadStage,
    priority,
    departureCountry: toOptionalString(row.departureCountry),
    departureCity: toOptionalString(row.departureCity),
    travelStartDate: travelStartDate ?? undefined,
    travelEndDate: travelEndDate ?? undefined,
    adults: toNonNegativeInteger(row.adults, 'adults') ?? 1,
    childrenWithBed: toNonNegativeInteger(row.childrenWithBed, 'children with bed') ?? 0,
    childrenWithoutBed: toNonNegativeInteger(row.childrenWithoutBed, 'children without bed') ?? 0,
    infants: toNonNegativeInteger(row.infants, 'infants') ?? 0,
    expectedAmount: toNonNegativeMoney(row.expectedAmount, 'expected amount'),
    budgetMin: toNonNegativeMoney(row.budgetMin, 'budget min'),
    budgetMax: toNonNegativeMoney(row.budgetMax, 'budget max'),
    currency: row.currency && row.currency.trim() ? row.currency.trim() : 'INR',
    tripType: toOptionalString(row.tripType),
    internalRemarks: toOptionalString(row.internalRemarks),
    services,
    itinerary: [],
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(
      first
        ? `${first.path.join('.')}: ${first.message}`
        : 'The row does not meet lead validation rules.',
    );
  }
  return parsed.data;
}

export const queriesImportService = {
  async importCsv(
    auth: AuthContext,
    input: LeadImportInput,
    context: RequestContext,
  ): Promise<LeadImportSummary> {
    const companyId = auth.companyId;

    // Tenant-scoped reference data, loaded once so no per-row cross-tenant read
    // is possible and there is no N+1 across rows.
    const [assignableUsers, destinations, existing] = await Promise.all([
      prisma.user.findMany({
        where: {
          companyId,
          status: 'ACTIVE',
          deletedAt: null,
          company: { isSystem: false },
        },
        select: { id: true, fullName: true, username: true, normalizedEmail: true },
      }),
      prisma.destination.findMany({
        where: { companyId, status: 'ACTIVE', deletedAt: null },
        select: { id: true, name: true, normalizedName: true, countryName: true },
      }),
      prisma.query.findMany({
        where: { companyId, deletedAt: null },
        select: { normalizedPhone: true, email: true },
      }),
    ]);

    const userByKey = new Map<string, string>();
    for (const user of assignableUsers) {
      userByKey.set(user.fullName.trim().toLowerCase(), user.id);
      userByKey.set(user.username.trim().toLowerCase(), user.id);
      if (user.normalizedEmail) userByKey.set(user.normalizedEmail, user.id);
    }
    const destinationByKey = new Map<string, { countryName: string; name: string }>();
    for (const dest of destinations) {
      destinationByKey.set(dest.name.trim().toLowerCase(), {
        countryName: dest.countryName,
        name: dest.name,
      });
      destinationByKey.set(dest.normalizedName.trim().toLowerCase(), {
        countryName: dest.countryName,
        name: dest.name,
      });
    }

    // Existing company leads for duplicate detection (by normalized phone/email).
    const existingPhones = new Set(existing.map((row) => row.normalizedPhone).filter(Boolean));
    const existingEmails = new Set(
      existing.filter((row) => row.email).map((row) => normalizeEmail(row.email!)),
    );
    const batchPhones = new Set<string>();
    const batchEmails = new Set<string>();

    const results: LeadImportRowResult[] = [];
    const failedRows: Array<{ row: number; customerName: string; reason: string }> = [];
    let imported = 0;
    let skipped = 0;

    for (const [index, row] of input.rows.entries()) {
      const rowNumber = index + 2; // +1 header, +1 zero-based
      const customerName = (row.customerName ?? '').trim();

      const fail = (reason: string) => {
        results.push({ row: rowNumber, customerName, status: 'FAILED', reason });
        failedRows.push({ row: rowNumber, customerName, reason });
      };

      try {
        if (!customerName) throw new Error('Missing customer name.');
        if (customerName.length < 2) throw new Error('Customer name is too short.');

        const phone = (row.phone ?? '').trim();
        if (!phone) throw new Error('Missing phone number.');
        if (phone.replace(/\D/g, '').length < 5) throw new Error('Phone number is too short.');

        let email: string | null | undefined;
        if (row.email && row.email.trim()) {
          const candidate = row.email.trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) throw new Error('Invalid email.');
          email = normalizeEmail(candidate);
        }

        // Resolve assignee strictly within the caller's company. Blank falls
        // back to the normal create default (the current user).
        let assignedToId: string | undefined;
        if (row.assignedTo && row.assignedTo.trim()) {
          const assigneeKey = row.assignedTo.trim().toLowerCase();
          assignedToId = userByKey.get(assigneeKey);
          if (!assignedToId) throw new Error(`Unknown assignee: ${row.assignedTo}`);
        }

        // Resolve destination against the company's Destination masters; never
        // create new masters from arbitrary CSV text.
        const itinerary: Array<{
          country: string;
          destination: string;
          nights: number;
          sequence: number;
        }> = [];
        if (row.destination && row.destination.trim()) {
          const dest = destinationByKey.get(row.destination.trim().toLowerCase());
          if (!dest) throw new Error(`Unknown destination: ${row.destination}`);
          itinerary.push({
            country: dest.countryName,
            destination: dest.name,
            nights: 0,
            sequence: 1,
          });
        }

        const normalizedPhone = normalizePhone(phone);
        const isDuplicate =
          batchPhones.has(normalizedPhone) ||
          existingPhones.has(normalizedPhone) ||
          (email ? batchEmails.has(email) || existingEmails.has(email) : false);

        if (isDuplicate && input.skipDuplicates) {
          results.push({ row: rowNumber, customerName, status: 'SKIPPED', reason: 'Duplicate' });
          skipped += 1;
          continue;
        }

        const queryInput = toQueryInput(row);
        await queriesService.create(
          auth,
          {
            ...queryInput,
            email: email ?? null,
            ...(assignedToId ? { assignedToId } : {}),
            itinerary,
          },
          context,
        );

        imported += 1;
        results.push({ row: rowNumber, customerName, status: 'IMPORTED' });
        batchPhones.add(normalizedPhone);
        existingPhones.add(normalizedPhone);
        if (email) {
          batchEmails.add(email);
          existingEmails.add(email);
        }
      } catch (error) {
        fail(error instanceof Error ? error.message : 'Failed to import row.');
      }
    }

    return {
      total: input.rows.length,
      imported,
      skipped,
      failed: failedRows.length,
      results,
      errorCsv: {
        fileName: `lead-import-errors-${new Date().toISOString().slice(0, 10)}.csv`,
        mimeType: 'text/csv',
        content: buildErrorCsv(failedRows),
      },
    };
  },
};

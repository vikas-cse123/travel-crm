import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  flightDetailsSchema,
  sightseeingDetailsSchema,
  PERMISSIONS,
  type QuotationInput,
  type QuotationSendInput,
  type QuotationUpdate,
  type QuotationVersionInput,
  type QuotationVersionUpdate,
} from '@interscale/shared';
import type { AuthContext } from '../../middleware/authenticate.js';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors.js';
import { generateSecureToken, hashToken } from '../../utils/crypto.js';
import { resolvePagination } from '../../utils/pagination.js';
import { permissionsService } from '../auth/permissions.service.js';
import {
  getVisible as getVisibleLead,
  visibility as leadVisibility,
} from '../queries/queries.service.js';
import { templateInclude } from '../quotation-templates/quotation-templates.service.js';
import { calculatePricing } from './pricing.service.js';
import { validateMasterRefs } from './master-refs.service.js';
import { renderQuotationPdf, type QuotationPdfInput } from './pdf.service.js';
import { loadCompanyBranding } from '../../services/pdf/company-branding.js';
import {
  quotationObjectKey,
  sanitizeFileName,
  storageService,
} from '../../services/storage/storage.service.js';
import { emailService } from '../../services/email/email.service.js';
import { nextCompanyNumber, quotationAudit, type RequestContext } from './quotation.utils.js';
import { recalculateCustomerMetrics } from '../customers/customers.service.js';
import { reminderProcessor } from '../reminders/reminder-processor.service.js';

const userSelect = { id: true, fullName: true, username: true } as const;

/**
 * Normalize a client IP for weblink analytics. IPv4-mapped IPv6 is unwrapped
 * (::ffff:a.b.c.d → a.b.c.d), whitespace is trimmed, and an unresolvable value
 * falls back to a safe internal sentinel so the aggregate row always has a key.
 */
export function normalizeWeblinkIp(value: string | null | undefined): string {
  const raw = (value ?? '').trim();
  if (!raw) return '0.0.0.0';
  if (raw.startsWith('::ffff:')) return raw.slice(7);
  return raw;
}

/** One row in the weblink analytics response. */
export interface WeblinkAnalyticsEntry {
  ipAddress: string;
  type: 'HOME' | 'EXTERNAL';
  views: number;
  firstViewedAt: string;
  lastViewedAt: string;
}

export interface WeblinkAnalytics {
  totalViews: number;
  externalViews: number;
  homeIpViews: number;
  uniqueIps: number;
  entries: WeblinkAnalyticsEntry[];
}

/** Deterministic upper bound on IP rows returned in the analytics modal. */
const WEBLINK_ANALYTICS_ROW_LIMIT = 200;
export const versionInclude = {
  createdBy: { select: userSelect },
  itinerary: { orderBy: { sequence: 'asc' as const } },
  hotels: { orderBy: { sequence: 'asc' as const } },
  services: { orderBy: { sequence: 'asc' as const } },
  inclusions: { orderBy: { sequence: 'asc' as const } },
  exclusions: { orderBy: { sequence: 'asc' as const } },
  terms: { orderBy: { sequence: 'asc' as const } },
} as const;
const quotationInclude = {
  customer: { select: { id: true, customerNumber: true, displayName: true } },
  query: {
    select: {
      id: true,
      queryNumber: true,
      leadStage: true,
      assignedToId: true,
      createdById: true,
      // Used to prefill the quotation Flight tab's departure city.
      departureCity: true,
      departureCountry: true,
      itinerary: {
        orderBy: { sequence: 'asc' as const },
        select: {
          id: true,
          country: true,
          destination: true,
          nights: true,
          sequence: true,
          arrivalDate: true,
          departureDate: true,
        },
      },
    },
  },
  createdBy: { select: userSelect },
  versions: { include: versionInclude, orderBy: { versionNumber: 'desc' as const } },
  documents: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' as const } },
  emailLogs: {
    orderBy: { createdAt: 'desc' as const },
    include: { sentBy: { select: userSelect } },
  },
  booking: {
    select: { id: true, bookingNumber: true, bookingStatus: true },
  },
} as const;
type FullQuotation = Prisma.QuotationGetPayload<{ include: typeof quotationInclude }>;
type FullVersion = Prisma.QuotationVersionGetPayload<{ include: typeof versionInclude }>;

const decimal = (value: { toString(): string } | null | undefined) => value?.toString() ?? null;

async function hasCosting(auth: AuthContext) {
  return permissionsService.userHasPermission(auth.userId, PERMISSIONS.QUOTATIONS_VIEW_COSTING);
}

async function visibleWhere(auth: AuthContext, extra: Prisma.QuotationWhereInput = {}) {
  return {
    companyId: auth.companyId,
    deletedAt: null,
    query: { is: { companyId: auth.companyId, deletedAt: null, ...(await leadVisibility(auth)) } },
    ...extra,
  } satisfies Prisma.QuotationWhereInput;
}

async function getQuotation(auth: AuthContext, id: string) {
  const value = await prisma.quotation.findFirst({
    where: await visibleWhere(auth, { id }),
    include: quotationInclude,
  });
  if (!value) throw new NotFoundError('Quotation not found.');
  return value;
}

function effectiveStatus(value: { status: string; validUntil: Date | null }) {
  return value.validUntil &&
    value.validUntil < new Date() &&
    !['ACCEPTED', 'REJECTED', 'ARCHIVED'].includes(value.status)
    ? 'EXPIRED'
    : value.status;
}

/** Short-lived signed URL for the company branding logo, or null. */
async function publicCompanyLogoUrl(company: {
  logoObjectKey: string | null;
  logoConfirmedAt: Date | null;
}) {
  if (!company.logoObjectKey || !company.logoConfirmedAt) return null;
  try {
    return await storageService.createDownloadUrl(
      company.logoObjectKey,
      'logo',
      env.MASTER_MEDIA_PRESIGNED_URL_EXPIRY_SECONDS,
    );
  } catch {
    return null;
  }
}

function presentVersion(version: FullVersion, canViewCosting: boolean, customerSafe = false) {
  const {
    companyId,
    quotationId,
    subtotalCost,
    marginAmount,
    marginPercentage,
    internalNotes,
    netAmount,
    ...value
  } = version;
  void companyId;
  void quotationId;
  const strip = <T extends { companyId: string; quotationVersionId: string }>(row: T) => {
    const { companyId: _companyId, quotationVersionId: _versionId, ...rest } = row;
    void _companyId;
    void _versionId;
    return rest;
  };
  return {
    ...value,
    subtotalSellingPrice: decimal(value.subtotalSellingPrice),
    markupValue: decimal(value.markupValue),
    totalMarkup: decimal(value.totalMarkup),
    taxRate: decimal(value.taxRate),
    taxAmount: decimal(value.taxAmount),
    discountAmount: decimal(value.discountAmount),
    finalAmount: decimal(value.finalAmount),
    // Reference "Summary & Pricing" — per-passenger package pricing.
    perAdultPrice: decimal(value.perAdultPrice),
    perChildWithBedPrice: decimal(value.perChildWithBedPrice),
    perChildWithoutBedPrice: decimal(value.perChildWithoutBedPrice),
    perInfantPrice: decimal(value.perInfantPrice),
    initialPaymentAmount: decimal(value.initialPaymentAmount),
    // Reference "Visa" — single dedicated section.
    visaAmount: decimal(value.visaAmount),
    visaServiceCharge: decimal(value.visaServiceCharge),
    visaGstPercent: decimal(value.visaGstPercent),
    visaVfsCharge: decimal(value.visaVfsCharge),
    ...(canViewCosting && !customerSafe
      ? {
          subtotalCost: decimal(subtotalCost),
          marginAmount: decimal(marginAmount),
          marginPercentage: decimal(marginPercentage),
          netAmount: decimal(netAmount),
          internalNotes,
        }
      : {}),
    itinerary: version.itinerary.map(strip),
    hotels: version.hotels.map((row) => {
      const { internalCost, hotelId, hotelRoomTypeId, hotelMealPlanId, ...hotel } = strip(row);
      return {
        ...hotel,
        sellingPrice: decimal(hotel.sellingPrice),
        // Master ids are an internal editing aid. Customer-facing output
        // (public link, PDF, email) is snapshot-only, so they are omitted
        // there rather than nulled.
        ...(customerSafe ? {} : { hotelId, hotelRoomTypeId, hotelMealPlanId }),
        ...(canViewCosting && !customerSafe ? { internalCost: decimal(internalCost) } : {}),
      };
    }),
    services: version.services.map((row) => {
      const {
        unitCost,
        totalCost,
        airlineId,
        cruiseId,
        cruiseRoomTypeId,
        vehicleId,
        sightseeingId,
        addOnServiceId,
        ...service
      } = strip(row);
      return {
        ...service,
        quantity: decimal(service.quantity),
        unitSellingPrice: decimal(service.unitSellingPrice),
        totalSellingPrice: decimal(service.totalSellingPrice),
        ...(customerSafe
          ? {}
          : {
              airlineId,
              cruiseId,
              cruiseRoomTypeId,
              vehicleId,
              sightseeingId,
              addOnServiceId,
            }),
        ...(canViewCosting && !customerSafe
          ? { unitCost: decimal(unitCost), totalCost: decimal(totalCost) }
          : {}),
      };
    }),
    inclusions: version.inclusions.map(strip),
    exclusions: version.exclusions.map(strip),
    terms: version.terms.map(strip),
  };
}

function presentQuotation(value: FullQuotation, canViewCosting: boolean, customerSafe = false) {
  const { companyId, publicTokenHash, deletedAt, ...quotation } = value;
  void companyId;
  void publicTokenHash;
  void deletedAt;
  return {
    ...quotation,
    status: effectiveStatus(value),
    versions: value.versions.map((version) =>
      presentVersion(version, canViewCosting, customerSafe),
    ),
    documents: value.documents.map(({ companyId: _companyId, objectKey, bucket, ...document }) => {
      void _companyId;
      void objectKey;
      void bucket;
      return document;
    }),
  };
}

function normalizeVersionInput(input: QuotationVersionInput, allowCosting: boolean) {
  return {
    ...input,
    hotels: input.hotels.map((hotel) => ({
      ...hotel,
      internalCost: allowCosting ? (hotel.internalCost ?? 0) : 0,
      sellingPrice: hotel.sellingPrice ?? 0,
    })),
    services: input.services.map((service) => ({
      ...service,
      internalCost: allowCosting ? (service.internalCost ?? 0) : 0,
      sellingPrice: service.sellingPrice ?? 0,
    })),
  };
}

interface PaxCounts {
  adults: number;
  childrenWithBed: number;
  childrenWithoutBed: number;
  infants: number;
}

function versionCreateData(
  input: QuotationVersionInput,
  companyId: string,
  allowCosting: boolean,
  pax: PaxCounts,
) {
  const normalized = normalizeVersionInput(input, allowCosting);
  // Per-passenger prices × the lead's traveller mix drive the stored total.
  const pricing = calculatePricing({
    ...normalized,
    netAmount: allowCosting ? normalized.netAmount : 0,
    pax,
  });
  const { serviceLines, ...totals } = pricing;
  return {
    scalar: {
      title: normalized.title,
      introduction: normalized.introduction ?? null,
      weblinkHeading: normalized.weblinkHeading ?? null,
      destinationSummary: normalized.destinationSummary,
      travelStartDate: normalized.travelStartDate ?? null,
      travelEndDate: normalized.travelEndDate ?? null,
      currency: normalized.currency,
      pricingMode: normalized.pricingMode,
      markupMode: normalized.markupMode,
      markupValue: normalized.markupValue,
      taxRate: normalized.taxRate,
      // Reference "Summary & Pricing" — per-passenger package pricing.
      perAdultPrice: normalized.perAdultPrice ?? 0,
      perChildWithBedPrice: normalized.perChildWithBedPrice ?? 0,
      perChildWithoutBedPrice: normalized.perChildWithoutBedPrice ?? 0,
      perInfantPrice: normalized.perInfantPrice ?? 0,
      taxNote: normalized.taxNote ?? null,
      // Net amount is internal margin data — never taken from viewers without costing.
      netAmount: allowCosting ? (normalized.netAmount ?? 0) : 0,
      initialPaymentAmount: normalized.initialPaymentAmount ?? 0,
      paymentLink: normalized.paymentLink ?? null,
      showServiceChargesSeparately: normalized.showServiceChargesSeparately ?? false,
      markServiceChargesOutside: normalized.markServiceChargesOutside ?? false,
      hidePricing: normalized.hidePricing ?? false,
      showIndividualPricing: normalized.showIndividualPricing ?? false,
      // Reference "Inclusions & Exclusions" — rich-text blocks.
      inclusionsHtml: normalized.inclusionsHtml ?? null,
      exclusionsHtml: normalized.exclusionsHtml ?? null,
      paymentPolicies: normalized.paymentPolicies ?? null,
      cancellationPolicies: normalized.cancellationPolicies ?? null,
      bookingTerms: normalized.bookingTerms ?? null,
      // Reference "Visa" — single dedicated section.
      includeVisa: normalized.includeVisa ?? true,
      visaSectionTitle: normalized.visaSectionTitle ?? null,
      visaAmount: normalized.visaAmount ?? 0,
      visaDestination: normalized.visaDestination ?? null,
      visaType: normalized.visaType ?? null,
      visaServiceCharge: normalized.visaServiceCharge ?? 0,
      visaGstPercent: normalized.visaGstPercent ?? 0,
      visaVfsCharge: normalized.visaVfsCharge ?? 0,
      // Reference "Flight" — structured journeys/segments (JSON).
      flightDetails: (normalized.flightDetails ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      // Reference "Hotel" — editable section metadata (JSON).
      hotelDetails: (normalized.hotelDetails ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      sightseeingDetails: (normalized.sightseeingDetails ??
        Prisma.JsonNull) as Prisma.InputJsonValue,
      notes: normalized.notes ?? null,
      internalNotes: allowCosting ? (normalized.internalNotes ?? null) : null,
      ...totals,
    },
    itinerary: normalized.itinerary.map((row) => ({ ...row, companyId })),
    hotels: normalized.hotels.map((row) => ({
      ...row,
      companyId,
      internalCost: row.internalCost ?? 0,
      sellingPrice: row.sellingPrice ?? 0,
    })),
    services: normalized.services.map((row, index) => ({
      companyId,
      serviceType: row.serviceType,
      // These six are listed explicitly because this mapper enumerates fields
      // rather than spreading: anything omitted here is silently dropped.
      airlineId: row.airlineId ?? null,
      cruiseId: row.cruiseId ?? null,
      cruiseRoomTypeId: row.cruiseRoomTypeId ?? null,
      vehicleId: row.vehicleId ?? null,
      sightseeingId: row.sightseeingId ?? null,
      addOnServiceId: row.addOnServiceId ?? null,
      name: row.name,
      description: row.description,
      dayNumber: row.dayNumber,
      city: row.city,
      quantity: row.quantity,
      unitCost: row.internalCost ?? 0,
      unitSellingPrice: row.sellingPrice ?? 0,
      totalCost: serviceLines[index]?.totalCost ?? 0,
      totalSellingPrice: serviceLines[index]?.totalSellingPrice ?? 0,
      taxCategory: row.taxCategory,
      notes: row.notes,
      sequence: row.sequence,
    })),
    inclusions: normalized.inclusions.map((row) => ({ ...row, companyId })),
    exclusions: normalized.exclusions.map((row) => ({ ...row, companyId })),
    terms: normalized.terms.map((row) => ({ ...row, companyId })),
  };
}

function fromVersion(source: FullVersion): QuotationVersionInput {
  return {
    title: source.title,
    introduction: source.introduction,
    destinationSummary: source.destinationSummary,
    travelStartDate: source.travelStartDate,
    travelEndDate: source.travelEndDate,
    currency: source.currency,
    pricingMode: source.pricingMode,
    markupMode: source.markupMode,
    markupValue: source.markupValue.toNumber(),
    taxRate: source.taxRate.toNumber(),
    discountAmount: source.discountAmount.toNumber(),
    perAdultPrice: source.perAdultPrice.toNumber(),
    perChildWithBedPrice: source.perChildWithBedPrice.toNumber(),
    perChildWithoutBedPrice: source.perChildWithoutBedPrice.toNumber(),
    perInfantPrice: source.perInfantPrice.toNumber(),
    taxNote: source.taxNote,
    netAmount: source.netAmount.toNumber(),
    initialPaymentAmount: source.initialPaymentAmount.toNumber(),
    paymentLink: source.paymentLink,
    showServiceChargesSeparately: source.showServiceChargesSeparately,
    markServiceChargesOutside: source.markServiceChargesOutside,
    hidePricing: source.hidePricing,
    showIndividualPricing: source.showIndividualPricing,
    inclusionsHtml: source.inclusionsHtml,
    exclusionsHtml: source.exclusionsHtml,
    paymentPolicies: source.paymentPolicies,
    cancellationPolicies: source.cancellationPolicies,
    bookingTerms: source.bookingTerms,
    includeVisa: source.includeVisa,
    visaSectionTitle: source.visaSectionTitle,
    visaAmount: source.visaAmount.toNumber(),
    visaDestination: source.visaDestination,
    visaType: source.visaType,
    visaServiceCharge: source.visaServiceCharge.toNumber(),
    visaGstPercent: source.visaGstPercent.toNumber(),
    visaVfsCharge: source.visaVfsCharge.toNumber(),
    flightDetails: source.flightDetails as QuotationVersionInput['flightDetails'],
    hotelDetails: source.hotelDetails as QuotationVersionInput['hotelDetails'],
    sightseeingDetails: source.sightseeingDetails as QuotationVersionInput['sightseeingDetails'],
    notes: source.notes,
    internalNotes: source.internalNotes,
    itinerary: source.itinerary.map(
      ({
        id: _id,
        companyId: _companyId,
        quotationVersionId: _versionId,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...row
      }) => row,
    ),
    hotels: source.hotels.map(
      ({
        id: _id,
        companyId: _companyId,
        quotationVersionId: _versionId,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        internalCost,
        sellingPrice,
        ...row
      }) => ({
        ...row,
        internalCost: internalCost.toNumber(),
        sellingPrice: sellingPrice.toNumber(),
      }),
    ),
    services: source.services.map(
      ({
        id: _id,
        companyId: _companyId,
        quotationVersionId: _versionId,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        unitCost,
        unitSellingPrice,
        totalCost: _totalCost,
        totalSellingPrice: _totalSellingPrice,
        ...row
      }) => ({
        ...row,
        quantity: row.quantity.toNumber(),
        internalCost: unitCost.toNumber(),
        sellingPrice: unitSellingPrice.toNumber(),
      }),
    ),
    inclusions: source.inclusions.map(
      ({ id: _id, companyId: _companyId, quotationVersionId: _versionId, ...row }) => row,
    ),
    exclusions: source.exclusions.map(
      ({ id: _id, companyId: _companyId, quotationVersionId: _versionId, ...row }) => row,
    ),
    terms: source.terms.map(
      ({ id: _id, companyId: _companyId, quotationVersionId: _versionId, ...row }) => row,
    ),
  };
}

/**
 * Finds a Destination master (with a confirmed image) that matches any of the
 * quote's places. Ordered: destination-summary parts first, then itinerary
 * destinations in sequence, so the first matching destination wins. Shared by
 * the customer weblink hero (signed URL) and the PDF (raw bytes via storage).
 * Returns null when nothing matches.
 */
async function findDestinationImageRecord(
  companyId: string,
  destinationSummary: string,
  itineraryDestinations: string[],
): Promise<{ imageObjectKey: string; imageFileName: string | null } | null> {
  const orderedCandidates: string[] = [];
  const add = (value: string | null | undefined) => {
    for (const part of (value ?? '').split(/[•,>/→|-]+/)) {
      const trimmed = part.trim().toLowerCase();
      if (trimmed) orderedCandidates.push(trimmed);
    }
  };
  add(destinationSummary);
  itineraryDestinations.forEach(add);
  if (!orderedCandidates.length) return null;
  const destinations = await prisma.destination.findMany({
    where: {
      companyId,
      deletedAt: null,
      imageObjectKey: { not: null },
      imageConfirmedAt: { not: null },
    },
    select: { name: true, normalizedName: true, imageObjectKey: true, imageFileName: true },
  });
  // Exact matches first, in order of appearance in the quotation data.
  for (const candidate of orderedCandidates) {
    const exact = destinations.find(
      (row) =>
        row.name.trim().toLowerCase() === candidate ||
        row.normalizedName.trim().toLowerCase() === candidate,
    );
    if (exact?.imageObjectKey) {
      return { imageObjectKey: exact.imageObjectKey, imageFileName: exact.imageFileName };
    }
  }
  // Fuzzy fallback (no loose substring guessing when a direct match exists).
  for (const candidate of orderedCandidates) {
    if (candidate.length <= 2) continue;
    const fuzzy = destinations.find((row) => {
      const name = row.name.trim().toLowerCase();
      return name.includes(candidate) || candidate.includes(name);
    });
    if (fuzzy?.imageObjectKey) {
      return { imageObjectKey: fuzzy.imageObjectKey, imageFileName: fuzzy.imageFileName };
    }
  }
  return null;
}

/** Signed weblink hero URL; null when no destination image matches. */
async function resolveDestinationHeroImage(
  companyId: string,
  destinationSummary: string,
  itineraryDestinations: string[],
): Promise<string | null> {
  const match = await findDestinationImageRecord(
    companyId,
    destinationSummary,
    itineraryDestinations,
  );
  if (!match) return null;
  try {
    return await storageService.createDownloadUrl(
      match.imageObjectKey,
      match.imageFileName ?? 'destination.jpg',
    );
  } catch {
    return null;
  }
}

/**
 * Page-1 consultant data for the quotation PDF. Precedence: quotation
 * prepared-by (creator) → linked lead assignee → company contact fallback.
 * All lookups are tenant-scoped; missing values resolve to null so the renderer
 * omits them cleanly.
 */
async function resolvePdfConsultant(
  companyId: string,
  quotation: FullQuotation,
  companyContact: { phone: string | null; email: string },
): Promise<{ name: string | null; phone: string | null; email: string | null }> {
  const userIds = [quotation.createdById, quotation.query?.assignedToId].filter(
    (id): id is string => Boolean(id),
  );
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds }, companyId, deletedAt: null },
        select: { id: true, fullName: true, phone: true, email: true },
      })
    : [];
  const byId = new Map(users.map((user) => [user.id, user]));
  const creator = byId.get(quotation.createdById);
  const assignee = quotation.query?.assignedToId ? byId.get(quotation.query.assignedToId) : null;
  return {
    name: creator?.fullName ?? assignee?.fullName ?? null,
    phone: creator?.phone ?? assignee?.phone ?? companyContact.phone ?? null,
    email: creator?.email ?? assignee?.email ?? companyContact.email,
  };
}

/** Customer-safe hotel catalogue details used by the public quotation cards. */
async function resolveHotelPresentations(
  companyId: string,
  options: Array<{ id: string; hotelId: string | null }>,
) {
  const hotelIds = [...new Set(options.map((row) => row.hotelId).filter(Boolean))] as string[];
  if (!hotelIds.length) return {};
  const hotels = await prisma.hotel.findMany({
    where: { id: { in: hotelIds }, companyId, deletedAt: null },
    select: {
      id: true,
      starCategory: true,
      starRating: true,
      address: true,
      reviewLink: true,
      checkInTime: true,
      checkOutTime: true,
      imageObjectKey: true,
      imageFileName: true,
      imageConfirmedAt: true,
      destination: { select: { name: true, countryName: true } },
    },
  });
  const byId = new Map(
    await Promise.all(
      hotels.map(async (hotel) => {
        let imageUrl: string | null = null;
        if (hotel.imageObjectKey && hotel.imageConfirmedAt) {
          try {
            imageUrl = await storageService.createDownloadUrl(
              hotel.imageObjectKey,
              hotel.imageFileName ?? 'hotel.jpg',
            );
          } catch {
            imageUrl = null;
          }
        }
        return [
          hotel.id,
          {
            imageUrl,
            starCategory: hotel.starCategory,
            starRating: decimal(hotel.starRating),
            address: hotel.address,
            reviewLink: hotel.reviewLink,
            checkInTime: hotel.checkInTime,
            checkOutTime: hotel.checkOutTime,
            destination: hotel.destination.name,
            country: hotel.destination.countryName,
          },
        ] as const;
      }),
    ),
  );
  return Object.fromEntries(
    options.flatMap((option) => {
      const presentation = option.hotelId ? byId.get(option.hotelId) : undefined;
      return presentation ? [[option.id, presentation]] : [];
    }),
  );
}

/** Customer-safe vehicle catalogue details used by the public quotation card. */
async function resolveVehiclePresentations(
  companyId: string,
  services: Array<{ id: string; vehicleId: string | null }>,
) {
  const vehicleIds = [...new Set(services.map((row) => row.vehicleId).filter(Boolean))] as string[];
  if (!vehicleIds.length) return {};
  const vehicles = await prisma.vehicle.findMany({
    where: { id: { in: vehicleIds }, companyId, deletedAt: null },
    select: {
      id: true,
      name: true,
      vehicleType: true,
      capacity: true,
      imageObjectKey: true,
      imageFileName: true,
      imageConfirmedAt: true,
    },
  });
  const byId = new Map(
    await Promise.all(
      vehicles.map(async (vehicle) => {
        let imageUrl: string | null = null;
        if (vehicle.imageObjectKey && vehicle.imageConfirmedAt) {
          try {
            imageUrl = await storageService.createDownloadUrl(
              vehicle.imageObjectKey,
              vehicle.imageFileName ?? 'vehicle.jpg',
            );
          } catch {
            imageUrl = null;
          }
        }
        return [
          vehicle.id,
          {
            imageUrl,
            name: vehicle.name,
            vehicleType: vehicle.vehicleType,
            capacity: vehicle.capacity,
          },
        ] as const;
      }),
    ),
  );
  return Object.fromEntries(
    services.flatMap((service) => {
      const presentation = service.vehicleId ? byId.get(service.vehicleId) : undefined;
      return presentation ? [[service.id, presentation]] : [];
    }),
  );
}

/** Customer-safe Cruise master image + room-type name used by public cruise cards. */
async function resolveCruisePresentations(
  companyId: string,
  services: Array<{ id: string; cruiseId: string | null; cruiseRoomTypeId: string | null }>,
) {
  const cruiseIds = [...new Set(services.map((row) => row.cruiseId).filter(Boolean))] as string[];
  if (!cruiseIds.length) return {};
  const cruises = await prisma.cruise.findMany({
    where: { id: { in: cruiseIds }, companyId, deletedAt: null },
    select: {
      id: true,
      name: true,
      imageObjectKey: true,
      imageFileName: true,
      imageConfirmedAt: true,
      roomTypes: {
        where: { status: 'ACTIVE' },
        select: { id: true, name: true },
        orderBy: { sortOrder: 'asc' as const },
      },
    },
  });
  const roomNameById = new Map<string, string>();
  for (const cruise of cruises)
    for (const room of cruise.roomTypes) roomNameById.set(room.id, room.name);
  const byCruise = new Map(
    await Promise.all(
      cruises.map(async (cruise) => {
        let imageUrl: string | null = null;
        if (cruise.imageObjectKey && cruise.imageConfirmedAt) {
          try {
            imageUrl = await storageService.createDownloadUrl(
              cruise.imageObjectKey,
              cruise.imageFileName ?? 'cruise.jpg',
            );
          } catch {
            imageUrl = null;
          }
        }
        return [cruise.id, { imageUrl, name: cruise.name }] as const;
      }),
    ),
  );
  return Object.fromEntries(
    services.flatMap((service) => {
      const cruise = service.cruiseId ? byCruise.get(service.cruiseId) : undefined;
      if (!cruise) return [];
      return [
        [
          service.id,
          {
            imageUrl: cruise.imageUrl,
            name: cruise.name,
            roomTypeName: service.cruiseRoomTypeId
              ? (roomNameById.get(service.cruiseRoomTypeId) ?? null)
              : null,
          },
        ],
      ];
    }),
  );
}

/** Customer-safe Airline master logos used by public flight segment cards. */
async function resolveAirlinePresentations(companyId: string, flightDetails: unknown) {
  const parsed = flightDetailsSchema.safeParse(flightDetails);
  if (!parsed.success) return {};
  const segments = [...parsed.data.outbound.segments, ...parsed.data.returnJourney.segments];
  const airlineIds = [
    ...new Set(segments.map((segment) => segment.airlineId).filter(Boolean)),
  ] as string[];
  if (!airlineIds.length) return {};
  const airlines = await prisma.airline.findMany({
    where: { id: { in: airlineIds }, companyId, deletedAt: null },
    select: {
      id: true,
      name: true,
      logoObjectKey: true,
      logoFileName: true,
      logoConfirmedAt: true,
    },
  });
  return Object.fromEntries(
    await Promise.all(
      airlines.map(async (airline) => {
        let logoUrl: string | null = null;
        if (airline.logoObjectKey && airline.logoConfirmedAt) {
          try {
            logoUrl = await storageService.createDownloadUrl(
              airline.logoObjectKey,
              airline.logoFileName ?? 'airline-logo',
            );
          } catch {
            logoUrl = null;
          }
        }
        return [airline.id, { name: airline.name, logoUrl }] as const;
      }),
    ),
  );
}

/** Maps each sightseeing activity's master id to a short-lived signed image URL. */
async function resolveSightseeingPresentations(companyId: string, sightseeingDetails: unknown) {
  const parsed = sightseeingDetailsSchema.safeParse(sightseeingDetails);
  if (!parsed.success) return {};
  const ids = [
    ...new Set(
      parsed.data.days
        .flatMap((day) => day.activities.map((activity) => activity.sightseeingId))
        .filter(Boolean),
    ),
  ] as string[];
  if (!ids.length) return {};
  const rows = await prisma.sightseeing.findMany({
    where: { id: { in: ids }, companyId, deletedAt: null },
    select: { id: true, imageObjectKey: true, imageFileName: true, imageConfirmedAt: true },
  });
  return Object.fromEntries(
    await Promise.all(
      rows.map(async (row) => {
        let imageUrl: string | null = null;
        if (row.imageObjectKey && row.imageConfirmedAt) {
          try {
            imageUrl = await storageService.createDownloadUrl(
              row.imageObjectKey,
              row.imageFileName ?? 'sightseeing',
            );
          } catch {
            imageUrl = null;
          }
        }
        return [row.id, { imageUrl }] as const;
      }),
    ),
  );
}

async function getVersion(auth: AuthContext, quotationId: string, versionId: string) {
  await getQuotation(auth, quotationId);
  const version = await prisma.quotationVersion.findFirst({
    where: { id: versionId, quotationId, companyId: auth.companyId },
    include: versionInclude,
  });
  if (!version) throw new NotFoundError('Quotation version not found.');
  return version;
}

async function createVersion(
  tx: Prisma.TransactionClient,
  auth: AuthContext,
  quotationId: string,
  input: QuotationVersionInput,
  versionNumber: number,
  allowCosting: boolean,
  pax: PaxCounts,
) {
  // Single choke point for version creation: initial version, added revision,
  // duplication and template application all funnel through here.
  await validateMasterRefs(auth.companyId, input.hotels ?? [], input.services ?? []);

  // Require a departure-type sightseeing activity on the final itinerary day
  // so every generated quotation ends with a dedicated departure day.  The
  // frontend prefill already picks the correct master; this server-side check
  // catches manually edited rows that replace the departure activity.
  if (input.sightseeingDetails?.include && input.sightseeingDetails.days?.length) {
    const lastDay = input.sightseeingDetails.days[input.sightseeingDetails.days.length - 1];
    const lastActivity = lastDay?.activities?.[0];
    const activityName = (lastActivity?.name ?? '').trim();
    if (activityName) {
      const normName = activityName.toLowerCase().replace(/[\s-]+/g, ' ');
      const isDeparture =
        normName.includes('departure') || /check\s*out\s+and\s+departure/i.test(normName);
      if (!isDeparture) {
        const destName =
          input.destinationSummary.split(/[•(→>,]/)[0]?.trim() || 'this destination';
        throw new ValidationError(
          `A departure sightseeing activity is not configured for ${destName}. Add an active departure activity in Sightseeing Masters before creating the quotation.`,
        );
      }
    }
  }

  const data = versionCreateData(input, auth.companyId, allowCosting, pax);
  const version = await tx.quotationVersion.create({
    data: {
      companyId: auth.companyId,
      quotationId,
      versionNumber,
      createdById: auth.userId,
      ...data.scalar,
    },
  });
  if (data.itinerary.length)
    await tx.quotationVersionItineraryDay.createMany({
      data: data.itinerary.map((row) => ({
        ...row,
        quotationVersionId: version.id,
      })) as Prisma.QuotationVersionItineraryDayCreateManyInput[],
    });
  if (data.hotels.length)
    await tx.quotationVersionHotelOption.createMany({
      data: data.hotels.map((row) => ({
        ...row,
        quotationVersionId: version.id,
      })) as Prisma.QuotationVersionHotelOptionCreateManyInput[],
    });
  if (data.services.length)
    await tx.quotationVersionService.createMany({
      data: data.services.map((row) => ({
        ...row,
        quotationVersionId: version.id,
      })) as Prisma.QuotationVersionServiceCreateManyInput[],
    });
  if (data.inclusions.length)
    await tx.quotationVersionInclusion.createMany({
      data: data.inclusions.map((row) => ({ ...row, quotationVersionId: version.id })),
    });
  if (data.exclusions.length)
    await tx.quotationVersionExclusion.createMany({
      data: data.exclusions.map((row) => ({ ...row, quotationVersionId: version.id })),
    });
  if (data.terms.length)
    await tx.quotationVersionTerm.createMany({
      data: data.terms.map((row) => ({ ...row, quotationVersionId: version.id })),
    });
  return tx.quotationVersion.findUniqueOrThrow({
    where: { id: version.id },
    include: versionInclude,
  });
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ??
      character,
  );
}

export const quotationsService = {
  async list(auth: AuthContext, query: Record<string, unknown>) {
    const page = resolvePagination({
      page: Number(query.page) || undefined,
      pageSize: Number(query.pageSize) || undefined,
    });
    const search = typeof query.search === 'string' ? query.search : undefined;
    const status = typeof query.status === 'string' ? query.status : undefined;
    const destination = typeof query.destination === 'string' ? query.destination : undefined;
    const where = await visibleWhere(auth, {
      ...(status === 'EXPIRED'
        ? {
            validUntil: { lt: new Date() },
            status: { notIn: ['ACCEPTED', 'REJECTED', 'ARCHIVED'] },
          }
        : status
          ? { status: status as Prisma.EnumQuotationStatusFilter }
          : {}),
      ...(destination
        ? { destinationSummary: { contains: destination, mode: 'insensitive' } }
        : {}),
      ...(typeof query.createdById === 'string' ? { createdById: query.createdById } : {}),
      ...(search
        ? {
            OR: [
              { quotationNumber: { contains: search, mode: 'insensitive' } },
              { customerName: { contains: search, mode: 'insensitive' } },
              { customerPhone: { contains: search } },
              { destinationSummary: { contains: search, mode: 'insensitive' } },
              { query: { queryNumber: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    });
    const [rows, total, costing] = await Promise.all([
      prisma.quotation.findMany({
        where,
        include: quotationInclude,
        orderBy: { updatedAt: 'desc' },
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
      prisma.quotation.count({ where }),
      hasCosting(auth),
    ]);
    const counts = await prisma.quotation.groupBy({
      by: ['status'],
      where: await visibleWhere(auth),
      _count: { _all: true },
    });
    const accepted = rows.filter((row) => row.status === 'ACCEPTED').length;
    const decided = rows.filter((row) => ['ACCEPTED', 'REJECTED'].includes(row.status)).length;
    return {
      data: rows.map((row) => presentQuotation(row, costing)),
      pagination: { ...page, total, totalPages: total ? Math.ceil(total / page.pageSize) : 0 },
      analytics: {
        byStatus: Object.fromEntries(counts.map((row) => [row.status, row._count._all])),
        totalQuotedValue: rows
          .reduce((sum, row) => sum + Number(row.versions[0]?.finalAmount ?? 0), 0)
          .toFixed(2),
        acceptanceRate: decided ? Number(((accepted / decided) * 100).toFixed(1)) : 0,
      },
    };
  },

  async details(auth: AuthContext, id: string) {
    const [quotation, costing, activityTimeline] = await Promise.all([
      getQuotation(auth, id),
      hasCosting(auth),
      prisma.activityLog.findMany({
        where: {
          companyId: auth.companyId,
          entityType: { in: ['Quotation', 'QuotationDocument'] },
          OR: [{ entityId: id }, { metadata: { path: ['quotationId'], equals: id } }],
        },
        select: {
          id: true,
          action: true,
          metadata: true,
          createdAt: true,
          actorUser: { select: userSelect },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { ...presentQuotation(quotation, costing), activityTimeline };
  },

  async create(auth: AuthContext, input: QuotationInput, context: RequestContext) {
    const lead = await getVisibleLead(auth, input.queryId);
    const costing = await hasCosting(auth);
    // Company default quotation terms are used only when neither the request nor
    // a source template supplies terms; existing quotations are never changed.
    const companyDefaults = await prisma.company.findUniqueOrThrow({
      where: { id: auth.companyId },
      select: { defaultQuotationTerms: true },
    });
    const defaultTermRows = companyDefaults.defaultQuotationTerms
      ? [{ content: companyDefaults.defaultQuotationTerms, sequence: 1 }]
      : [];
    let source: QuotationVersionInput | undefined;
    if (input.templateId) {
      const template = await prisma.quotationTemplate.findFirst({
        where: {
          id: input.templateId,
          companyId: auth.companyId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        include: templateInclude,
      });
      if (!template) throw new NotFoundError('Active quotation template not found.');
      source = {
        title: template.name,
        introduction: template.description,
        destinationSummary: template.destinationSummary,
        travelStartDate: input.travelStartDate ?? lead.travelStartDate,
        travelEndDate: input.travelEndDate ?? lead.travelEndDate,
        currency: input.currency ?? template.baseCurrency,
        pricingMode: 'ITEMIZED',
        markupMode: 'NONE',
        markupValue: 0,
        taxRate: 0,
        discountAmount: 0,
        notes: null,
        internalNotes: template.internalNotes,
        itinerary: template.itinerary.map(
          ({
            id: _id,
            companyId: _companyId,
            templateId: _templateId,
            createdAt: _createdAt,
            updatedAt: _updatedAt,
            ...row
          }) => ({ ...row, date: null }),
        ),
        hotels: template.hotels.map(
          ({
            id: _id,
            companyId: _companyId,
            templateId: _templateId,
            createdAt: _createdAt,
            updatedAt: _updatedAt,
            internalCost,
            sellingPrice,
            ...row
          }) => ({
            ...row,
            internalCost: internalCost?.toNumber(),
            sellingPrice: sellingPrice?.toNumber(),
          }),
        ),
        services: template.services.map(
          ({
            id: _id,
            companyId: _companyId,
            templateId: _templateId,
            createdAt: _createdAt,
            updatedAt: _updatedAt,
            quantity,
            internalCost,
            sellingPrice,
            ...row
          }) => ({
            ...row,
            quantity: quantity.toNumber(),
            internalCost: internalCost?.toNumber(),
            sellingPrice: sellingPrice?.toNumber(),
          }),
        ),
        inclusions: template.inclusions.map(
          ({ id: _id, companyId: _companyId, templateId: _templateId, ...row }) => row,
        ),
        exclusions: template.exclusions.map(
          ({ id: _id, companyId: _companyId, templateId: _templateId, ...row }) => row,
        ),
        terms: template.terms.map(
          ({ id: _id, companyId: _companyId, templateId: _templateId, ...row }) => row,
        ),
      };
    } else if (input.sourceVersionId) {
      const original = await prisma.quotationVersion.findFirst({
        where: {
          id: input.sourceVersionId,
          companyId: auth.companyId,
          quotation: await visibleWhere(auth),
        },
        include: versionInclude,
      });
      if (!original) throw new NotFoundError('Source quotation version not found.');
      source = fromVersion(original);
    }
    const destination =
      input.destinationSummary ??
      source?.destinationSummary ??
      (lead.itinerary.map((row) => row.destination).join(' • ') ||
        lead.departureCity ||
        'Travel package');
    const primaryDestination =
      lead.itinerary[0]?.destination?.trim() ||
      destination.split(/[•(→>,]/)[0]?.trim() ||
      destination;
    const defaultTitle = `${primaryDestination} Package for ${lead.customerName}`;
    const version: QuotationVersionInput = {
      title: input.version?.title ?? source?.title ?? defaultTitle,
      introduction:
        input.version?.introduction ??
        source?.introduction ??
        `A travel proposal prepared for ${lead.customerName}.`,
      destinationSummary: input.version?.destinationSummary ?? destination,
      travelStartDate:
        input.version?.travelStartDate ??
        input.travelStartDate ??
        source?.travelStartDate ??
        lead.travelStartDate,
      travelEndDate:
        input.version?.travelEndDate ??
        input.travelEndDate ??
        source?.travelEndDate ??
        lead.travelEndDate,
      currency: input.version?.currency ?? input.currency ?? source?.currency ?? lead.currency,
      pricingMode: input.version?.pricingMode ?? source?.pricingMode ?? 'ITEMIZED',
      markupMode: input.version?.markupMode ?? source?.markupMode ?? 'NONE',
      markupValue: input.version?.markupValue ?? source?.markupValue ?? 0,
      taxRate: input.version?.taxRate ?? source?.taxRate ?? 0,
      discountAmount: input.version?.discountAmount ?? source?.discountAmount ?? 0,
      notes: input.version?.notes ?? source?.notes ?? null,
      internalNotes: input.version?.internalNotes ?? source?.internalNotes ?? null,
      itinerary:
        input.version?.itinerary ??
        source?.itinerary ??
        lead.itinerary.map((row, index) => ({
          dayNumber: index + 1,
          date: row.arrivalDate,
          title: row.destination,
          destination: row.destination,
          description: row.notes ?? `${row.nights} night stay in ${row.destination}.`,
          meals: null,
          overnightLocation: row.destination,
          activities: null,
          transfers: null,
          notes: null,
          sequence: index + 1,
        })),
      hotels: input.version?.hotels ?? source?.hotels ?? [],
      services:
        input.version?.services ??
        source?.services ??
        lead.services.map((row, index) => ({
          serviceType: row.serviceType,
          name: row.serviceType.replaceAll('_', ' ').toLowerCase(),
          description: null,
          dayNumber: null,
          city: null,
          quantity: 1,
          internalCost: 0,
          sellingPrice: 0,
          taxCategory: null,
          notes: null,
          sequence: index + 1,
        })),
      inclusions: input.version?.inclusions ?? source?.inclusions ?? [],
      exclusions: input.version?.exclusions ?? source?.exclusions ?? [],
      terms: input.version?.terms ?? source?.terms ?? defaultTermRows,
    };
    const created = await prisma.$transaction(async (tx) => {
      const quotationNumber = await nextCompanyNumber(tx, auth.companyId, 'quotation');
      // A public weblink is provisioned as part of quotation creation: the link
      // and the quotation are one workflow, so the Leads Weblink column never
      // needs a manual Create action. The token is stored raw (for URL
      // reconstruction) and hashed (for secure lookup) in the same write.
      const token = generateSecureToken(32);
      const quotation = await tx.quotation.create({
        data: {
          companyId: auth.companyId,
          customerId: lead.customerId,
          quotationNumber,
          queryId: lead.id,
          sourceTemplateId: input.templateId ?? null,
          createdById: auth.userId,
          customerName: input.customerName ?? lead.customerName,
          customerEmail: input.customerEmail || lead.email || null,
          customerPhone: input.customerPhone ?? lead.phone,
          destinationSummary: destination,
          travelStartDate: input.travelStartDate ?? lead.travelStartDate,
          travelEndDate: input.travelEndDate ?? lead.travelEndDate,
          adults: input.adults ?? lead.adults,
          childrenWithBed: input.childrenWithBed ?? lead.childrenWithBed,
          childrenWithoutBed: input.childrenWithoutBed ?? lead.childrenWithoutBed,
          infants: input.infants ?? lead.infants,
          rooms: input.rooms ?? lead.rooms,
          currency: input.currency ?? lead.currency,
          validUntil: input.validUntil ?? null,
          publicToken: token,
          publicTokenHash: hashToken(token),
          publicTokenExpiresAt: input.validUntil ?? null,
        },
      });
      const initial = await createVersion(tx, auth, quotation.id, version, 1, costing, quotation);
      await tx.quotation.update({
        where: { id: quotation.id },
        data: { currentVersionId: initial.id, publicVersionId: initial.id },
      });
      if (input.templateId)
        await tx.quotationTemplate.update({
          where: { id: input.templateId },
          data: { usageCount: { increment: 1 } },
        });
      if (lead.leadStage === 'QUALIFIED')
        await tx.query.update({
          where: { id: lead.id },
          data: { leadStage: 'QUOTATION_REQUIRED', quotationRequired: true },
        });
      await tx.activityLog.create({
        data: quotationAudit(auth, 'QUOTATION_CREATED', 'Quotation', quotation.id, context, {
          quotationNumber,
          queryId: lead.id,
          templateId: input.templateId ?? null,
        }),
      });
      await tx.activityLog.create({
        data: quotationAudit(
          auth,
          'QUOTATION_VERSION_CREATED',
          'Quotation',
          quotation.id,
          context,
          { versionId: initial.id, versionNumber: 1 },
        ),
      });
      if (lead.customerId) await recalculateCustomerMetrics(tx, auth.companyId, lead.customerId);
      return tx.quotation.findUniqueOrThrow({
        where: { id: quotation.id },
        include: quotationInclude,
      });
    });
    reminderProcessor.scheduleEvent(auth.companyId, ['QUOTATION_EXPIRY']);
    return presentQuotation(created, costing);
  },

  async update(auth: AuthContext, id: string, input: QuotationUpdate, context: RequestContext) {
    const existing = await getQuotation(auth, id);
    if (existing.status === 'ACCEPTED')
      throw new ConflictError('Accepted quotations cannot be changed.');
    const value = await prisma.quotation.update({
      where: { id },
      data: {
        ...(input.customerName !== undefined ? { customerName: input.customerName } : {}),
        ...(input.customerEmail !== undefined
          ? { customerEmail: input.customerEmail || null }
          : {}),
        ...(input.customerPhone !== undefined ? { customerPhone: input.customerPhone } : {}),
        ...(input.destinationSummary !== undefined
          ? { destinationSummary: input.destinationSummary }
          : {}),
        ...(input.travelStartDate !== undefined ? { travelStartDate: input.travelStartDate } : {}),
        ...(input.travelEndDate !== undefined ? { travelEndDate: input.travelEndDate } : {}),
        ...(input.adults !== undefined ? { adults: input.adults } : {}),
        ...(input.childrenWithBed !== undefined ? { childrenWithBed: input.childrenWithBed } : {}),
        ...(input.childrenWithoutBed !== undefined
          ? { childrenWithoutBed: input.childrenWithoutBed }
          : {}),
        ...(input.infants !== undefined ? { infants: input.infants } : {}),
        ...(input.rooms !== undefined ? { rooms: input.rooms } : {}),
        ...(input.currency !== undefined ? { currency: input.currency } : {}),
        ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
      },
      include: quotationInclude,
    });
    await prisma.activityLog.create({
      data: quotationAudit(auth, 'QUOTATION_UPDATED', 'Quotation', id, context),
    });
    return presentQuotation(value, await hasCosting(auth));
  },

  async archive(auth: AuthContext, id: string, context: RequestContext) {
    const existing = await getQuotation(auth, id);
    if (existing.status === 'ACCEPTED')
      throw new ConflictError('Accepted quotations cannot be archived.');
    await prisma.$transaction(async (tx) => {
      await tx.quotation.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: 'ARCHIVED',
          publicTokenHash: null,
          publicTokenExpiresAt: null,
        },
      });
      if (existing.customerId)
        await recalculateCustomerMetrics(tx, auth.companyId, existing.customerId);
      await tx.activityLog.create({
        data: quotationAudit(auth, 'QUOTATION_ARCHIVED', 'Quotation', id, context),
      });
    });
    return { id, archived: true };
  },

  async versions(auth: AuthContext, id: string) {
    const quotation = await getQuotation(auth, id);
    const costing = await hasCosting(auth);
    return quotation.versions.map((version) => presentVersion(version, costing));
  },

  async version(auth: AuthContext, id: string, versionId: string) {
    return presentVersion(await getVersion(auth, id, versionId), await hasCosting(auth));
  },

  async createRevision(
    auth: AuthContext,
    id: string,
    input: QuotationVersionInput | undefined,
    sourceVersionId: string | undefined,
    context: RequestContext,
  ) {
    const quotation = await getQuotation(auth, id);
    if (quotation.status === 'ACCEPTED')
      throw new ConflictError('Accepted quotations cannot be revised.');
    const source = sourceVersionId
      ? await getVersion(auth, id, sourceVersionId)
      : quotation.versions[0];
    if (!source && !input) throw new ValidationError('Version details are required.');
    const body = input ?? fromVersion(source!);
    const number = Math.max(0, ...quotation.versions.map((version) => version.versionNumber)) + 1;
    const costing = await hasCosting(auth);
    const created = await prisma.$transaction(async (tx) => {
      const version = await createVersion(tx, auth, id, body, number, costing, quotation);
      await tx.quotation.update({
        where: { id },
        data: {
          currentVersionId: version.id,
          status: 'DRAFT',
          acceptedVersionId: null,
          rejectedAt: null,
          rejectionReason: null,
        },
      });
      await tx.activityLog.create({
        data: quotationAudit(auth, 'QUOTATION_VERSION_CREATED', 'Quotation', id, context, {
          versionId: version.id,
          versionNumber: number,
          sourceVersionId: source?.id ?? null,
        }),
      });
      return version;
    });
    return presentVersion(created, costing);
  },

  async updateVersion(
    auth: AuthContext,
    id: string,
    versionId: string,
    input: QuotationVersionUpdate,
    context: RequestContext,
  ) {
    const quotation = await getQuotation(auth, id);
    const existing = await getVersion(auth, id, versionId);
    if (existing.status !== 'DRAFT')
      throw new ConflictError('Finalized versions are immutable. Create a revision instead.');
    const costing = await hasCosting(auth);
    const merged = { ...fromVersion(existing), ...input } as QuotationVersionInput;
    await validateMasterRefs(auth.companyId, merged.hotels ?? [], merged.services ?? []);
    const normalized = versionCreateData(merged, auth.companyId, costing, quotation);
    const result = await prisma.$transaction(async (tx) => {
      await tx.quotationVersion.update({ where: { id: versionId }, data: normalized.scalar });
      await Promise.all([
        tx.quotationVersionItineraryDay.deleteMany({
          where: { companyId: auth.companyId, quotationVersionId: versionId },
        }),
        tx.quotationVersionHotelOption.deleteMany({
          where: { companyId: auth.companyId, quotationVersionId: versionId },
        }),
        tx.quotationVersionService.deleteMany({
          where: { companyId: auth.companyId, quotationVersionId: versionId },
        }),
        tx.quotationVersionInclusion.deleteMany({
          where: { companyId: auth.companyId, quotationVersionId: versionId },
        }),
        tx.quotationVersionExclusion.deleteMany({
          where: { companyId: auth.companyId, quotationVersionId: versionId },
        }),
        tx.quotationVersionTerm.deleteMany({
          where: { companyId: auth.companyId, quotationVersionId: versionId },
        }),
      ]);
      if (normalized.itinerary.length)
        await tx.quotationVersionItineraryDay.createMany({
          data: normalized.itinerary.map((row) => ({
            ...row,
            quotationVersionId: versionId,
          })) as Prisma.QuotationVersionItineraryDayCreateManyInput[],
        });
      if (normalized.hotels.length)
        await tx.quotationVersionHotelOption.createMany({
          data: normalized.hotels.map((row) => ({
            ...row,
            quotationVersionId: versionId,
          })) as Prisma.QuotationVersionHotelOptionCreateManyInput[],
        });
      if (normalized.services.length)
        await tx.quotationVersionService.createMany({
          data: normalized.services.map((row) => ({
            ...row,
            quotationVersionId: versionId,
          })) as Prisma.QuotationVersionServiceCreateManyInput[],
        });
      if (normalized.inclusions.length)
        await tx.quotationVersionInclusion.createMany({
          data: normalized.inclusions.map((row) => ({ ...row, quotationVersionId: versionId })),
        });
      if (normalized.exclusions.length)
        await tx.quotationVersionExclusion.createMany({
          data: normalized.exclusions.map((row) => ({ ...row, quotationVersionId: versionId })),
        });
      if (normalized.terms.length)
        await tx.quotationVersionTerm.createMany({
          data: normalized.terms.map((row) => ({ ...row, quotationVersionId: versionId })),
        });
      await tx.activityLog.create({
        data: quotationAudit(auth, 'QUOTATION_UPDATED', 'Quotation', id, context, { versionId }),
      });
      return tx.quotationVersion.findUniqueOrThrow({
        where: { id: versionId },
        include: versionInclude,
      });
    });
    return presentVersion(result, costing);
  },

  async finalize(auth: AuthContext, id: string, versionId: string, context: RequestContext) {
    const quotation = await getQuotation(auth, id);
    const version = await getVersion(auth, id, versionId);
    if (quotation.status === 'ACCEPTED')
      throw new ConflictError('Accepted quotations are immutable.');
    if (version.status !== 'DRAFT') throw new ConflictError('This version is already finalized.');
    const result = await prisma.$transaction(async (tx) => {
      await tx.quotationVersion.updateMany({
        where: { quotationId: id, companyId: auth.companyId, status: 'FINALIZED' },
        data: { status: 'SUPERSEDED' },
      });
      const finalized = await tx.quotationVersion.update({
        where: { id: versionId },
        data: { status: 'FINALIZED', finalizedAt: new Date() },
        include: versionInclude,
      });
      await tx.quotation.update({ where: { id }, data: { currentVersionId: versionId } });
      await tx.activityLog.create({
        data: quotationAudit(auth, 'QUOTATION_VERSION_FINALIZED', 'Quotation', id, context, {
          versionId,
          versionNumber: version.versionNumber,
        }),
      });
      return finalized;
    });
    return presentVersion(result, await hasCosting(auth));
  },

  async generatePdf(
    auth: AuthContext,
    id: string,
    versionId: string,
    context: RequestContext,
    force = false,
  ) {
    const quotation = await getQuotation(auth, id);
    const version = await getVersion(auth, id, versionId);
    if (version.status === 'DRAFT')
      throw new ConflictError('Finalize the version before generating a PDF.');
    const existing = !force
      ? await prisma.quotationDocument.findFirst({
          where: {
            companyId: auth.companyId,
            quotationId: id,
            quotationVersionId: versionId,
            documentType: 'QUOTATION_PDF',
            status: 'AVAILABLE',
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        })
      : null;
    if (existing) {
      const stored = await storageService.headObject(existing.objectKey);
      if (stored) return { ...existing, bucket: undefined, objectKey: undefined, reused: true };
      await prisma.quotationDocument.update({
        where: { id: existing.id },
        data: { status: 'FAILED' },
      });
    }
    // Customer-facing branding (logo + colour + contact + footer data).
    const branding = await loadCompanyBranding(auth.companyId);
    const profile = await prisma.company.findUniqueOrThrow({
      where: { id: auth.companyId },
      select: { operatingSinceYear: true, tripsSold: true, tan: true },
    });
    const company = {
      name: branding.name,
      email: branding.email,
      phone: branding.phone,
      website: branding.website,
      address: branding.address,
      primaryColor: branding.primaryColor,
      operatingSinceYear: profile.operatingSinceYear,
      tripsSold: profile.tripsSold,
      tan: profile.tan,
      taxRegistrationNumber: branding.taxRegistrationNumber,
      logo: branding.logo,
    };
    // Page-1 consultant strip: prepared-by/creator → lead assignee → company.
    const consultant = await resolvePdfConsultant(auth.companyId, quotation, company);

    // --- PDF image resolution: server-side buffers, never signed URLs ----------
    let images: QuotationPdfInput['images'] | undefined;
    try {
      const imageCache = new Map<string, Buffer | null>();
      const fetchImage = async (key: string | null | undefined): Promise<Buffer | null> => {
        if (!key) return null;
        const cached = imageCache.get(key);
        if (cached !== undefined) return cached;
        try {
          const buf = await storageService.getObject(key);
          imageCache.set(key, buf);
          return buf;
        } catch {
          imageCache.set(key, null);
          return null;
        }
      };

      // Destination hero image: first matching destination in the quotation's
      // ordered destination/itinerary data (bytes fetched via the shared cache).
      let coverImage: Buffer | null = null;
      const destRecord = await findDestinationImageRecord(
        auth.companyId,
        quotation.destinationSummary,
        version.itinerary.map((day) => day.destination),
      );
      if (destRecord) {
        coverImage = await fetchImage(destRecord.imageObjectKey);
      }

      // Hotel images
      const hotelIds = version.hotels
        .map((h) => h.hotelId)
        .filter((id): id is string => Boolean(id));
      const hotelImageMap = new Map<string, Buffer | null>();
      if (hotelIds.length) {
        const hotelMasters = await prisma.hotel.findMany({
          where: { companyId: auth.companyId, id: { in: hotelIds }, imageObjectKey: { not: null }, imageConfirmedAt: { not: null } },
          select: { id: true, imageObjectKey: true },
        });
        for (const h of hotelMasters) {
          hotelImageMap.set(h.id, await fetchImage(h.imageObjectKey));
        }
      }
      const hotelImages = version.hotels.map((h) =>
        h.hotelId ? (hotelImageMap.get(h.hotelId) ?? null) : null,
      );

      // Sightseeing activity images
      const sightseeingIds: string[] = [];
      const ssData = version.sightseeingDetails as Record<string, unknown> | null;
      if (ssData?.days && Array.isArray(ssData.days)) {
        for (const day of ssData.days as Array<Record<string, unknown>>) {
          const acts = Array.isArray(day.activities) ? (day.activities as Array<Record<string, unknown>>) : [];
          for (const act of acts) {
            const sid = act.sightseeingId;
            if (sid && typeof sid === 'string') sightseeingIds.push(sid);
          }
        }
      }
      const sightseeingImageMap = new Map<string, Buffer | null>();
      if (sightseeingIds.length) {
        const uniqueIds = [...new Set(sightseeingIds)];
        const ssMasters = await prisma.sightseeing.findMany({
          where: { companyId: auth.companyId, id: { in: uniqueIds }, imageObjectKey: { not: null }, imageConfirmedAt: { not: null } },
          select: { id: true, imageObjectKey: true },
        });
        for (const s of ssMasters) {
          sightseeingImageMap.set(s.id, await fetchImage(s.imageObjectKey));
        }
      }
      const sightseeingImages = Object.fromEntries(sightseeingImageMap);

      // Service images (vehicles, cruises)
      const serviceImageMap = new Map<string, Buffer | null>();
      const vehicleIds = version.services
        .filter((s) => s.vehicleId)
        .map((s) => s.vehicleId as string);
      const cruiseIds = version.services
        .filter((s) => s.cruiseId)
        .map((s) => s.cruiseId as string);
      if (vehicleIds.length) {
        const uniqueIds = [...new Set(vehicleIds)];
        const vehicleMasters = await prisma.vehicle.findMany({
          where: { companyId: auth.companyId, id: { in: uniqueIds }, imageObjectKey: { not: null }, imageConfirmedAt: { not: null } },
          select: { id: true, imageObjectKey: true },
        });
        for (const v of vehicleMasters) {
          serviceImageMap.set(v.id, await fetchImage(v.imageObjectKey));
        }
      }
      if (cruiseIds.length) {
        const uniqueIds = [...new Set(cruiseIds)];
        const cruiseMasters = await prisma.cruise.findMany({
          where: { companyId: auth.companyId, id: { in: uniqueIds }, imageObjectKey: { not: null }, imageConfirmedAt: { not: null } },
          select: { id: true, imageObjectKey: true },
        });
        for (const c of cruiseMasters) {
          serviceImageMap.set(c.id, await fetchImage(c.imageObjectKey));
        }
      }
      const serviceImages = version.services.map((s) => {
        const masterId = s.vehicleId ?? s.cruiseId ?? null;
        return masterId ? (serviceImageMap.get(masterId) ?? null) : null;
      });

      // Airline logos: resolve from the flight segment airline IDs (stored on
      // the quotation-version flight snapshot), fetched via the shared cache.
      const airlineImageMap = new Map<string, Buffer | null>();
      const fd = version.flightDetails as
        | { include?: boolean; outbound?: { segments?: Array<{ airlineId?: string | null }> }; returnJourney?: { segments?: Array<{ airlineId?: string | null }> } }
        | null
        | undefined;
      const airlineIds = [
        ...(fd?.outbound?.segments ?? []),
        ...(fd?.returnJourney?.segments ?? []),
      ]
        .map((s) => s.airlineId)
        .filter((id): id is string => Boolean(id));
      const uniqueAirlineIds = [...new Set(airlineIds)];
      if (uniqueAirlineIds.length) {
        const airlineMasters = await prisma.airline.findMany({
          where: { companyId: auth.companyId, id: { in: uniqueAirlineIds }, logoObjectKey: { not: null }, logoConfirmedAt: { not: null } },
          select: { id: true, logoObjectKey: true },
        });
        for (const a of airlineMasters) {
          airlineImageMap.set(a.id, await fetchImage(a.logoObjectKey));
        }
      }
      const airlineImages = Object.fromEntries(airlineImageMap);

      images = {
        cover: coverImage,
        hotels: hotelImages,
        services: serviceImages,
        sightseeing: sightseeingImages,
        airlines: airlineImages,
      };
    } catch {
      // Image resolution is best-effort; never block PDF generation.
      images = undefined;
    }

    const pdf = await renderQuotationPdf(
      images
        ? { company, consultant, quotation, version, images }
        : { company, consultant, quotation, version },
    );
    const checksum = createHash('sha256').update(pdf).digest('hex');
    const documentId = randomUUID();
    // Meaningful filename: <quotation-number>-<customer-slug>-v<version>-quotation.pdf.
    const customerSlug = quotation.customerName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const fileName = sanitizeFileName(
      `${quotation.quotationNumber}-${customerSlug ? `${customerSlug}-` : ''}v${version.versionNumber}-quotation.pdf`,
    );
    const objectKey = quotationObjectKey({
      companyId: auth.companyId,
      quotationId: id,
      versionId,
      documentId,
      fileName,
    });
    await storageService.putObject({
      key: objectKey,
      body: pdf,
      contentType: 'application/pdf',
      checksum,
    });
    const document = await prisma.$transaction(async (tx) => {
      const created = await tx.quotationDocument.create({
        data: {
          id: documentId,
          companyId: auth.companyId,
          quotationId: id,
          quotationVersionId: versionId,
          storageProvider: storageService.provider,
          bucket: storageService.bucket,
          objectKey,
          fileName,
          mimeType: 'application/pdf',
          fileSize: pdf.length,
          checksum,
          documentType: 'QUOTATION_PDF',
          status: 'AVAILABLE',
          generatedById: auth.userId,
        },
      });
      await tx.activityLog.create({
        data: quotationAudit(auth, 'QUOTATION_PDF_GENERATED', 'Quotation', id, context, {
          versionId,
          documentId,
        }),
      });
      return created;
    });
    return { ...document, bucket: undefined, objectKey: undefined, reused: false };
  },

  async documents(auth: AuthContext, id: string) {
    await getQuotation(auth, id);
    return prisma.quotationDocument.findMany({
      where: { companyId: auth.companyId, quotationId: id, deletedAt: null },
      select: {
        id: true,
        quotationVersionId: true,
        fileName: true,
        mimeType: true,
        fileSize: true,
        checksum: true,
        documentType: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async downloadUrl(auth: AuthContext, id: string, documentId: string) {
    await getQuotation(auth, id);
    const document = await prisma.quotationDocument.findFirst({
      where: {
        id: documentId,
        quotationId: id,
        companyId: auth.companyId,
        status: 'AVAILABLE',
        deletedAt: null,
      },
    });
    if (!document) throw new NotFoundError('Document not found.');
    return {
      url: await storageService.createDownloadUrl(document.objectKey, document.fileName),
      expiresInSeconds: env.AWS_S3_PRESIGNED_URL_EXPIRY_SECONDS,
    };
  },

  /** Aggregated weblink view analytics for one quotation (tenant-scoped). */
  async weblinkAnalytics(auth: AuthContext, id: string): Promise<WeblinkAnalytics> {
    await getQuotation(auth, id);
    const [rows, totals] = await Promise.all([
      prisma.quotationWeblinkView.findMany({
        where: { companyId: auth.companyId, quotationId: id },
        orderBy: [{ lastViewedAt: 'desc' }, { ipAddress: 'asc' }],
        take: WEBLINK_ANALYTICS_ROW_LIMIT,
        select: {
          ipAddress: true,
          type: true,
          viewCount: true,
          firstViewedAt: true,
          lastViewedAt: true,
        },
      }),
      prisma.quotationWeblinkView.aggregate({
        where: { companyId: auth.companyId, quotationId: id },
        _sum: { viewCount: true },
        _count: { _all: true },
      }),
    ]);
    const byType = await prisma.quotationWeblinkView.groupBy({
      by: ['type'],
      where: { companyId: auth.companyId, quotationId: id },
      _sum: { viewCount: true },
    });
    const sumFor = (type: 'HOME' | 'EXTERNAL') =>
      byType.find((row) => row.type === type)?._sum.viewCount ?? 0;
    return {
      totalViews: totals._sum.viewCount ?? 0,
      externalViews: sumFor('EXTERNAL'),
      homeIpViews: sumFor('HOME'),
      uniqueIps: totals._count._all,
      entries: rows.map((row) => ({
        ipAddress: row.ipAddress,
        type: row.type === 'HOME' ? 'HOME' : 'EXTERNAL',
        views: row.viewCount,
        firstViewedAt: row.firstViewedAt.toISOString(),
        lastViewedAt: row.lastViewedAt.toISOString(),
      })),
    };
  },

  async requestUpload(
    auth: AuthContext,
    id: string,
    input: {
      quotationVersionId?: string | null;
      fileName: string;
      mimeType: string;
      fileSize: number;
      documentType: 'SUPPORTING_ATTACHMENT' | 'HOTEL_IMAGE' | 'ITINERARY_IMAGE';
    },
  ) {
    await getQuotation(auth, id);
    if (input.fileSize > env.MAX_UPLOAD_SIZE_MB * 1024 * 1024)
      throw new ValidationError(`Files may not exceed ${env.MAX_UPLOAD_SIZE_MB} MB.`);
    const extension = input.fileName.toLowerCase().split('.').pop();
    const allowedExtensions: Record<string, readonly string[]> = {
      'application/pdf': ['pdf'],
      'image/jpeg': ['jpg', 'jpeg'],
      'image/png': ['png'],
      'image/webp': ['webp'],
    };
    if (!extension || !allowedExtensions[input.mimeType]?.includes(extension))
      throw new ValidationError('The file extension does not match the approved MIME type.');
    const existingAttachments = await prisma.quotationDocument.count({
      where: {
        companyId: auth.companyId,
        quotationId: id,
        documentType: { not: 'QUOTATION_PDF' },
        deletedAt: null,
      },
    });
    if (existingAttachments >= 20)
      throw new ValidationError('A quotation may contain at most 20 attachments.');
    if (input.quotationVersionId) await getVersion(auth, id, input.quotationVersionId);
    const documentId = randomUUID();
    const fileName = sanitizeFileName(input.fileName);
    const versionId = input.quotationVersionId ?? null;
    const objectKey = quotationObjectKey({
      companyId: auth.companyId,
      quotationId: id,
      versionId,
      documentId,
      fileName,
      attachment: true,
    });
    const document = await prisma.quotationDocument.create({
      data: {
        id: documentId,
        companyId: auth.companyId,
        quotationId: id,
        quotationVersionId: versionId,
        storageProvider: storageService.provider,
        bucket: storageService.bucket,
        objectKey,
        fileName,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        documentType: input.documentType,
        status: 'PENDING',
        generatedById: auth.userId,
      },
    });
    return {
      documentId: document.id,
      uploadUrl: await storageService.createUploadUrl(objectKey, input.mimeType, input.fileSize),
      expiresInSeconds: env.AWS_S3_PRESIGNED_URL_EXPIRY_SECONDS,
      requiredHeaders: {
        'Content-Type': input.mimeType,
        ...(storageService.provider === 'S3'
          ? { 'x-amz-server-side-encryption': env.AWS_S3_SERVER_SIDE_ENCRYPTION }
          : {}),
      },
    };
  },

  async confirmUpload(auth: AuthContext, id: string, documentId: string, context: RequestContext) {
    await getQuotation(auth, id);
    const document = await prisma.quotationDocument.findFirst({
      where: {
        id: documentId,
        quotationId: id,
        companyId: auth.companyId,
        status: 'PENDING',
        deletedAt: null,
      },
    });
    if (!document) throw new NotFoundError('Pending document not found.');
    const head = await storageService.headObject(document.objectKey);
    if (
      !head ||
      head.size !== document.fileSize ||
      (head.contentType && head.contentType !== document.mimeType)
    )
      throw new ValidationError('The uploaded object does not match the approved file metadata.');
    const updated = await prisma.quotationDocument.update({
      where: { id: documentId },
      data: { status: 'AVAILABLE', checksum: head.checksum ?? null },
    });
    await prisma.activityLog.create({
      data: quotationAudit(
        auth,
        'QUOTATION_DOCUMENT_UPLOADED',
        'QuotationDocument',
        documentId,
        context,
        { quotationId: id },
      ),
    });
    return { id: updated.id, status: updated.status, fileName: updated.fileName };
  },

  async deleteDocument(auth: AuthContext, id: string, documentId: string, context: RequestContext) {
    await getQuotation(auth, id);
    const document = await prisma.quotationDocument.findFirst({
      where: { id: documentId, quotationId: id, companyId: auth.companyId, deletedAt: null },
    });
    if (!document) throw new NotFoundError('Document not found.');
    await storageService.deleteObject(document.objectKey);
    await prisma.$transaction([
      prisma.quotationDocument.update({
        where: { id: documentId },
        data: { deletedAt: new Date() },
      }),
      prisma.activityLog.create({
        data: quotationAudit(
          auth,
          'QUOTATION_DOCUMENT_DELETED',
          'QuotationDocument',
          documentId,
          context,
          { quotationId: id },
        ),
      }),
    ]);
    return { id: documentId, deleted: true };
  },

  async createPublicLink(
    auth: AuthContext,
    id: string,
    versionId: string | undefined,
    expiresAt: Date | null | undefined,
    context: RequestContext,
  ) {
    const quotation = await getQuotation(auth, id);
    const selected = versionId
      ? await getVersion(auth, id, versionId)
      : (quotation.versions.find((version) => version.id === quotation.currentVersionId) ??
        quotation.versions[0]);
    if (!selected || selected.status === 'DRAFT')
      throw new ConflictError('A finalized version is required for a public link.');
    // Idempotent: an existing, unexpired active link for this quotation is
    // returned as-is so repeated clicks never reset analytics or the token.
    if (
      quotation.publicToken &&
      (!quotation.publicTokenExpiresAt || quotation.publicTokenExpiresAt >= new Date())
    ) {
      return {
        url: `${env.WEB_URL}/q/${quotation.publicToken}`,
        expiresAt: quotation.publicTokenExpiresAt,
        versionId: quotation.publicVersionId ?? selected.id,
        reused: true,
      };
    }
    const token = generateSecureToken(32);
    await prisma.$transaction([
      prisma.quotation.update({
        where: { id },
        data: {
          publicToken: token,
          publicTokenHash: hashToken(token),
          publicTokenExpiresAt: expiresAt ?? quotation.validUntil,
          publicVersionId: selected.id,
        },
      }),
      prisma.activityLog.create({
        data: quotationAudit(auth, 'QUOTATION_PUBLIC_LINK_CREATED', 'Quotation', id, context, {
          versionId: selected.id,
          expiresAt: expiresAt?.toISOString() ?? null,
        }),
      }),
    ]);
    return {
      url: `${env.WEB_URL}/q/${token}`,
      expiresAt: expiresAt ?? quotation.validUntil,
      versionId: selected.id,
      reused: false,
    };
  },

  async revokePublicLink(auth: AuthContext, id: string, context: RequestContext) {
    await getQuotation(auth, id);
    await prisma.$transaction([
      prisma.quotation.update({
        where: { id },
        data: {
          publicToken: null,
          publicTokenHash: null,
          publicTokenExpiresAt: null,
          publicVersionId: null,
        },
      }),
      prisma.activityLog.create({
        data: quotationAudit(auth, 'QUOTATION_PUBLIC_LINK_REVOKED', 'Quotation', id, context),
      }),
    ]);
    return { revoked: true };
  },

  async send(auth: AuthContext, id: string, input: QuotationSendInput, context: RequestContext) {
    const quotation = await getQuotation(auth, id);
    const version = await getVersion(auth, id, input.quotationVersionId);
    if (version.status !== 'FINALIZED')
      throw new ConflictError('Only the current finalized version can be sent.');
    let publicLink: { url: string } | undefined;
    if (input.includePublicLink)
      publicLink = await this.createPublicLink(auth, id, version.id, quotation.validUntil, context);
    if (input.includePdf) await this.generatePdf(auth, id, version.id, context);
    const pdfDocument = input.includePdf
      ? await prisma.quotationDocument.findFirst({
          where: {
            companyId: auth.companyId,
            quotationId: id,
            quotationVersionId: version.id,
            documentType: 'QUOTATION_PDF',
            status: 'AVAILABLE',
            deletedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        })
      : null;
    const pdfUrl = pdfDocument
      ? await storageService.createDownloadUrl(pdfDocument.objectKey, pdfDocument.fileName)
      : undefined;
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: auth.companyId },
      select: { name: true, email: true, phone: true },
    });
    const subject = input.subject || `${company.name} quotation ${quotation.quotationNumber}`;
    const emailLog = await prisma.quotationEmailLog.create({
      data: {
        companyId: auth.companyId,
        quotationId: id,
        quotationVersionId: version.id,
        recipientEmail: input.recipientEmail,
        cc: input.cc.join(', ') || null,
        subject,
        status: 'PENDING',
        sentById: auth.userId,
      },
    });
    const text = [
      `Hello ${quotation.customerName},`,
      '',
      input.message || `Please find your ${quotation.destinationSummary} quotation.`,
      '',
      `Quotation: ${quotation.quotationNumber}`,
      `Travel: ${quotation.travelStartDate?.toLocaleDateString('en-IN') ?? 'Flexible dates'}`,
      `Final amount: ${version.currency} ${version.finalAmount}`,
      `Valid until: ${quotation.validUntil?.toLocaleDateString('en-IN') ?? 'As advised'}`,
      publicLink?.url && `View quotation: ${publicLink.url}`,
      pdfUrl && `Download PDF: ${pdfUrl}`,
      '',
      `${company.name} • ${company.email}${company.phone ? ` • ${company.phone}` : ''}`,
    ]
      .filter(Boolean)
      .join('\n');
    const html = `<p>Hello ${escapeHtml(quotation.customerName)},</p><p>${escapeHtml(input.message || `Please find your ${quotation.destinationSummary} quotation.`)}</p><p><strong>${escapeHtml(quotation.quotationNumber)}</strong><br>Final amount: ${escapeHtml(version.currency)} ${escapeHtml(version.finalAmount.toString())}<br>Valid until: ${escapeHtml(quotation.validUntil?.toLocaleDateString('en-IN') ?? 'As advised')}</p>${publicLink ? `<p><a href="${escapeHtml(publicLink.url)}">View quotation</a></p>` : ''}${pdfUrl ? `<p><a href="${escapeHtml(pdfUrl)}">Download PDF</a></p>` : ''}<p>${escapeHtml(company.name)} • ${escapeHtml(company.email)}</p>`;
    try {
      await emailService.sendMessage({
        to: input.recipientEmail,
        cc: input.cc,
        subject,
        text,
        html,
      });
      const now = new Date();
      await prisma.$transaction([
        prisma.quotationEmailLog.update({
          where: { id: emailLog.id },
          data: { status: 'SENT', sentAt: now },
        }),
        prisma.quotation.update({
          where: { id },
          data: {
            status: 'SENT',
            firstSentAt: quotation.firstSentAt ?? now,
            lastSentAt: now,
            currentVersionId: version.id,
          },
        }),
        prisma.query.update({
          where: { id: quotation.queryId },
          data: { leadStage: 'QUOTATION_SENT', quotationRequired: false },
        }),
        prisma.activityLog.create({
          data: quotationAudit(auth, 'QUOTATION_SENT', 'Quotation', id, context, {
            versionId: version.id,
            recipientEmail: input.recipientEmail,
            emailLogId: emailLog.id,
          }),
        }),
      ]);
      return { sent: true, emailLogId: emailLog.id, publicUrl: publicLink?.url ?? null };
    } catch (error) {
      await prisma.quotationEmailLog.update({
        where: { id: emailLog.id },
        data: {
          status: 'FAILED',
          failureReason:
            error instanceof Error ? error.message.slice(0, 2000) : 'Unknown email error',
        },
      });
      throw error;
    }
  },

  async emailHistory(auth: AuthContext, id: string) {
    await getQuotation(auth, id);
    return prisma.quotationEmailLog.findMany({
      where: { companyId: auth.companyId, quotationId: id },
      select: {
        id: true,
        quotationVersionId: true,
        recipientEmail: true,
        cc: true,
        subject: true,
        providerMessageId: true,
        status: true,
        sentAt: true,
        failureReason: true,
        createdAt: true,
        sentBy: { select: userSelect },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async publicView(
    token: string,
    options?: { userAgent?: string; ip?: string | null; authCompanyId?: string | null },
  ) {
    const quotation = await prisma.quotation.findFirst({
      where: { publicTokenHash: hashToken(token), deletedAt: null },
      include: {
        ...quotationInclude,
        company: {
          select: {
            name: true,
            email: true,
            phone: true,
            website: true,
            address: true,
            primaryColor: true,
            // Company Settings values surfaced on the public footer/favicon.
            operatingSinceYear: true,
            tripsSold: true,
            tan: true,
            taxRegistrationNumber: true,
            logoObjectKey: true,
            logoConfirmedAt: true,
          },
        },
      },
    });
    if (
      !quotation ||
      (quotation.publicTokenExpiresAt && quotation.publicTokenExpiresAt < new Date())
    )
      throw new NotFoundError('This quotation link is invalid or expired.');
    const version =
      quotation.versions.find((row) => row.id === quotation.publicVersionId) ??
      quotation.versions.find((row) => row.id === quotation.currentVersionId);
    if (!version || version.status === 'DRAFT')
      throw new NotFoundError('Quotation version not available.');
    const likelyBot = /bot|crawler|spider|preview|headless|health/i.test(options?.userAgent ?? '');
    if (!likelyBot) {
      const now = new Date();
      await prisma.$transaction([
        prisma.quotation.update({
          where: { id: quotation.id },
          data: {
            firstViewedAt: quotation.firstViewedAt ?? now,
            lastViewedAt: now,
            ...(quotation.status === 'SENT' ? { status: 'VIEWED' } : {}),
          },
        }),
        ...(!quotation.firstViewedAt
          ? [
              prisma.activityLog.create({
                data: {
                  companyId: quotation.companyId,
                  action: 'QUOTATION_VIEWED',
                  entityType: 'Quotation',
                  entityId: quotation.id,
                  metadata: { versionId: version.id },
                },
              }),
            ]
          : []),
      ]);
      // Record an aggregated weblink view for this successful public load. A
      // same-tenant authenticated session is classified as HOME; every other
      // valid visitor is EXTERNAL. Atomic upsert: one row per quotation+IP.
      await prisma.quotationWeblinkView.upsert({
        where: {
          quotationId_ipAddress: {
            quotationId: quotation.id,
            ipAddress: normalizeWeblinkIp(options?.ip),
          },
        },
        create: {
          companyId: quotation.companyId,
          quotationId: quotation.id,
          ipAddress: normalizeWeblinkIp(options?.ip),
          type: options?.authCompanyId === quotation.companyId ? 'HOME' : 'EXTERNAL',
          viewCount: 1,
          firstViewedAt: now,
          lastViewedAt: now,
        },
        update: {
          viewCount: { increment: 1 },
          lastViewedAt: now,
        },
      });
    }
    const document = quotation.documents.find(
      (row) =>
        row.quotationVersionId === version.id &&
        row.documentType === 'QUOTATION_PDF' &&
        row.status === 'AVAILABLE',
    );
    let downloadUrl: string | null = null;
    if (document) {
      try {
        downloadUrl = await storageService.createDownloadUrl(document.objectKey, document.fileName);
      } catch {
        // A missing or temporarily unavailable object must not hide the
        // customer-safe quotation itself. Staff can regenerate the PDF.
        downloadUrl = null;
      }
    }
    // Hero image: match this quote's places to a Destination master that has a
    // confirmed image, and hand the page a short-lived signed URL.
    const heroImageUrl = await resolveDestinationHeroImage(
      quotation.companyId,
      quotation.destinationSummary,
      version.itinerary.map((day) => day.destination),
    );
    const hotelPresentations = await resolveHotelPresentations(
      quotation.companyId,
      version.hotels.map((hotel) => ({ id: hotel.id, hotelId: hotel.hotelId })),
    );
    const vehiclePresentations = await resolveVehiclePresentations(
      quotation.companyId,
      version.services
        .filter((service) => service.serviceType === 'VEHICLE_TRANSFER')
        .map((service) => ({ id: service.id, vehicleId: service.vehicleId })),
    );
    const airlinePresentations = await resolveAirlinePresentations(
      quotation.companyId,
      version.flightDetails,
    );
    const sightseeingPresentations = await resolveSightseeingPresentations(
      quotation.companyId,
      version.sightseeingDetails,
    );
    const cruisePresentations = await resolveCruisePresentations(
      quotation.companyId,
      version.services
        .filter((service) => service.serviceType === 'CRUISE')
        .map((service) => ({
          id: service.id,
          cruiseId: service.cruiseId,
          cruiseRoomTypeId: service.cruiseRoomTypeId,
        })),
    );
    return {
      company: {
        name: quotation.company.name,
        email: quotation.company.email,
        phone: quotation.company.phone,
        website: quotation.company.website,
        address: quotation.company.address,
        primaryColor: quotation.company.primaryColor,
        operatingSince: quotation.company.operatingSinceYear,
        tripsSold: quotation.company.tripsSold,
        tan: quotation.company.tan,
        taxRegistrationNumber: quotation.company.taxRegistrationNumber,
        logoUrl: await publicCompanyLogoUrl(quotation.company),
      },
      heroImageUrl,
      hotelPresentations,
      vehiclePresentations,
      airlinePresentations,
      sightseeingPresentations,
      cruisePresentations,
      quotation: {
        quotationNumber: quotation.quotationNumber,
        customerName: quotation.customerName,
        destinationSummary: quotation.destinationSummary,
        travelStartDate: quotation.travelStartDate,
        travelEndDate: quotation.travelEndDate,
        adults: quotation.adults,
        childrenWithBed: quotation.childrenWithBed,
        childrenWithoutBed: quotation.childrenWithoutBed,
        infants: quotation.infants,
        rooms: quotation.rooms,
        validUntil: quotation.validUntil,
        createdAt: quotation.createdAt,
        status: effectiveStatus(quotation),
      },
      version: presentVersion(version, false, true),
      downloadUrl,
    };
  },

  async publicDecision(
    token: string,
    decision: 'accept' | 'reject',
    input: { customerName?: string; reason?: string; note?: string },
  ) {
    const quotation = await prisma.quotation.findFirst({
      where: { publicTokenHash: hashToken(token), deletedAt: null },
      include: quotationInclude,
    });
    if (
      !quotation ||
      (quotation.publicTokenExpiresAt && quotation.publicTokenExpiresAt < new Date())
    )
      throw new NotFoundError('This quotation link is invalid or expired.');
    if (['ACCEPTED', 'REJECTED', 'ARCHIVED'].includes(quotation.status))
      throw new ConflictError('A final response has already been recorded.');
    const version =
      quotation.versions.find((row) => row.id === quotation.publicVersionId) ??
      quotation.versions.find((row) => row.id === quotation.currentVersionId);
    if (!version || version.status === 'DRAFT')
      throw new ConflictError('The linked version is not finalized.');
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      if (decision === 'accept') {
        await tx.quotation.update({
          where: { id: quotation.id },
          data: { status: 'ACCEPTED', acceptedAt: now, acceptedVersionId: version.id },
        });
        await tx.query.update({
          where: { id: quotation.queryId },
          data: { leadStage: 'READY_TO_BOOK' },
        });
        await tx.activityLog.create({
          data: {
            companyId: quotation.companyId,
            action: 'QUOTATION_ACCEPTED',
            entityType: 'Quotation',
            entityId: quotation.id,
            metadata: { versionId: version.id, customerName: input.customerName, note: input.note },
          },
        });
      } else {
        await tx.quotation.update({
          where: { id: quotation.id },
          data: { status: 'REJECTED', rejectedAt: now, rejectionReason: input.reason ?? null },
        });
        await tx.activityLog.create({
          data: {
            companyId: quotation.companyId,
            action: 'QUOTATION_REJECTED',
            entityType: 'Quotation',
            entityId: quotation.id,
            metadata: { versionId: version.id, reason: input.reason, note: input.note },
          },
        });
      }
    });
    return { status: decision === 'accept' ? 'ACCEPTED' : 'REJECTED', recordedAt: now };
  },
};

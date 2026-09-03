import { Prisma } from '@prisma/client';
import {
  calculateCruiseRoomLinesTotal,
  calculateFlightTotal,
  calculateHotelRowTotal,
  calculateSightseeingSectionTotal,
  classifyServiceBucket,
  filterContributingHotelRows,
  resolveCruiseRoomLines,
} from '@interscale/shared';

const D = (value: Prisma.Decimal.Value | null | undefined) => new Prisma.Decimal(value ?? 0);
const roundMoney = (value: Prisma.Decimal) =>
  value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export interface PriceableHotelLine {
  baseRoomPrice?: number | string | null | undefined;
  extraBedQuantity?: number | null | undefined;
  extraBedPrice?: number | string | null | undefined;
  childWithoutBedQuantity?: number | null | undefined;
  childWithoutBedPrice?: number | string | null | undefined;
  rooms?: number | null | undefined;
  sellingPrice?: number | string | null | undefined;
}
export interface PriceableHotel {
  internalCost?: number | string | null | undefined;
  sellingPrice?: number | string | null | undefined;
  baseRoomPrice?: number | string | null | undefined;
  extraBedQuantity?: number | null | undefined;
  extraBedPrice?: number | string | null | undefined;
  childWithoutBedQuantity?: number | null | undefined;
  childWithoutBedPrice?: number | string | null | undefined;
  rooms?: number | null | undefined;
  nights?: number | null | undefined;
  // Alternative-hotel group: rows sharing a group id are alternatives and only
  // the selected one contributes (see filterContributingHotelRows).
  optionGroupId?: string | null | undefined;
  selected?: boolean | null | undefined;
  // Multiple room allocations inside ONE hotel option. When present, the row
  // prices from its lines (same per-line formula as the legacy row formula);
  // legacy rows without lines keep the exact legacy behavior.
  roomLines?: PriceableHotelLine[] | null | undefined;
  mealPlanLines?: Array<{
    sellingPrice?: number | string | null | undefined;
    internalCost?: number | string | null | undefined;
  }> | null | undefined;
}
export interface PriceableService {
  serviceType?: string | null | undefined;
  quantity?: number | string | null;
  internalCost?: number | string | null;
  sellingPrice?: number | string | null;
  cruiseNights?: number | string | null | undefined;
  cruiseRoomLines?: Array<{
    cruiseRoomTypeId?: string | null | undefined;
    roomType?: string | null | undefined;
    rooms?: number | string | null | undefined;
    roomRate?: number | string | null | undefined;
    sellingPrice?: number | string | null | undefined;
    internalCost?: number | string | null | undefined;
  }> | null | undefined;
  city?: string | null | undefined;
  cruiseId?: string | null | undefined;
  cruiseRoomTypeId?: string | null | undefined;
}

/**
 * The ONE authoritative backend pricing engine.
 *
 * Currency policy: multiply at full precision, round every stored line total
 * and quotation total to two decimals using half-up rounding.
 *
 * The stored totals are mode-aware and apply the adjustment pipeline exactly
 * once: subtotal (active pricing method only) → discount → tax → grand total.
 * SECTION-wise and traveler-wise pricing are mutually exclusive — they are
 * never added together.
 */
export function calculatePricing(input: {
  pricingMode?: string | null | undefined;
  hotels?: PriceableHotel[];
  services?: PriceableService[];
  // Structured flight pricing (FIXED_TOTAL amount or PER_TRAVELER rates).
  flightDetails?: unknown;
  // Day-wise activity pricing (per-traveler or quantity-based bases).
  sightseeingDetails?: unknown;
  // Top-level Add-on Services include flag (disabled section contributes ₹0).
  addOnDetails?: unknown;
  // Visa section inputs.
  includeVisa?: boolean | null | undefined;
  visaAmount?: number | string | null | undefined;
  visaServiceCharge?: number | string | null | undefined;
  visaGstPercent?: number | string | null | undefined;
  visaVfsCharge?: number | string | null | undefined;
  customCharges?: Array<{ label?: string | null; amount?: number | string | null }> | null | undefined;
  markupMode?: 'NONE' | 'FIXED' | 'PERCENTAGE';
  markupValue?: number | string | null;
  taxRate?: number | string | null;
  discountAmount?: number | string | null;
  // Reference "Summary & Pricing": when per-passenger prices are supplied, the
  // package total (price × traveller mix) becomes the authoritative subtotal
  // and net amount is the cost basis for margin.
  perAdultPrice?: number | string | null | undefined;
  perChildWithBedPrice?: number | string | null | undefined;
  perChildWithoutBedPrice?: number | string | null | undefined;
  perInfantPrice?: number | string | null | undefined;
  netAmount?: number | string | null | undefined;
  pax?: {
    adults?: number | null | undefined;
    childrenWithBed?: number | null | undefined;
    childrenWithoutBed?: number | null | undefined;
    infants?: number | null | undefined;
  };
}) {
  const pax = {
    adults: Math.max(0, Math.floor(Number(input.pax?.adults ?? 0)) || 0),
    childrenWithBed: Math.max(0, Math.floor(Number(input.pax?.childrenWithBed ?? 0)) || 0),
    childrenWithoutBed: Math.max(0, Math.floor(Number(input.pax?.childrenWithoutBed ?? 0)) || 0),
    infants: Math.max(0, Math.floor(Number(input.pax?.infants ?? 0)) || 0),
  };

  // ---- Hotel cost/selling ---------------------------------------------------
  // Selling uses the SAME shared engine as the builder, PDF and weblink
  // (room breakdowns + meal-plan lines + manual-override fallback), so a saved
  // quotation can never disagree with what the agent saw while editing.
  const contributingHotels = filterContributingHotelRows(input.hotels ?? []);
  const hotelCost = (input.hotels ?? []).reduce((sum, row) => sum.plus(D(row.internalCost)), D(0));
  const hotelSelling = contributingHotels.reduce<Prisma.Decimal>(
    (sum, row) => sum.plus(D(calculateHotelRowTotal(row).total)),
    D(0),
  );

  // ---- Service lines (cruise / vehicle / add-on / sightseeing services) ----
  // Rows in a DISABLED section contribute ₹0 but stay persisted (config is
  // never destroyed). Lines stay index-aligned with the input rows.
  const flightSectionEnabled =
    (input.flightDetails as { include?: boolean } | null | undefined)?.include !== false;
  const sightseeingSectionEnabled =
    (input.sightseeingDetails as { include?: boolean } | null | undefined)?.include !== false;
  const addOnSectionEnabled =
    (input.addOnDetails as { include?: boolean } | null | undefined)?.include !== false;
  const bucketEnabled = (serviceType: unknown): boolean => {
    // Legacy snapshots without the details object keep every row enabled.
    switch (classifyServiceBucket(serviceType)) {
      case 'flight':
        return flightSectionEnabled;
      case 'sightseeing':
        return sightseeingSectionEnabled;
      case 'addon':
        return addOnSectionEnabled;
      default:
        return true;
    }
  };
  const serviceLines = (input.services ?? []).map((row) => {
    const included = bucketEnabled(row.serviceType);
    if (!included) return { included, totalCost: D(0), totalSellingPrice: D(0) };
    // Cruise with structured multi-room + nights: authoritative per-night total
    if ((row.serviceType as string) === 'CRUISE') {
      const cruiseTotal = calculateCruiseRoomLinesTotal(row as unknown as Parameters<typeof calculateCruiseRoomLinesTotal>[0], (row as unknown as { cruiseNights?: number | null })?.cruiseNights ?? null);
      // If cruiseRoomLines present, cruiseTotal already accounts for nights; fallback to legacy quantity×price×nights inside helper
      const hasLines = resolveCruiseRoomLines(row as unknown as Parameters<typeof resolveCruiseRoomLines>[0]).length > 0;
      if (hasLines || (row as unknown as { cruiseNights?: unknown })?.cruiseNights != null) {
        return {
          included,
          totalCost: D(0), // cruise internal cost not structured; keep 0 (or could sum room internalCost×rooms×nights)
          totalSellingPrice: roundMoney(D(cruiseTotal)),
        };
      }
    }
    const quantity = D(row.quantity ?? 1);
    return {
      included,
      totalCost: roundMoney(quantity.mul(D(row.internalCost))),
      totalSellingPrice: roundMoney(quantity.mul(D(row.sellingPrice))),
    };
  });
  const serviceCost = serviceLines
    .filter((row) => row.included)
    .reduce((sum, row) => sum.plus(row.totalCost), D(0));
  const serviceSelling = serviceLines
    .filter((row) => row.included)
    .reduce((sum, row) => sum.plus(row.totalSellingPrice), D(0));

  // ---- Structured flight pricing -------------------------------------------
  // PER_TRAVELER rates × traveler counts, or the FIXED_TOTAL amount. The two
  // bases are mutually exclusive; legacy/image-mode quotations fall back to
  // the fixed amount.
  const flightSelling = D(calculateFlightTotal(input.flightDetails, pax));

  // ---- Sightseeing (day-wise activities) ------------------------------------
  const sightseeingSelling = D(calculateSightseeingSectionTotal(input.sightseeingDetails, pax));

  // ---- Visa ------------------------------------------------------------------
  const visaSelling = input.includeVisa === false
    ? D(0)
    : roundMoney(
        D(input.visaAmount)
          .plus(D(input.visaServiceCharge))
          .plus(D(input.visaServiceCharge).mul(D(input.visaGstPercent)).div(100))
          .plus(D(input.visaVfsCharge)),
      );

  // ---- Custom Charges (By Section only) -------------------------------------
  const customChargesTotal =
    input.pricingMode === 'SECTION_WISE'
      ? (input.customCharges ?? []).reduce((sum, c) => sum.plus(D(c.amount)), D(0))
      : D(0);

  // ---- Traveler-wise package total -------------------------------------------
  const packageTotal = roundMoney(
    D(input.perAdultPrice)
      .mul(D(pax.adults))
      .plus(D(input.perChildWithBedPrice).mul(D(pax.childrenWithBed)))
      .plus(D(input.perChildWithoutBedPrice).mul(D(pax.childrenWithoutBed)))
      .plus(D(input.perInfantPrice).mul(D(pax.infants))),
  );

  const markupValue = D(input.markupValue);
  const discountAmount = roundMoney(D(input.discountAmount));
  const taxRate = D(input.taxRate);

  // Traveler-wise pricing wins when real per-traveler rates exist. Section
  // totals never contribute to the total in that case.
  if (packageTotal.greaterThan(0)) {
    const netAmount = roundMoney(D(input.netAmount));
    const preTax = Prisma.Decimal.max(D(0), packageTotal.minus(discountAmount));
    const taxAmount = roundMoney(preTax.mul(taxRate).div(100));
    const finalAmount = roundMoney(preTax.plus(taxAmount));
    const pkgMargin = roundMoney(preTax.minus(netAmount));
    return {
      subtotalCost: netAmount,
      subtotalSellingPrice: packageTotal,
      totalMarkup: D(0),
      taxAmount,
      discountAmount,
      finalAmount,
      marginAmount: pkgMargin,
      marginPercentage: packageTotal.isZero()
        ? D(0)
        : pkgMargin.mul(100).div(packageTotal).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP),
      serviceLines,
    };
  }

  // Section-wise subtotal: every enabled section, each priced exactly once.
  const subtotalSellingPrice = roundMoney(
    hotelSelling
      .plus(serviceSelling)
      .plus(flightSelling)
      .plus(sightseeingSelling)
      .plus(visaSelling)
      .plus(customChargesTotal),
  );
  const totalMarkupFinal = roundMoney(
    input.markupMode === 'PERCENTAGE'
      ? subtotalSellingPrice.mul(markupValue).div(100)
      : input.markupMode === 'FIXED'
        ? markupValue
        : D(0),
  );
  const preTax = Prisma.Decimal.max(
    D(0),
    subtotalSellingPrice.plus(totalMarkupFinal).minus(discountAmount),
  );
  const taxAmount = roundMoney(preTax.mul(taxRate).div(100));
  const finalAmount = roundMoney(preTax.plus(taxAmount));
  const marginAmount = roundMoney(preTax.minus(hotelCost.plus(serviceCost)));
  const marginPercentage = preTax.isZero()
    ? D(0)
    : marginAmount.mul(100).div(preTax).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

  return {
    subtotalCost: roundMoney(hotelCost.plus(serviceCost)),
    subtotalSellingPrice,
    totalMarkup: totalMarkupFinal,
    taxAmount,
    discountAmount,
    finalAmount,
    marginAmount,
    marginPercentage,
    serviceLines,
  };
}

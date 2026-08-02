import { Prisma } from '@prisma/client';

const D = (value: Prisma.Decimal.Value | null | undefined) => new Prisma.Decimal(value ?? 0);
const roundMoney = (value: Prisma.Decimal) =>
  value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export interface PriceableHotel {
  internalCost?: number | string | null;
  sellingPrice?: number | string | null;
}
export interface PriceableService {
  quantity?: number | string | null;
  internalCost?: number | string | null;
  sellingPrice?: number | string | null;
}

/**
 * Currency policy: multiply at full decimal precision, then round every stored
 * line total and quotation total to two decimals using half-up rounding.
 */
export function calculatePricing(input: {
  hotels?: PriceableHotel[];
  services?: PriceableService[];
  markupMode?: 'NONE' | 'FIXED' | 'PERCENTAGE';
  markupValue?: number | string | null;
  taxRate?: number | string | null;
  discountAmount?: number | string | null;
  // Reference "Summary & Pricing": when per-passenger prices are supplied, the
  // package total (price × traveller mix) becomes the authoritative total and
  // net amount is the cost basis for margin. Add-ons are quoted separately and
  // are intentionally excluded here.
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
  const hotelCost = (input.hotels ?? []).reduce((sum, row) => sum.plus(D(row.internalCost)), D(0));
  const hotelSelling = (input.hotels ?? []).reduce(
    (sum, row) => sum.plus(D(row.sellingPrice)),
    D(0),
  );
  const serviceLines = (input.services ?? []).map((row) => {
    const quantity = D(row.quantity ?? 1);
    return {
      totalCost: roundMoney(quantity.mul(D(row.internalCost))),
      totalSellingPrice: roundMoney(quantity.mul(D(row.sellingPrice))),
    };
  });
  const serviceCost = serviceLines.reduce((sum, row) => sum.plus(row.totalCost), D(0));
  const serviceSelling = serviceLines.reduce((sum, row) => sum.plus(row.totalSellingPrice), D(0));
  const subtotalCost = roundMoney(hotelCost.plus(serviceCost));
  const subtotalSellingPrice = roundMoney(hotelSelling.plus(serviceSelling));
  const markupValue = D(input.markupValue);
  const totalMarkup = roundMoney(
    input.markupMode === 'PERCENTAGE'
      ? subtotalSellingPrice.mul(markupValue).div(100)
      : input.markupMode === 'FIXED'
        ? markupValue
        : D(0),
  );
  const discountAmount = roundMoney(D(input.discountAmount));
  const preTax = Prisma.Decimal.max(
    D(0),
    subtotalSellingPrice.plus(totalMarkup).minus(discountAmount),
  );
  const taxAmount = roundMoney(preTax.mul(D(input.taxRate)).div(100));
  const finalAmount = roundMoney(preTax.plus(taxAmount));
  const marginAmount = roundMoney(preTax.minus(subtotalCost));
  const marginPercentage = preTax.isZero()
    ? D(0)
    : marginAmount.mul(100).div(preTax).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

  // Per-passenger package pricing overrides the itemized totals when supplied.
  const packageTotal = roundMoney(
    D(input.perAdultPrice)
      .mul(D(input.pax?.adults))
      .plus(D(input.perChildWithBedPrice).mul(D(input.pax?.childrenWithBed)))
      .plus(D(input.perChildWithoutBedPrice).mul(D(input.pax?.childrenWithoutBed)))
      .plus(D(input.perInfantPrice).mul(D(input.pax?.infants))),
  );
  if (packageTotal.greaterThan(0)) {
    const netAmount = roundMoney(D(input.netAmount));
    const pkgMargin = roundMoney(packageTotal.minus(netAmount));
    return {
      subtotalCost: netAmount,
      subtotalSellingPrice: packageTotal,
      totalMarkup: D(0),
      taxAmount: D(0),
      discountAmount: D(0),
      finalAmount: packageTotal,
      marginAmount: pkgMargin,
      marginPercentage: packageTotal.isZero()
        ? D(0)
        : pkgMargin.mul(100).div(packageTotal).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP),
      serviceLines,
    };
  }

  return {
    subtotalCost,
    subtotalSellingPrice,
    totalMarkup,
    taxAmount,
    discountAmount,
    finalAmount,
    marginAmount,
    marginPercentage,
    serviceLines,
  };
}

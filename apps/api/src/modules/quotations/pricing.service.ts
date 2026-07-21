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

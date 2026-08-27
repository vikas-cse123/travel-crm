import type { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma.js';

type ResolvedPricing = {
  baseRoomPrice: number | null;
  extraBedPrice: number | null;
  childWithoutBedPrice: number | null;
  currency: string;
  pricingSource: 'SEASON' | 'MONTH' | 'BASE' | null;
  seasonName?: string | null;
  month?: number | null;
};

const toNum = (v: Prisma.Decimal | null | undefined): number | null => (v == null ? null : (v as Prisma.Decimal).toNumber());

/**
 * Resolve applicable master pricing for a room type on a given check-in date.
 * Precedence: Season (date within range) > Month (calendar month) > Base sellingPrice.
 * Null extra prices remain null (no silent 0).
 */
export async function resolveHotelRoomPricing(
  companyIds: string[],
  hotelRoomTypeId: string,
  checkInDate: Date | string | null | undefined,
): Promise<ResolvedPricing | null> {
  const room = await prisma.hotelRoomType.findFirst({
    where: { id: hotelRoomTypeId, companyId: { in: companyIds } },
    select: {
      sellingPrice: true,
      extraBedPrice: true,
      childWithoutBedPrice: true,
      currency: true,
      seasons: { orderBy: { startDate: 'asc' } },
      monthPrices: { orderBy: { month: 'asc' } },
    },
  });
  if (!room) return null;

  const checkIn = checkInDate ? new Date(checkInDate) : null;
  const validCheckIn = checkIn && !Number.isNaN(checkIn.getTime()) ? checkIn : null;
  const month = validCheckIn ? validCheckIn.getUTCMonth() + 1 : null;

  // Season covering checkIn
  if (validCheckIn) {
    const season = (room.seasons as Array<{ startDate: Date; endDate: Date; price: Prisma.Decimal | null; extraBedPrice: Prisma.Decimal | null; childWithoutBedPrice: Prisma.Decimal | null; currency: string; name: string }>).find((s) => {
      const start = new Date(s.startDate);
      const end = new Date(s.endDate);
      // Normalize to UTC date only for comparison
      const d = Date.UTC(validCheckIn.getUTCFullYear(), validCheckIn.getUTCMonth(), validCheckIn.getUTCDate());
      const sd = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
      const ed = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
      return d >= sd && d <= ed;
    });
    if (season) {
      return {
        baseRoomPrice: toNum(season.price) ?? toNum(room.sellingPrice),
        extraBedPrice: toNum(season.extraBedPrice),
        childWithoutBedPrice: toNum(season.childWithoutBedPrice),
        currency: season.currency ?? room.currency,
        pricingSource: 'SEASON',
        seasonName: season.name,
      };
    }
  }

  if (month) {
    const monthRow = (room.monthPrices as Array<{ month: number; price: Prisma.Decimal | null; extraBedPrice: Prisma.Decimal | null; childWithoutBedPrice: Prisma.Decimal | null; currency: string }>).find((m) => m.month === month);
    if (monthRow) {
      return {
        baseRoomPrice: toNum(monthRow.price) ?? toNum(room.sellingPrice),
        extraBedPrice: toNum(monthRow.extraBedPrice),
        childWithoutBedPrice: toNum(monthRow.childWithoutBedPrice),
        currency: monthRow.currency ?? room.currency,
        pricingSource: 'MONTH',
        month,
      };
    }
  }

  return {
    baseRoomPrice: toNum(room.sellingPrice),
    extraBedPrice: toNum(room.extraBedPrice),
    childWithoutBedPrice: toNum(room.childWithoutBedPrice),
    currency: room.currency,
    pricingSource: toNum(room.sellingPrice) != null ? 'BASE' : null,
  };
}

/**
 * Shared pure resolver for frontend (no DB). Given a roomType master object with seasons/monthPrices, resolve pricing for checkInDate.
 */
export function resolveHotelRoomPricingFromMaster(
  roomType: {
    sellingPrice?: number | null;
    extraBedPrice?: number | null;
    childWithoutBedPrice?: number | null;
    currency?: string | null;
    seasons?: Array<{ startDate: string | Date; endDate: string | Date; price: number | null; extraBedPrice?: number | null; childWithoutBedPrice?: number | null; currency: string; name: string }>;
    monthPrices?: Array<{ month: number; price: number | null; extraBedPrice?: number | null; childWithoutBedPrice?: number | null; currency: string }>;
  },
  checkInDate: string | Date | null | undefined,
): ResolvedPricing | null {
  if (!roomType) return null;
  const checkIn = checkInDate ? new Date(checkInDate) : null;
  const valid = checkIn && !Number.isNaN(checkIn.getTime()) ? checkIn : null;
  const month = valid ? valid.getUTCMonth() + 1 : null;

  if (valid) {
    const season = (roomType.seasons ?? []).find((s) => {
      const start = new Date(s.startDate);
      const end = new Date(s.endDate);
      const d = Date.UTC(valid.getUTCFullYear(), valid.getUTCMonth(), valid.getUTCDate());
      const sd = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
      const ed = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
      return d >= sd && d <= ed;
    });
    if (season) {
      return {
        baseRoomPrice: season.price ?? roomType.sellingPrice ?? null,
        extraBedPrice: season.extraBedPrice ?? null,
        childWithoutBedPrice: season.childWithoutBedPrice ?? null,
        currency: season.currency ?? roomType.currency ?? 'INR',
        pricingSource: 'SEASON',
        seasonName: season.name,
      };
    }
  }
  if (month) {
    const m = (roomType.monthPrices ?? []).find((x) => x.month === month);
    if (m) {
      return {
        baseRoomPrice: m.price ?? roomType.sellingPrice ?? null,
        extraBedPrice: m.extraBedPrice ?? null,
        childWithoutBedPrice: m.childWithoutBedPrice ?? null,
        currency: m.currency ?? roomType.currency ?? 'INR',
        pricingSource: 'MONTH',
        month,
      };
    }
  }
  return {
    baseRoomPrice: roomType.sellingPrice ?? null,
    extraBedPrice: roomType.extraBedPrice ?? null,
    childWithoutBedPrice: roomType.childWithoutBedPrice ?? null,
    currency: roomType.currency ?? 'INR',
    pricingSource: roomType.sellingPrice != null ? 'BASE' : null,
  };
}

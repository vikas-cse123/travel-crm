import { z } from 'zod';
import { MASTER_TYPE, PERMISSIONS } from '@interscale/shared';
import { prisma } from '../../../../config/prisma.js';
import type { Prisma } from '@prisma/client';
import { normalizeCustomerName } from '../../../../utils/normalize.js';
import { ValidationError } from '../../../../utils/errors.js';
import { buildVisibleWhere, resolveMasterScope } from '../../master-visibility.js';
import { sanitizeRichText } from '../../masters.service.js';
import type {
  ImportColumnDefinition,
  ResolveRowResult,
  UniquenessCheck,
} from '../excel-import.types.js';
import type { AuthContext } from '../../../../middleware/authenticate.js';
import type { MastersRequestContext } from '../../../masters/masters.service.js';

/**
 * Hotel Master Excel import.
 *
 * ONE Excel row = ONE hotel. All Room Types, Meal Plans and their monthly /
 * seasonal rates are supplied as pipe-delimited (`|`) values inside a single
 * column and parsed by position, so a hotel is never duplicated because it has
 * multiple rooms, meals, months or seasons. Room Type and Meal Plan extra
 * pricing match the existing Hotel master (Base, Monthly and Seasonal rates
 * each carry Extra Bed and Child Without Bed for room types).
 */
export const hotelColumns: ImportColumnDefinition[] = [
  {
    field: 'name',
    header: 'Hotel Name',
    aliases: ['hotel name', 'hotel', 'name'],
    required: true,
    example: 'Taj Goa',
    description: 'Required. 2–200 characters.',
  },
  {
    field: 'destination',
    header: 'Destination',
    aliases: ['destination', 'destination name'],
    required: true,
    example: 'Goa',
    description: 'Required. An existing Destination name.',
  },
  {
    field: 'city',
    header: 'City',
    aliases: ['city', 'city name'],
    required: true,
    example: 'Goa',
    description: 'Required. An existing City that belongs to the Destination.',
  },
  {
    field: 'address',
    header: 'Address',
    aliases: ['address', 'address line'],
    required: false,
    example: 'Baga Beach',
    description: 'Optional. Free text.',
  },
  {
    field: 'starCategory',
    header: 'Star Category',
    aliases: ['star category', 'star', 'category'],
    required: false,
    example: '5',
    description: 'Optional. Whole number 1–5.',
  },
  {
    field: 'starRating',
    header: 'Star Rating',
    aliases: ['star rating', 'rating'],
    required: false,
    example: '4.5',
    description: 'Optional. Number 0–5.',
  },
  {
    field: 'reviewLink',
    header: 'Review Link',
    aliases: ['review link', 'review url'],
    required: false,
    example: 'https://example.com/reviews',
    description: 'Optional. URL (max 500).',
  },
  {
    field: 'description',
    header: 'Description',
    aliases: ['description', 'desc', 'details'],
    required: false,
    example: 'Luxury beach resort',
    description: 'Optional. Free text.',
  },
  {
    field: 'amenities',
    header: 'Amenities',
    aliases: ['amenities', 'facilities'],
    required: false,
    example: 'Pool, Spa, Gym',
    description: 'Optional. Free text.',
  },
  {
    field: 'roomTypes',
    header: 'Room Types',
    aliases: ['room types', 'room type', 'rooms'],
    required: false,
    example: 'Deluxe | Suite | Executive',
    description: 'Optional. Pipe-delimited room type names.',
  },
  {
    field: 'basePrices',
    header: 'Base Prices',
    aliases: ['base prices', 'base price', 'room prices'],
    required: false,
    example: '8000 | 12000 | 15000',
    description: 'Optional. Pipe-delimited base room prices, matched to Room Types by position.',
  },
  {
    field: 'extraBedPrices',
    header: 'Extra Bed Prices',
    aliases: ['extra bed prices', 'extra bed price', 'extra bed'],
    required: false,
    example: '2000 | 3000 | 3500',
    description: 'Optional. Pipe-delimited extra bed prices, matched to Room Types by position.',
  },
  {
    field: 'childWithoutBedPrices',
    header: 'Child Without Bed Prices',
    aliases: ['child without bed prices', 'child without bed price', 'child without bed'],
    required: false,
    example: '1000 | 1500 | 1800',
    description: 'Optional. Pipe-delimited child-without-bed prices, matched to Room Types by position.',
  },
  {
    field: 'currency',
    header: 'Currency',
    aliases: ['currency', 'curr'],
    required: false,
    example: 'INR',
    description: 'Optional. Three-letter currency code for all Room Types (default INR).',
  },
  {
    field: 'monthlyRates',
    header: 'Monthly Rates',
    aliases: ['monthly rates', 'room monthly rates'],
    required: false,
    example: 'Deluxe:May:8500:2000:1000:INR | Deluxe:June:9000:2200:1100:INR',
    description: 'Optional. Pipe-delimited RoomType:Month:Price:ExtraBed:ChildWithoutBed:Currency.',
  },
  {
    field: 'seasonalRates',
    header: 'Seasonal Rates',
    aliases: ['seasonal rates', 'room seasonal rates'],
    required: false,
    example: 'Deluxe:Summer:01-05-2026:30-06-2026:10000:2500:1200:INR',
    description: 'Optional. Pipe-delimited RoomType:Season:Start:End:Price:ExtraBed:ChildWithoutBed:Currency (DD-MM-YYYY).',
  },
  {
    field: 'mealPlans',
    header: 'Meal Plans',
    aliases: ['meal plans', 'meal plan', 'meal'],
    required: false,
    example: 'Breakfast | Half Board | Full Board',
    description: 'Optional. Pipe-delimited meal plan names.',
  },
  {
    field: 'mealPlanDescriptions',
    header: 'Meal Plan Descriptions',
    aliases: ['meal plan descriptions', 'meal plan description'],
    required: false,
    example: 'Breakfast included | Breakfast and dinner included | All major meals included',
    description: 'Optional. Pipe-delimited descriptions, matched to Meal Plans by position.',
  },
  {
    field: 'mealPlanPrices',
    header: 'Meal Plan Prices',
    aliases: ['meal plan prices', 'meal plan price'],
    required: false,
    example: '1200 | 2500 | 3500',
    description: 'Optional. Pipe-delimited prices, matched to Meal Plans by position.',
  },
  {
    field: 'mealPlanCurrency',
    header: 'Meal Plan Currency',
    aliases: ['meal plan currency', 'meal currency'],
    required: false,
    example: 'INR | INR | INR',
    description: 'Optional. Pipe-delimited currency codes, matched to Meal Plans by position (default INR).',
  },
  {
    field: 'mealPlanMonthlyRates',
    header: 'Meal Plan Monthly Rates',
    aliases: ['meal plan monthly rates', 'meal plan monthly rate'],
    required: false,
    example: 'Breakfast:May:1200:INR | Breakfast:June:1400:INR',
    description: 'Optional. Pipe-delimited MealPlan:Month:Price:Currency.',
  },
  {
    field: 'mealPlanSeasonalRates',
    header: 'Meal Plan Seasonal Rates',
    aliases: ['meal plan seasonal rates', 'meal plan seasonal rate'],
    required: false,
    example: 'Breakfast:Summer:01-05-2026:30-06-2026:1500:INR',
    description: 'Optional. Pipe-delimited MealPlan:Season:Start:End:Price:Currency (DD-MM-YYYY).',
  },
];

const hotelImportSchema = z.object({
  name: z.string().trim().min(2, 'Hotel name is required.').max(200),
  destination: z.string().trim().min(1, 'Destination is required.'),
  city: z.string().trim().min(1, 'City is required.'),
  address: z.string().trim().max(1000).nullable().optional(),
  starCategory: z.coerce
    .number()
    .int('Star Category must be a whole number.')
    .min(1, 'Star Category must be 1–5.')
    .max(5, 'Star Category must be 1–5.')
    .nullable()
    .optional(),
  starRating: z.coerce
    .number()
    .min(0, 'Star Rating must be 0–5.')
    .max(5, 'Star Rating must be 0–5.')
    .nullable()
    .optional(),
  reviewLink: z.string().trim().max(500).nullable().optional(),
  description: z.string().trim().max(50_000).nullable().optional(),
  amenities: z.string().trim().max(50_000).nullable().optional(),
  roomTypes: z.string().trim().optional().default(''),
  basePrices: z.string().trim().optional().default(''),
  extraBedPrices: z.string().trim().optional().default(''),
  childWithoutBedPrices: z.string().trim().optional().default(''),
  currency: z.string().trim().optional().default(''),
  monthlyRates: z.string().trim().optional().default(''),
  seasonalRates: z.string().trim().optional().default(''),
  mealPlans: z.string().trim().optional().default(''),
  mealPlanDescriptions: z.string().trim().optional().default(''),
  mealPlanPrices: z.string().trim().optional().default(''),
  mealPlanCurrency: z.string().trim().optional().default(''),
  mealPlanMonthlyRates: z.string().trim().optional().default(''),
  mealPlanSeasonalRates: z.string().trim().optional().default(''),
});

const MONTH_NAMES: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

/** Split a pipe-delimited column into trimmed, non-empty values. */
function splitValues(value: unknown): string[] {
  const raw = String(value ?? '').trim();
  if (!raw) return [];
  return raw
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

function parseMonth(value: string): number | null {
  const v = value.trim();
  if (!v) return null;
  if (/^\d{1,2}$/.test(v)) {
    const n = Number(v);
    if (n >= 1 && n <= 12) return n;
    return null;
  }
  return MONTH_NAMES[v.toLowerCase()] ?? null;
}

/** Parse DD-MM-YYYY or YYYY-MM-DD into a UTC date, or null when invalid. */
function parseDate(value: string): Date | null {
  const v = value.trim();
  const dmy = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(v);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return new Date(Date.UTC(y, m - 1, d));
    return null;
  }
  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return new Date(Date.UTC(y, m - 1, d));
    return null;
  }
  return null;
}

/** Non-negative number from a token; '' → null; invalid → NaN. */
function parseMoney(token: string): number | null {
  const v = token.trim();
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function normalizeCurrency(token: string): string | null {
  const v = token.trim().toUpperCase();
  if (v === '') return 'INR';
  return /^[A-Z]{3}$/.test(v) ? v : null;
}

interface RoomRateDraft {
  name: string;
  sellingPrice: number | null;
  extraBedPrice: number | null;
  childWithoutBedPrice: number | null;
  currency: string;
  monthRates: Array<{
    month: number;
    price: number | null;
    extraBedPrice: number | null;
    childWithoutBedPrice: number | null;
    currency: string;
  }>;
  seasonRates: Array<{
    name: string;
    startDate: Date;
    endDate: Date;
    price: number | null;
    extraBedPrice: number | null;
    childWithoutBedPrice: number | null;
    currency: string;
  }>;
}

interface MealPlanDraft {
  name: string;
  description: string | null;
  price: number | null;
  currency: string;
  monthRates: Array<{ month: number; price: number | null; currency: string }>;
  seasonRates: Array<{
    name: string;
    startDate: Date;
    endDate: Date;
    price: number | null;
    currency: string;
  }>;
}

async function resolveDestinationCity(
  auth: AuthContext,
  destinationName: string,
  cityName: string,
): Promise<{ destinationId: string | null; cityId: string | null; destinationName: string }> {
  const scope = await resolveMasterScope(auth, MASTER_TYPE.HOTEL);
  const destination = destinationName
    ? await prisma.destination.findFirst({
        where: {
          ...buildVisibleWhere(scope),
          normalizedName: normalizeCustomerName(destinationName),
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: { id: true, name: true },
      })
    : null;
  if (!destination) return { destinationId: null, cityId: null, destinationName: destinationName.trim() };
  const city = cityName
    ? await prisma.city.findFirst({
        where: {
          ...buildVisibleWhere(scope),
          normalizedName: normalizeCustomerName(cityName),
          status: 'ACTIVE',
          deletedAt: null,
          destinationLinks: { some: { destinationId: destination.id } },
        },
        select: { id: true, name: true },
      })
    : null;
  return {
    destinationId: destination.id,
    cityId: city?.id ?? null,
    destinationName: destination.name,
  };
}

export const hotelAdapter = {
  masterType: 'HOTEL' as const,
  permission: PERMISSIONS.MASTER_HOTELS_CREATE,
  columns: hotelColumns,
  zodSchema: hotelImportSchema,
  duplicateKeys: async (input: Record<string, unknown>, auth: AuthContext): Promise<UniquenessCheck[]> => {
    const resolved = await resolveDestinationCity(
      auth,
      String(input.destination ?? '').trim(),
      String(input.city ?? '').trim(),
    );
    const key = `${resolved.cityId ?? ''}:${normalizeCustomerName(String(input.name ?? ''))}`;
    return [{ key, field: 'name', header: 'Hotel Name' }];
  },
  existingKeys: async (companyId: string) => {
    // Hotels are uniquely constrained per company + city + name across soft-deleted
    // rows, so archived hotels still block a same-city re-import.
    const rows = await prisma.hotel.findMany({
      where: { companyId },
      select: { cityId: true, normalizedName: true },
    });
    return new Set(rows.map((r) => `${r.cityId}:${r.normalizedName}`));
  },
  resolveRow: async (input: Record<string, unknown>, auth: AuthContext): Promise<ResolveRowResult> => {
    const problems: ResolveRowResult['problems'] = [];
    const destinationName = String(input.destination ?? '').trim();
    const cityName = String(input.city ?? '').trim();

    const resolved = await resolveDestinationCity(auth, destinationName, cityName);
    if (!resolved.destinationId) {
      problems.push({
        field: 'destination',
        header: 'Destination',
        value: destinationName || null,
        message: `Destination "${destinationName}" could not be found.`,
      });
    }
    if (resolved.destinationId && !resolved.cityId) {
      problems.push({
        field: 'city',
        header: 'City',
        value: cityName || null,
        message: `City "${cityName}" could not be found in destination "${resolved.destinationName}".`,
      });
    }

    // ---- Room Types (positional) -----------------------------------------
    const roomTypeNames = splitValues(input.roomTypes);
    const basePrices = splitValues(input.basePrices);
    const extraBeds = splitValues(input.extraBedPrices);
    const childWithoutBeds = splitValues(input.childWithoutBedPrices);
    const roomCurrencyRaw = String(input.currency ?? '').trim().toUpperCase();
    const roomCurrency = roomCurrencyRaw === '' ? 'INR' : roomCurrencyRaw;
    if (roomCurrencyRaw !== '' && !/^[A-Z]{3}$/.test(roomCurrencyRaw)) {
      problems.push({ field: 'currency', header: 'Currency', value: roomCurrencyRaw, message: 'Currency must be a three-letter code.' });
    }

    const seenRoomNames = new Set<string>();
    const roomTypes: RoomRateDraft[] = [];
    if (roomTypeNames.length > 0) {
      if (basePrices.length > 0 && basePrices.length !== roomTypeNames.length) {
        problems.push({
          field: 'basePrices',
          header: 'Base Prices',
          value: input.basePrices as string,
          message: `Base Prices has ${basePrices.length} values but Room Types has ${roomTypeNames.length}.`,
        });
      }
      if (extraBeds.length > 0 && extraBeds.length !== roomTypeNames.length) {
        problems.push({
          field: 'extraBedPrices',
          header: 'Extra Bed Prices',
          value: input.extraBedPrices as string,
          message: `Extra Bed Prices has ${extraBeds.length} values but Room Types has ${roomTypeNames.length}.`,
        });
      }
      if (childWithoutBeds.length > 0 && childWithoutBeds.length !== roomTypeNames.length) {
        problems.push({
          field: 'childWithoutBedPrices',
          header: 'Child Without Bed Prices',
          value: input.childWithoutBedPrices as string,
          message: `Child Without Bed Prices has ${childWithoutBeds.length} values but Room Types has ${roomTypeNames.length}.`,
        });
      }
      roomTypeNames.forEach((name, index) => {
        if (seenRoomNames.has(normalizeCustomerName(name))) {
          problems.push({
            field: 'roomTypes',
            header: 'Room Types',
            value: name,
            message: `Duplicate room type "${name}".`,
          });
        }
        seenRoomNames.add(normalizeCustomerName(name));
        const sell = basePrices[index] == null ? null : parseMoney(basePrices[index]!);
        const extra = extraBeds[index] == null ? null : parseMoney(extraBeds[index]!);
        const child = childWithoutBeds[index] == null ? null : parseMoney(childWithoutBeds[index]!);
        if (sell !== null && Number.isNaN(sell)) {
          problems.push({ field: 'basePrices', header: 'Base Prices', value: basePrices[index] ?? null, message: `Base price "${basePrices[index] ?? ''}" is not a valid number.` });
        }
        if (extra !== null && Number.isNaN(extra)) {
          problems.push({ field: 'extraBedPrices', header: 'Extra Bed Prices', value: extraBeds[index] ?? null, message: `Extra bed price "${extraBeds[index] ?? ''}" is not a valid number.` });
        }
        if (child !== null && Number.isNaN(child)) {
          problems.push({ field: 'childWithoutBedPrices', header: 'Child Without Bed Prices', value: childWithoutBeds[index] ?? null, message: `Child without bed price "${childWithoutBeds[index] ?? ''}" is not a valid number.` });
        }
        roomTypes.push({
          name,
          sellingPrice: sell !== null && Number.isNaN(sell) ? null : sell,
          extraBedPrice: extra !== null && Number.isNaN(extra) ? null : extra,
          childWithoutBedPrice: child !== null && Number.isNaN(child) ? null : child,
          currency: roomCurrency,
          monthRates: [],
          seasonRates: [],
        });
      });
    } else if (basePrices.length || extraBeds.length || childWithoutBeds.length) {
      problems.push({ field: 'roomTypes', header: 'Room Types', value: null, message: 'Base/Extra/Child prices were provided but no Room Types were declared.' });
    }

    const roomNameToIndex = new Map(roomTypes.map((r, i) => [normalizeCustomerName(r.name), i]));

    // ---- Room Monthly Rates ----------------------------------------------
    const roomMonthlyRates = splitValues(input.monthlyRates);
    roomMonthlyRates.forEach((segment) => {
      const parts = segment.split(':');
      if (parts.length !== 6) {
        problems.push({ field: 'monthlyRates', header: 'Monthly Rates', value: segment, message: 'Invalid Monthly Rate format. Use RoomType:Month:Price:ExtraBed:ChildWithoutBed:Currency.' });
        return;
      }
      const [rtName, monthLabel, priceStr, extraStr, childStr, curStr] = parts as [string, string, string, string, string, string];
      const roomIndex = roomNameToIndex.get(normalizeCustomerName(rtName));
      if (roomIndex === undefined) {
        problems.push({ field: 'monthlyRates', header: 'Monthly Rates', value: rtName, message: `Monthly rate references unknown room type "${rtName}".` });
        return;
      }
      const month = parseMonth(monthLabel);
      if (!month) {
        problems.push({ field: 'monthlyRates', header: 'Monthly Rates', value: monthLabel, message: `Month "${monthLabel}" is invalid (use a name or 1–12).` });
        return;
      }
      const price = parseMoney(priceStr);
      const extra = parseMoney(extraStr);
      const child = parseMoney(childStr);
      const currency = normalizeCurrency(curStr);
      if (price !== null && Number.isNaN(price)) { problems.push({ field: 'monthlyRates', header: 'Monthly Rates', value: priceStr, message: `Room price "${priceStr}" is not a valid number.` }); return; }
      if (extra !== null && Number.isNaN(extra)) { problems.push({ field: 'monthlyRates', header: 'Monthly Rates', value: extraStr, message: `Extra bed price "${extraStr}" is not a valid number.` }); return; }
      if (child !== null && Number.isNaN(child)) { problems.push({ field: 'monthlyRates', header: 'Monthly Rates', value: childStr, message: `Child without bed price "${childStr}" is not a valid number.` }); return; }
      if (!currency) { problems.push({ field: 'monthlyRates', header: 'Monthly Rates', value: curStr, message: `Currency "${curStr}" is invalid.` }); return; }
      const room = roomTypes[roomIndex]!;
      if (room.monthRates.some((m) => m.month === month)) {
        problems.push({ field: 'monthlyRates', header: 'Monthly Rates', value: segment, message: `Duplicate monthly rate for room type "${rtName}" in month ${month}.` });
        return;
      }
      room.monthRates.push({ month, price, extraBedPrice: extra, childWithoutBedPrice: child, currency });
    });

    // ---- Room Seasonal Rates ---------------------------------------------
    const roomSeasonalRates = splitValues(input.seasonalRates);
    roomSeasonalRates.forEach((segment) => {
      const parts = segment.split(':');
      if (parts.length !== 8) {
        problems.push({ field: 'seasonalRates', header: 'Seasonal Rates', value: segment, message: 'Invalid Seasonal Rate format. Use RoomType:Season:Start:End:Price:ExtraBed:ChildWithoutBed:Currency (DD-MM-YYYY).' });
        return;
      }
      const [rtName, seasonName, startStr, endStr, priceStr, extraStr, childStr, curStr] = parts as [string, string, string, string, string, string, string, string];
      const roomIndex = roomNameToIndex.get(normalizeCustomerName(rtName));
      if (roomIndex === undefined) {
        problems.push({ field: 'seasonalRates', header: 'Seasonal Rates', value: rtName, message: `Seasonal rate references unknown room type "${rtName}".` });
        return;
      }
      const startDate = parseDate(startStr);
      const endDate = parseDate(endStr);
      if (!startDate || !endDate) {
        problems.push({ field: 'seasonalRates', header: 'Seasonal Rates', value: `${startStr}–${endStr}`, message: `Invalid dates (use DD-MM-YYYY).` });
        return;
      }
      if (endDate < startDate) {
        problems.push({ field: 'seasonalRates', header: 'Seasonal Rates', value: segment, message: `Season end date is before the start date.` });
        return;
      }
      const price = parseMoney(priceStr);
      const extra = parseMoney(extraStr);
      const child = parseMoney(childStr);
      const currency = normalizeCurrency(curStr);
      if (price !== null && Number.isNaN(price)) { problems.push({ field: 'seasonalRates', header: 'Seasonal Rates', value: priceStr, message: `Room price "${priceStr}" is not a valid number.` }); return; }
      if (extra !== null && Number.isNaN(extra)) { problems.push({ field: 'seasonalRates', header: 'Seasonal Rates', value: extraStr, message: `Extra bed price "${extraStr}" is not a valid number.` }); return; }
      if (child !== null && Number.isNaN(child)) { problems.push({ field: 'seasonalRates', header: 'Seasonal Rates', value: childStr, message: `Child without bed price "${childStr}" is not a valid number.` }); return; }
      if (!currency) { problems.push({ field: 'seasonalRates', header: 'Seasonal Rates', value: curStr, message: `Currency "${curStr}" is invalid.` }); return; }
      const room = roomTypes[roomIndex]!;
      if (room.seasonRates.some((s) => startDate <= s.endDate && endDate >= s.startDate)) {
        problems.push({ field: 'seasonalRates', header: 'Seasonal Rates', value: seasonName, message: `Season "${seasonName}" overlaps another season of room type "${rtName}".` });
        return;
      }
      room.seasonRates.push({ name: seasonName, startDate, endDate, price, extraBedPrice: extra, childWithoutBedPrice: child, currency });
    });

    // ---- Meal Plans (positional) -----------------------------------------
    const mealPlanNames = splitValues(input.mealPlans);
    const mealDescriptions = splitValues(input.mealPlanDescriptions);
    const mealPrices = splitValues(input.mealPlanPrices);
    const mealCurrencies = splitValues(input.mealPlanCurrency);
    const seenMealNames = new Set<string>();
    const mealPlans: MealPlanDraft[] = [];
    if (mealPlanNames.length > 0) {
      if (mealPrices.length > 0 && mealPrices.length !== mealPlanNames.length) {
        problems.push({ field: 'mealPlanPrices', header: 'Meal Plan Prices', value: input.mealPlanPrices as string, message: `Meal Plan Prices has ${mealPrices.length} values but Meal Plans has ${mealPlanNames.length}.` });
      }
      mealPlanNames.forEach((name, index) => {
        if (seenMealNames.has(normalizeCustomerName(name))) {
          problems.push({ field: 'mealPlans', header: 'Meal Plans', value: name, message: `Duplicate meal plan "${name}".` });
        }
        seenMealNames.add(normalizeCustomerName(name));
        const price = mealPrices[index] == null ? null : parseMoney(mealPrices[index]!);
        if (price !== null && Number.isNaN(price)) {
          problems.push({ field: 'mealPlanPrices', header: 'Meal Plan Prices', value: mealPrices[index] ?? null, message: `Meal plan price "${mealPrices[index] ?? ''}" is not a valid number.` });
        }
        const currencyRaw = mealCurrencies[index];
        const currency = normalizeCurrency(currencyRaw ?? '');
        if (currencyRaw != null && !currency) {
          problems.push({ field: 'mealPlanCurrency', header: 'Meal Plan Currency', value: currencyRaw, message: `Currency "${currencyRaw}" is invalid.` });
        }
        mealPlans.push({
          name,
          description: mealDescriptions[index] != null ? mealDescriptions[index]!.trim() || null : null,
          price: price !== null && Number.isNaN(price) ? null : price,
          currency: currency ?? 'INR',
          monthRates: [],
          seasonRates: [],
        });
      });
    } else if (mealPrices.length || mealDescriptions.length) {
      problems.push({ field: 'mealPlans', header: 'Meal Plans', value: null, message: 'Meal plan prices/descriptions were provided but no Meal Plans were declared.' });
    }

    const mealNameToIndex = new Map(mealPlans.map((m, i) => [normalizeCustomerName(m.name), i]));

    // ---- Meal Plan Monthly Rates -----------------------------------------
    splitValues(input.mealPlanMonthlyRates).forEach((segment) => {
      const parts = segment.split(':');
      if (parts.length !== 4) {
        problems.push({ field: 'mealPlanMonthlyRates', header: 'Meal Plan Monthly Rates', value: segment, message: 'Invalid Meal Plan Monthly Rate format. Use MealPlan:Month:Price:Currency.' });
        return;
      }
      const [mpName, monthLabel, priceStr, curStr] = parts as [string, string, string, string];
      const mealIndex = mealNameToIndex.get(normalizeCustomerName(mpName));
      if (mealIndex === undefined) {
        problems.push({ field: 'mealPlanMonthlyRates', header: 'Meal Plan Monthly Rates', value: mpName, message: `Meal plan monthly rate references unknown meal plan "${mpName}".` });
        return;
      }
      const month = parseMonth(monthLabel);
      if (!month) { problems.push({ field: 'mealPlanMonthlyRates', header: 'Meal Plan Monthly Rates', value: monthLabel, message: `Month "${monthLabel}" is invalid.` }); return; }
      const price = parseMoney(priceStr);
      if (price !== null && Number.isNaN(price)) { problems.push({ field: 'mealPlanMonthlyRates', header: 'Meal Plan Monthly Rates', value: priceStr, message: `Price "${priceStr}" is not a valid number.` }); return; }
      const currency = normalizeCurrency(curStr);
      if (!currency) { problems.push({ field: 'mealPlanMonthlyRates', header: 'Meal Plan Monthly Rates', value: curStr, message: `Currency "${curStr}" is invalid.` }); return; }
      const meal = mealPlans[mealIndex]!;
      if (meal.monthRates.some((m) => m.month === month)) {
        problems.push({ field: 'mealPlanMonthlyRates', header: 'Meal Plan Monthly Rates', value: segment, message: `Duplicate monthly rate for meal plan "${mpName}" in month ${month}.` });
        return;
      }
      meal.monthRates.push({ month, price, currency });
    });

    // ---- Meal Plan Seasonal Rates ----------------------------------------
    splitValues(input.mealPlanSeasonalRates).forEach((segment) => {
      const parts = segment.split(':');
      if (parts.length !== 6) {
        problems.push({ field: 'mealPlanSeasonalRates', header: 'Meal Plan Seasonal Rates', value: segment, message: 'Invalid Meal Plan Seasonal Rate format. Use MealPlan:Season:Start:End:Price:Currency (DD-MM-YYYY).' });
        return;
      }
      const [mpName, seasonName, startStr, endStr, priceStr, curStr] = parts as [string, string, string, string, string, string];
      const mealIndex = mealNameToIndex.get(normalizeCustomerName(mpName));
      if (mealIndex === undefined) {
        problems.push({ field: 'mealPlanSeasonalRates', header: 'Meal Plan Seasonal Rates', value: mpName, message: `Meal plan seasonal rate references unknown meal plan "${mpName}".` });
        return;
      }
      const startDate = parseDate(startStr);
      const endDate = parseDate(endStr);
      if (!startDate || !endDate) { problems.push({ field: 'mealPlanSeasonalRates', header: 'Meal Plan Seasonal Rates', value: `${startStr}–${endStr}`, message: `Invalid dates (use DD-MM-YYYY).` }); return; }
      if (endDate < startDate) { problems.push({ field: 'mealPlanSeasonalRates', header: 'Meal Plan Seasonal Rates', value: segment, message: `Season end date is before the start date.` }); return; }
      const price = parseMoney(priceStr);
      if (price !== null && Number.isNaN(price)) { problems.push({ field: 'mealPlanSeasonalRates', header: 'Meal Plan Seasonal Rates', value: priceStr, message: `Price "${priceStr}" is not a valid number.` }); return; }
      const currency = normalizeCurrency(curStr);
      if (!currency) { problems.push({ field: 'mealPlanSeasonalRates', header: 'Meal Plan Seasonal Rates', value: curStr, message: `Currency "${curStr}" is invalid.` }); return; }
      const meal = mealPlans[mealIndex]!;
      if (meal.seasonRates.some((s) => startDate <= s.endDate && endDate >= s.startDate)) {
        problems.push({ field: 'mealPlanSeasonalRates', header: 'Meal Plan Seasonal Rates', value: seasonName, message: `Season "${seasonName}" overlaps another season of meal plan "${mpName}".` });
        return;
      }
      meal.seasonRates.push({ name: seasonName, startDate, endDate, price, currency });
    });

    return {
      resolved: {
        ...input,
        destinationId: resolved.destinationId ?? undefined,
        cityId: resolved.cityId ?? undefined,
        roomTypes,
        mealPlans,
      },
      problems,
    };
  },
  create: async (
    input: Record<string, unknown>,
    auth: AuthContext,
    context: MastersRequestContext,
    tx: Prisma.TransactionClient,
  ) => {
    const destinationId = String(input.destinationId ?? '');
    const cityId = String(input.cityId ?? '');
    if (!destinationId || !cityId)
      throw new ValidationError('Destination and City must resolve to existing records.');
    const link = await tx.destinationCity.findFirst({ where: { destinationId, cityId } });
    if (!link) throw new ValidationError('The selected city must be linked to the selected destination.');

    const roomTypes = (input.roomTypes as RoomRateDraft[]) ?? [];
    const mealPlans = (input.mealPlans as MealPlanDraft[]) ?? [];
    const currency = String(input.currency ?? '').trim().toUpperCase() || 'INR';

    const created = await tx.hotel.create({
      data: {
        companyId: auth.companyId,
        destinationId,
        cityId,
        name: String(input.name).trim(),
        normalizedName: normalizeCustomerName(String(input.name)),
        status: 'ACTIVE',
        createdById: auth.userId,
        address: blankToNull(input.address),
        starCategory: input.starCategory != null && input.starCategory !== '' ? Number(input.starCategory) : null,
        starRating: input.starRating != null && input.starRating !== '' ? Number(input.starRating) : null,
        reviewLink: blankToNull(input.reviewLink),
        description: sanitizeRichText(blankToNull(input.description)),
        amenities: sanitizeRichText(blankToNull(input.amenities)),
        currency,
      },
    });

    // Room Types with their base + monthly + seasonal rates.
    for (let i = 0; i < roomTypes.length; i++) {
      const room = roomTypes[i]!;
      const roomType = await tx.hotelRoomType.create({
        data: {
          companyId: auth.companyId,
          hotelId: created.id,
          name: room.name,
          status: 'ACTIVE',
          sortOrder: i,
          sellingPrice: room.sellingPrice,
          extraBedPrice: room.extraBedPrice,
          childWithoutBedPrice: room.childWithoutBedPrice,
          currency: room.currency,
        },
      });
      for (const rate of room.monthRates) {
        await tx.hotelRoomTypeMonthPrice.create({
          data: {
            companyId: auth.companyId,
            hotelId: created.id,
            hotelRoomTypeId: roomType.id,
            month: rate.month,
            price: rate.price,
            extraBedPrice: rate.extraBedPrice,
            childWithoutBedPrice: rate.childWithoutBedPrice,
            currency: rate.currency,
          },
        });
      }
      for (const season of room.seasonRates) {
        await tx.hotelRoomTypeSeason.create({
          data: {
            companyId: auth.companyId,
            hotelId: created.id,
            hotelRoomTypeId: roomType.id,
            name: season.name,
            startDate: season.startDate,
            endDate: season.endDate,
            price: season.price,
            extraBedPrice: season.extraBedPrice,
            childWithoutBedPrice: season.childWithoutBedPrice,
            currency: season.currency,
          },
        });
      }
    }

    // Meal Plans with their base + monthly + seasonal rates.
    for (let i = 0; i < mealPlans.length; i++) {
      const meal = mealPlans[i]!;
      const mealPlan = await tx.hotelMealPlan.create({
        data: {
          companyId: auth.companyId,
          hotelId: created.id,
          name: meal.name,
          description: meal.description,
          status: 'ACTIVE',
          sortOrder: i,
          sellingPrice: meal.price,
          currency: meal.currency,
        },
      });
      for (const rate of meal.monthRates) {
        await tx.hotelMealPlanMonthPrice.create({
          data: {
            companyId: auth.companyId,
            hotelId: created.id,
            hotelMealPlanId: mealPlan.id,
            month: rate.month,
            price: rate.price,
            currency: rate.currency,
          },
        });
      }
      for (const season of meal.seasonRates) {
        await tx.hotelMealPlanSeason.create({
          data: {
            companyId: auth.companyId,
            hotelId: created.id,
            hotelMealPlanId: mealPlan.id,
            name: season.name,
            startDate: season.startDate,
            endDate: season.endDate,
            price: season.price,
            currency: season.currency,
          },
        });
      }
    }

    await tx.activityLog.create({
      data: {
        companyId: auth.companyId,
        actorUserId: auth.userId,
        action: 'HOTEL_CREATED',
        entityType: 'Hotel',
        entityId: created.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        metadata: {
          via: 'excel_import',
          destinationId,
          cityId,
          roomTypeCount: roomTypes.length,
          mealPlanCount: mealPlans.length,
        },
      },
    });
    return created.id;
  },
};

const blankToNull = (v: unknown) => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim();
  return s || null;
};
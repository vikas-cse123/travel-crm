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
 * ONE Excel row = ONE hotel. Room Types and Meal Plans are NOT positional or
 * pipe-delimited; each Room Type (and Meal Plan) is a complete, self-contained
 * column group:
 *
 *   Room Type N | Room Type N Description | Room Type N Base Price |
 *   Room Type N Currency | Room Type N Extra Bed Price | Room Type N Child Without Bed Price
 *
 * and every Room Type N also owns its Monthly Rate groups and Seasonal Rate
 * groups as their own columns:
 *
 *   Room Type N Monthly Rate M Month | Room Type N Monthly Rate M Room |
 *   Room Type N Monthly Rate M Extra Bed | Room Type N Monthly Rate M Child Without Bed |
 *   Room Type N Monthly Rate M Currency
 *
 *   Room Type N Seasonal Rate M Season Name | Room Type N Seasonal Rate M Start Date |
 *   Room Type N Seasonal Rate M End Date | Room Type N Seasonal Rate M Room |
 *   Room Type N Seasonal Rate M Extra Bed | Room Type N Seasonal Rate M Child Without Bed |
 *   Room Type N Seasonal Rate M Currency
 *
 * The template ships with Room Type 1 and Room Type 2 (each with one Monthly and
 * one Seasonal rate group) plus Meal Plan 1 and Meal Plan 2 so the pattern is
 * obvious. Users add Room Type 3, 4, 5, … and Meal Plan 3, 4, 5, … (and more
 * Monthly/Seasonal rate groups) simply by copying a complete column group and
 * renumbering it — there is NO hardcoded maximum. The importer discovers every
 * group present in the uploaded file's headers via `resolveColumns`.
 *
 * A Room Type/Meal Plan group that is completely empty is ignored. A group that
 * is partially filled is validated and reported with a clear per-field error.
 */

const BASE_HOTEL_COLUMNS: ImportColumnDefinition[] = [
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
    description: 'Optional. Free text (max 1000).',
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
];

/** Example values the template's Room Type 1 / Room Type 2 groups demonstrate. */
const ROOM_TYPE_EXAMPLES: Record<
  number,
  { name: string; description: string; basePrice: string; extraBed: string; child: string }
> = {
  1: { name: 'Deluxe', description: 'Spacious sea-view room', basePrice: '8000', extraBed: '2000', child: '1000' },
  2: { name: 'Suite', description: 'Separate living and bedroom', basePrice: '12000', extraBed: '3000', child: '1500' },
};

const ROOM_MONTHLY_EXAMPLES: Record<number, { month: string; room: string; extraBed: string; child: string }> = {
  1: { month: 'May', room: '8500', extraBed: '2000', child: '1000' },
  2: { month: 'June', room: '13500', extraBed: '3200', child: '1600' },
};

const ROOM_SEASONAL_EXAMPLES: Record<
  number,
  { name: string; start: string; end: string; room: string; extraBed: string; child: string }
> = {
  1: { name: 'Summer', start: '01-05-2026', end: '30-06-2026', room: '10000', extraBed: '2500', child: '1200' },
  2: { name: 'Festive', start: '20-12-2026', end: '05-01-2027', room: '15000', extraBed: '3500', child: '1800' },
};

const MEAL_PLAN_EXAMPLES: Record<number, { name: string; description: string; basePrice: string }> = {
  1: { name: 'Breakfast', description: 'Morning buffet', basePrice: '1200' },
  2: { name: 'Half Board', description: 'Breakfast and dinner', basePrice: '2500' },
};

const MEAL_MONTHLY_EXAMPLES: Record<number, { month: string; price: string }> = {
  1: { month: 'May', price: '1200' },
  2: { month: 'May', price: '2600' },
};

const MEAL_SEASONAL_EXAMPLES: Record<number, { name: string; start: string; end: string; price: string }> = {
  1: { name: 'Summer', start: '01-05-2026', end: '30-06-2026', price: '1500' },
  2: { name: 'Summer', start: '01-05-2026', end: '30-06-2026', price: '2800' },
};

function roomTypeColumns(n: number): ImportColumnDefinition[] {
  const ex = ROOM_TYPE_EXAMPLES[n];
  return [
    {
      field: `roomType${n}`,
      header: `Room Type ${n}`,
      aliases: [`room type ${n}`, `roomtype ${n}`, `room type ${n} name`],
      required: false,
      example: ex?.name ?? '',
      description: `Optional. Room Type ${n} name. Required only when the group is used.`,
    },
    {
      field: `roomType${n}Description`,
      header: `Room Type ${n} Description`,
      aliases: [`room type ${n} description`, `roomtype ${n} description`, `room type ${n} desc`],
      required: false,
      example: ex?.description ?? '',
      description: `Optional. Room Type ${n} description.`,
    },
    {
      field: `roomType${n}BasePrice`,
      header: `Room Type ${n} Base Price`,
      aliases: [`room type ${n} base price`, `roomtype ${n} base price`, `room type ${n} base`, `room type ${n} price`],
      required: false,
      example: ex?.basePrice ?? '',
      description: `Optional. Base selling price for Room Type ${n}.`,
    },
    {
      field: `roomType${n}Currency`,
      header: `Room Type ${n} Currency`,
      aliases: [`room type ${n} currency`, `roomtype ${n} currency`, `room type ${n} curr`],
      required: false,
      example: 'INR',
      description: `Optional. Three-letter currency code for Room Type ${n} (default INR).`,
    },
    {
      field: `roomType${n}ExtraBedPrice`,
      header: `Room Type ${n} Extra Bed Price`,
      aliases: [`room type ${n} extra bed price`, `roomtype ${n} extra bed price`, `room type ${n} extra bed`],
      required: false,
      example: ex?.extraBed ?? '',
      description: `Optional. Extra bed price for Room Type ${n}.`,
    },
    {
      field: `roomType${n}ChildWithoutBedPrice`,
      header: `Room Type ${n} Child Without Bed Price`,
      aliases: [
        `room type ${n} child without bed price`,
        `roomtype ${n} child without bed price`,
        `room type ${n} child without bed`,
      ],
      required: false,
      example: ex?.child ?? '',
      description: `Optional. Child-without-bed price for Room Type ${n}.`,
    },
  ];
}

function roomMonthlyRateColumns(n: number, m: number): ImportColumnDefinition[] {
  const ex = ROOM_MONTHLY_EXAMPLES[n];
  const prefix = `Room Type ${n} Monthly Rate ${m}`;
  return [
    {
      field: `roomType${n}Monthly${m}Month`,
      header: `${prefix} Month`,
      aliases: [`${prefix} month`, `room type ${n} monthly rate ${m} month name`],
      required: false,
      example: ex?.month ?? '',
      description: `Optional. Month for ${prefix} (name or 1–12).`,
    },
    {
      field: `roomType${n}Monthly${m}Room`,
      header: `${prefix} Room`,
      aliases: [`${prefix} room`, `${prefix} price`, `room type ${n} monthly rate ${m} room price`],
      required: false,
      example: ex?.room ?? '',
      description: `Optional. Room price for ${prefix}.`,
    },
    {
      field: `roomType${n}Monthly${m}ExtraBed`,
      header: `${prefix} Extra Bed`,
      aliases: [`${prefix} extra bed`, `${prefix} extra bed price`],
      required: false,
      example: ex?.extraBed ?? '',
      description: `Optional. Extra bed price for ${prefix}.`,
    },
    {
      field: `roomType${n}Monthly${m}ChildWithoutBed`,
      header: `${prefix} Child Without Bed`,
      aliases: [`${prefix} child without bed`, `${prefix} child without bed price`],
      required: false,
      example: ex?.child ?? '',
      description: `Optional. Child-without-bed price for ${prefix}.`,
    },
    {
      field: `roomType${n}Monthly${m}Currency`,
      header: `${prefix} Currency`,
      aliases: [`${prefix} currency`, `${prefix} curr`],
      required: false,
      example: 'INR',
      description: `Optional. Three-letter currency for ${prefix} (defaults to Room Type ${n} Currency).`,
    },
  ];
}

function roomSeasonalRateColumns(n: number, m: number): ImportColumnDefinition[] {
  const ex = ROOM_SEASONAL_EXAMPLES[n];
  const prefix = `Room Type ${n} Seasonal Rate ${m}`;
  return [
    {
      field: `roomType${n}Season${m}Name`,
      header: `${prefix} Season Name`,
      aliases: [`${prefix} season name`, `${prefix} name`],
      required: false,
      example: ex?.name ?? '',
      description: `Optional. Season name for ${prefix}.`,
    },
    {
      field: `roomType${n}Season${m}StartDate`,
      header: `${prefix} Start Date`,
      aliases: [`${prefix} start date`],
      required: false,
      example: ex?.start ?? '',
      description: `Optional. Start date for ${prefix} (DD-MM-YYYY or YYYY-MM-DD).`,
    },
    {
      field: `roomType${n}Season${m}EndDate`,
      header: `${prefix} End Date`,
      aliases: [`${prefix} end date`],
      required: false,
      example: ex?.end ?? '',
      description: `Optional. End date for ${prefix} (DD-MM-YYYY or YYYY-MM-DD).`,
    },
    {
      field: `roomType${n}Season${m}Room`,
      header: `${prefix} Room`,
      aliases: [`${prefix} room`, `${prefix} price`],
      required: false,
      example: ex?.room ?? '',
      description: `Optional. Room price for ${prefix}.`,
    },
    {
      field: `roomType${n}Season${m}ExtraBed`,
      header: `${prefix} Extra Bed`,
      aliases: [`${prefix} extra bed`, `${prefix} extra bed price`],
      required: false,
      example: ex?.extraBed ?? '',
      description: `Optional. Extra bed price for ${prefix}.`,
    },
    {
      field: `roomType${n}Season${m}ChildWithoutBed`,
      header: `${prefix} Child Without Bed`,
      aliases: [`${prefix} child without bed`, `${prefix} child without bed price`],
      required: false,
      example: ex?.child ?? '',
      description: `Optional. Child-without-bed price for ${prefix}.`,
    },
    {
      field: `roomType${n}Season${m}Currency`,
      header: `${prefix} Currency`,
      aliases: [`${prefix} currency`, `${prefix} curr`],
      required: false,
      example: 'INR',
      description: `Optional. Three-letter currency for ${prefix} (defaults to Room Type ${n} Currency).`,
    },
  ];
}

function mealPlanColumns(n: number): ImportColumnDefinition[] {
  const ex = MEAL_PLAN_EXAMPLES[n];
  return [
    {
      field: `mealPlan${n}`,
      header: `Meal Plan ${n}`,
      aliases: [`meal plan ${n}`, `mealplan ${n}`, `meal plan ${n} name`],
      required: false,
      example: ex?.name ?? '',
      description: `Optional. Meal Plan ${n} name. Required only when the group is used.`,
    },
    {
      field: `mealPlan${n}Description`,
      header: `Meal Plan ${n} Description`,
      aliases: [`meal plan ${n} description`, `mealplan ${n} description`, `meal plan ${n} desc`],
      required: false,
      example: ex?.description ?? '',
      description: `Optional. Meal Plan ${n} description.`,
    },
    {
      field: `mealPlan${n}BasePrice`,
      header: `Meal Plan ${n} Base Price`,
      aliases: [`meal plan ${n} base price`, `mealplan ${n} base price`, `meal plan ${n} base`, `meal plan ${n} price`],
      required: false,
      example: ex?.basePrice ?? '',
      description: `Optional. Base selling price for Meal Plan ${n}.`,
    },
    {
      field: `mealPlan${n}Currency`,
      header: `Meal Plan ${n} Currency`,
      aliases: [`meal plan ${n} currency`, `mealplan ${n} currency`, `meal plan ${n} curr`],
      required: false,
      example: 'INR',
      description: `Optional. Three-letter currency code for Meal Plan ${n} (default INR).`,
    },
  ];
}

function mealMonthlyRateColumns(n: number, m: number): ImportColumnDefinition[] {
  const ex = MEAL_MONTHLY_EXAMPLES[n];
  const prefix = `Meal Plan ${n} Monthly Rate ${m}`;
  return [
    {
      field: `mealPlan${n}Monthly${m}Month`,
      header: `${prefix} Month`,
      aliases: [`${prefix} month`],
      required: false,
      example: ex?.month ?? '',
      description: `Optional. Month for ${prefix} (name or 1–12).`,
    },
    {
      field: `mealPlan${n}Monthly${m}Price`,
      header: `${prefix} Price`,
      aliases: [`${prefix} price`],
      required: false,
      example: ex?.price ?? '',
      description: `Optional. Price for ${prefix}.`,
    },
    {
      field: `mealPlan${n}Monthly${m}Currency`,
      header: `${prefix} Currency`,
      aliases: [`${prefix} currency`, `${prefix} curr`],
      required: false,
      example: 'INR',
      description: `Optional. Three-letter currency for ${prefix} (defaults to Meal Plan ${n} Currency).`,
    },
  ];
}

function mealSeasonalRateColumns(n: number, m: number): ImportColumnDefinition[] {
  const ex = MEAL_SEASONAL_EXAMPLES[n];
  const prefix = `Meal Plan ${n} Seasonal Rate ${m}`;
  return [
    {
      field: `mealPlan${n}Season${m}Name`,
      header: `${prefix} Season Name`,
      aliases: [`${prefix} season name`, `${prefix} name`],
      required: false,
      example: ex?.name ?? '',
      description: `Optional. Season name for ${prefix}.`,
    },
    {
      field: `mealPlan${n}Season${m}StartDate`,
      header: `${prefix} Start Date`,
      aliases: [`${prefix} start date`],
      required: false,
      example: ex?.start ?? '',
      description: `Optional. Start date for ${prefix} (DD-MM-YYYY or YYYY-MM-DD).`,
    },
    {
      field: `mealPlan${n}Season${m}EndDate`,
      header: `${prefix} End Date`,
      aliases: [`${prefix} end date`],
      required: false,
      example: ex?.end ?? '',
      description: `Optional. End date for ${prefix} (DD-MM-YYYY or YYYY-MM-DD).`,
    },
    {
      field: `mealPlan${n}Season${m}Price`,
      header: `${prefix} Price`,
      aliases: [`${prefix} price`],
      required: false,
      example: ex?.price ?? '',
      description: `Optional. Price for ${prefix}.`,
    },
    {
      field: `mealPlan${n}Season${m}Currency`,
      header: `${prefix} Currency`,
      aliases: [`${prefix} currency`, `${prefix} curr`],
      required: false,
      example: 'INR',
      description: `Optional. Three-letter currency for ${prefix} (defaults to Meal Plan ${n} Currency).`,
    },
  ];
}

/**
 * Static columns used by the downloadable template: the hotel base fields plus
 * Room Type 1 & 2 and Meal Plan 1 & 2 groups (each with one Monthly and one
 * Seasonal rate group) so users see the copy-and-renumber pattern.
 */
export const hotelColumns: ImportColumnDefinition[] = [
  ...BASE_HOTEL_COLUMNS,
  ...roomTypeColumns(1),
  ...roomMonthlyRateColumns(1, 1),
  ...roomSeasonalRateColumns(1, 1),
  ...roomTypeColumns(2),
  ...roomMonthlyRateColumns(2, 1),
  ...roomSeasonalRateColumns(2, 1),
  ...mealPlanColumns(1),
  ...mealMonthlyRateColumns(1, 1),
  ...mealSeasonalRateColumns(1, 1),
  ...mealPlanColumns(2),
  ...mealMonthlyRateColumns(2, 1),
  ...mealSeasonalRateColumns(2, 1),
];

/** Lowercase, trimmed, single-spaced — robust against stray whitespace. */
function normalizeHeaderForMatch(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

const ROOM_TYPE_RE = /^room type (\d+)$/;
const ROOM_TYPE_PART_RE = /^room type (\d+) (description|base price|currency|extra bed price|child without bed price)$/;
const ROOM_MONTHLY_RE = /^room type (\d+) monthly rate (\d+) (month|room|extra bed|child without bed|currency)$/;
const ROOM_SEASONAL_RE = /^room type (\d+) seasonal rate (\d+) (season name|start date|end date|room|extra bed|child without bed|currency)$/;
const MEAL_RE = /^meal plan (\d+)$/;
const MEAL_PART_RE = /^meal plan (\d+) (description|base price|currency)$/;
const MEAL_MONTHLY_RE = /^meal plan (\d+) monthly rate (\d+) (month|price|currency)$/;
const MEAL_SEASONAL_RE = /^meal plan (\d+) seasonal rate (\d+) (season name|start date|end date|price|currency)$/;

interface DetectedGroups {
  maxRoom: number;
  maxMeal: number;
  roomMonthly: Record<number, number>;
  roomSeasonal: Record<number, number>;
  mealMonthly: Record<number, number>;
  mealSeasonal: Record<number, number>;
}

/**
 * Discover every Room Type N / Meal Plan N group (and each group's Monthly /
 * Seasonal rate groups) present in the uploaded file's headers. There is NO
 * fixed maximum — any positive integer N and M is recognised.
 */
function detectGroups(headers: string[]): DetectedGroups {
  const groups: DetectedGroups = {
    maxRoom: 0,
    maxMeal: 0,
    roomMonthly: {},
    roomSeasonal: {},
    mealMonthly: {},
    mealSeasonal: {},
  };

  for (const header of headers) {
    const norm = normalizeHeaderForMatch(header);

    const roomName = ROOM_TYPE_RE.exec(norm);
    if (roomName) {
      groups.maxRoom = Math.max(groups.maxRoom, Number(roomName[1]));
      continue;
    }
    const roomPart = ROOM_TYPE_PART_RE.exec(norm);
    if (roomPart) {
      groups.maxRoom = Math.max(groups.maxRoom, Number(roomPart[1]));
      continue;
    }
    const roomMonthly = ROOM_MONTHLY_RE.exec(norm);
    if (roomMonthly) {
      const n = Number(roomMonthly[1]);
      groups.maxRoom = Math.max(groups.maxRoom, n);
      groups.roomMonthly[n] = Math.max(groups.roomMonthly[n] ?? 0, Number(roomMonthly[2]));
      continue;
    }
    const roomSeasonal = ROOM_SEASONAL_RE.exec(norm);
    if (roomSeasonal) {
      const n = Number(roomSeasonal[1]);
      groups.maxRoom = Math.max(groups.maxRoom, n);
      groups.roomSeasonal[n] = Math.max(groups.roomSeasonal[n] ?? 0, Number(roomSeasonal[2]));
      continue;
    }

    const mealName = MEAL_RE.exec(norm);
    if (mealName) {
      groups.maxMeal = Math.max(groups.maxMeal, Number(mealName[1]));
      continue;
    }
    const mealPart = MEAL_PART_RE.exec(norm);
    if (mealPart) {
      groups.maxMeal = Math.max(groups.maxMeal, Number(mealPart[1]));
      continue;
    }
    const mealMonthly = MEAL_MONTHLY_RE.exec(norm);
    if (mealMonthly) {
      const n = Number(mealMonthly[1]);
      groups.maxMeal = Math.max(groups.maxMeal, n);
      groups.mealMonthly[n] = Math.max(groups.mealMonthly[n] ?? 0, Number(mealMonthly[2]));
      continue;
    }
    const mealSeasonal = MEAL_SEASONAL_RE.exec(norm);
    if (mealSeasonal) {
      const n = Number(mealSeasonal[1]);
      groups.maxMeal = Math.max(groups.maxMeal, n);
      groups.mealSeasonal[n] = Math.max(groups.mealSeasonal[n] ?? 0, Number(mealSeasonal[2]));
    }
  }

  return groups;
}

/** Expand the column set to cover every Room Type/Meal Plan group in the file. */
function resolveHotelColumns(headers: string[]): ImportColumnDefinition[] {
  const groups = detectGroups(headers);
  const columns = [...BASE_HOTEL_COLUMNS];

  for (let n = 1; n <= groups.maxRoom; n++) {
    columns.push(...roomTypeColumns(n));
    for (let m = 1; m <= (groups.roomMonthly[n] ?? 0); m++) {
      columns.push(...roomMonthlyRateColumns(n, m));
    }
    for (let m = 1; m <= (groups.roomSeasonal[n] ?? 0); m++) {
      columns.push(...roomSeasonalRateColumns(n, m));
    }
  }

  for (let n = 1; n <= groups.maxMeal; n++) {
    columns.push(...mealPlanColumns(n));
    for (let m = 1; m <= (groups.mealMonthly[n] ?? 0); m++) {
      columns.push(...mealMonthlyRateColumns(n, m));
    }
    for (let m = 1; m <= (groups.mealSeasonal[n] ?? 0); m++) {
      columns.push(...mealSeasonalRateColumns(n, m));
    }
  }

  return columns;
}

const hotelImportSchema = z
  .object({
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
      .finite('Star Rating must be 0–5.')
      .min(0, 'Star Rating must be 0–5.')
      .max(5, 'Star Rating must be 0–5.')
      .nullable()
      .optional(),
    reviewLink: z.string().trim().max(500).nullable().optional(),
    description: z.string().trim().max(50_000).nullable().optional(),
    amenities: z.string().trim().max(50_000).nullable().optional(),
  })
  // Room Type / Meal Plan groups are validated per-row in resolveRow.
  .passthrough();

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

interface RoomRateDraft {
  name: string;
  description: string | null;
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

type Problem = ResolveRowResult['problems'][number];

/** Trimmed string value of a field, or '' when absent. */
function str(input: Record<string, unknown>, field: string): string {
  const v = input[field];
  return v == null ? '' : String(v).trim();
}

/** Highest group index `prefix + N + ...` present in the input's keys. */
function maxIndex(input: Record<string, unknown>, prefix: string): number {
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)`);
  for (const key of Object.keys(input)) {
    const match = re.exec(key);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max;
}

/** Non-negative number; '' → null; anything else invalid reports a problem. */
function money(problems: Problem[], field: string, header: string, raw: string): number | null {
  const v = raw.trim();
  if (v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    problems.push({ field, header, value: raw, message: `${header} must be a non-negative number.` });
    return null;
  }
  return n;
}

/** Three-letter currency code, falling back to `fallback` when blank. */
function resolveCurrency(
  problems: Problem[],
  field: string,
  header: string,
  raw: string,
  fallback: string,
): string {
  const v = raw.trim().toUpperCase();
  if (v === '') return fallback;
  if (/^[A-Z]{3}$/.test(v)) return v;
  problems.push({ field, header, value: raw, message: `${header} must be a three-letter code.` });
  return fallback;
}

function resolveRoomMonthlyRate(
  input: Record<string, unknown>,
  n: number,
  m: number,
  problems: Problem[],
  monthRates: RoomRateDraft['monthRates'],
  defaultCurrency: string,
): RoomRateDraft['monthRates'][number] | null {
  const monthStr = str(input, `roomType${n}Monthly${m}Month`);
  const roomStr = str(input, `roomType${n}Monthly${m}Room`);
  const extraStr = str(input, `roomType${n}Monthly${m}ExtraBed`);
  const childStr = str(input, `roomType${n}Monthly${m}ChildWithoutBed`);
  const curStr = str(input, `roomType${n}Monthly${m}Currency`);
  const prefix = `Room Type ${n} Monthly Rate ${m}`;

  if ([monthStr, roomStr, extraStr, childStr, curStr].every((s) => s === '')) return null;

  const month = parseMonth(monthStr);
  if (!month) {
    problems.push({
      field: `roomType${n}Monthly${m}Month`,
      header: `${prefix} Month`,
      value: monthStr || null,
      message: `${prefix} Month "${monthStr}" is invalid (use a name or 1–12).`,
    });
  }
  const price = money(problems, `roomType${n}Monthly${m}Room`, `${prefix} Room`, roomStr);
  const extra = money(problems, `roomType${n}Monthly${m}ExtraBed`, `${prefix} Extra Bed`, extraStr);
  const child = money(problems, `roomType${n}Monthly${m}ChildWithoutBed`, `${prefix} Child Without Bed`, childStr);
  const currency = resolveCurrency(problems, `roomType${n}Monthly${m}Currency`, `${prefix} Currency`, curStr, defaultCurrency);

  if (month && monthRates.some((r) => r.month === month)) {
    problems.push({
      field: `roomType${n}Monthly${m}Month`,
      header: `${prefix} Month`,
      value: monthStr,
      message: `Duplicate monthly rate for Room Type ${n} in month ${month}.`,
    });
  }

  return { month: month ?? 0, price, extraBedPrice: extra, childWithoutBedPrice: child, currency };
}

function resolveRoomSeasonalRate(
  input: Record<string, unknown>,
  n: number,
  m: number,
  problems: Problem[],
  seasonRates: RoomRateDraft['seasonRates'],
  defaultCurrency: string,
): RoomRateDraft['seasonRates'][number] | null {
  const nameStr = str(input, `roomType${n}Season${m}Name`);
  const startStr = str(input, `roomType${n}Season${m}StartDate`);
  const endStr = str(input, `roomType${n}Season${m}EndDate`);
  const roomStr = str(input, `roomType${n}Season${m}Room`);
  const extraStr = str(input, `roomType${n}Season${m}ExtraBed`);
  const childStr = str(input, `roomType${n}Season${m}ChildWithoutBed`);
  const curStr = str(input, `roomType${n}Season${m}Currency`);
  const prefix = `Room Type ${n} Seasonal Rate ${m}`;

  if ([nameStr, startStr, endStr, roomStr, extraStr, childStr, curStr].every((s) => s === '')) return null;

  const startDate = parseDate(startStr);
  const endDate = parseDate(endStr);
  if (!startDate || !endDate) {
    problems.push({
      field: `roomType${n}Season${m}StartDate`,
      header: `${prefix} Start Date`,
      value: `${startStr}–${endStr}`,
      message: `${prefix} dates must be DD-MM-YYYY (or YYYY-MM-DD).`,
    });
  } else if (endDate < startDate) {
    problems.push({
      field: `roomType${n}Season${m}EndDate`,
      header: `${prefix} End Date`,
      value: `${startStr}–${endStr}`,
      message: `${prefix} end date is before the start date.`,
    });
  }
  if (nameStr === '') {
    problems.push({
      field: `roomType${n}Season${m}Name`,
      header: `${prefix} Season Name`,
      value: null,
      message: `${prefix} requires a season name when the rate is used.`,
    });
  } else if (nameStr.length > 160) {
    problems.push({
      field: `roomType${n}Season${m}Name`,
      header: `${prefix} Season Name`,
      value: nameStr,
      message: `${prefix} season name must be 160 characters or fewer.`,
    });
  }
  const price = money(problems, `roomType${n}Season${m}Room`, `${prefix} Room`, roomStr);
  const extra = money(problems, `roomType${n}Season${m}ExtraBed`, `${prefix} Extra Bed`, extraStr);
  const child = money(problems, `roomType${n}Season${m}ChildWithoutBed`, `${prefix} Child Without Bed`, childStr);
  const currency = resolveCurrency(problems, `roomType${n}Season${m}Currency`, `${prefix} Currency`, curStr, defaultCurrency);

  if (startDate && endDate && seasonRates.some((s) => startDate <= s.endDate && endDate >= s.startDate)) {
    problems.push({
      field: `roomType${n}Season${m}Name`,
      header: `${prefix} Season Name`,
      value: nameStr || null,
      message: `${prefix} overlaps another season of Room Type ${n}.`,
    });
  }

  return {
    name: nameStr || `Season ${m}`,
    startDate: startDate ?? new Date(0),
    endDate: endDate ?? new Date(0),
    price,
    extraBedPrice: extra,
    childWithoutBedPrice: child,
    currency,
  };
}

function resolveRoomTypeGroup(
  input: Record<string, unknown>,
  n: number,
  problems: Problem[],
  seenRoomNames: Set<string>,
): RoomRateDraft | null {
  const name = str(input, `roomType${n}`);
  const description = str(input, `roomType${n}Description`);
  const basePriceStr = str(input, `roomType${n}BasePrice`);
  const currencyStr = str(input, `roomType${n}Currency`);
  const extraBedStr = str(input, `roomType${n}ExtraBedPrice`);
  const childStr = str(input, `roomType${n}ChildWithoutBedPrice`);

  if (name === '') {
    problems.push({
      field: `roomType${n}`,
      header: `Room Type ${n}`,
      value: null,
      message: `Room Type ${n} requires a name when the group is used.`,
    });
  } else if (name.length > 160) {
    problems.push({
      field: `roomType${n}`,
      header: `Room Type ${n}`,
      value: name,
      message: `Room Type ${n} name must be 160 characters or fewer.`,
    });
  } else if (seenRoomNames.has(normalizeCustomerName(name))) {
    problems.push({
      field: `roomType${n}`,
      header: `Room Type ${n}`,
      value: name,
      message: `Duplicate room type "${name}" in this hotel row.`,
    });
  } else {
    seenRoomNames.add(normalizeCustomerName(name));
  }
  if (description.length > 2000) {
    problems.push({
      field: `roomType${n}Description`,
      header: `Room Type ${n} Description`,
      value: description,
      message: `Room Type ${n} Description must be 2000 characters or fewer.`,
    });
  }

  const sellingPrice = money(problems, `roomType${n}BasePrice`, `Room Type ${n} Base Price`, basePriceStr);
  const extraBedPrice = money(problems, `roomType${n}ExtraBedPrice`, `Room Type ${n} Extra Bed Price`, extraBedStr);
  const childWithoutBedPrice = money(problems, `roomType${n}ChildWithoutBedPrice`, `Room Type ${n} Child Without Bed Price`, childStr);
  const currency = resolveCurrency(problems, `roomType${n}Currency`, `Room Type ${n} Currency`, currencyStr, 'INR');

  const monthRates: RoomRateDraft['monthRates'] = [];
  const maxMonthly = maxIndex(input, `roomType${n}Monthly`);
  for (let m = 1; m <= maxMonthly; m++) {
    const rate = resolveRoomMonthlyRate(input, n, m, problems, monthRates, currency);
    if (rate) monthRates.push(rate);
  }

  const seasonRates: RoomRateDraft['seasonRates'] = [];
  const maxSeasonal = maxIndex(input, `roomType${n}Season`);
  for (let m = 1; m <= maxSeasonal; m++) {
    const rate = resolveRoomSeasonalRate(input, n, m, problems, seasonRates, currency);
    if (rate) seasonRates.push(rate);
  }

  const hasBaseContent = [name, description, basePriceStr, currencyStr, extraBedStr, childStr].some(
    (s) => s !== '',
  );
  if (!hasBaseContent && monthRates.length === 0 && seasonRates.length === 0) return null;

  return {
    name,
    description: description === '' ? null : description,
    sellingPrice,
    extraBedPrice,
    childWithoutBedPrice,
    currency,
    monthRates,
    seasonRates,
  };
}

function resolveMealMonthlyRate(
  input: Record<string, unknown>,
  n: number,
  m: number,
  problems: Problem[],
  monthRates: MealPlanDraft['monthRates'],
  defaultCurrency: string,
): MealPlanDraft['monthRates'][number] | null {
  const monthStr = str(input, `mealPlan${n}Monthly${m}Month`);
  const priceStr = str(input, `mealPlan${n}Monthly${m}Price`);
  const curStr = str(input, `mealPlan${n}Monthly${m}Currency`);
  const prefix = `Meal Plan ${n} Monthly Rate ${m}`;

  if ([monthStr, priceStr, curStr].every((s) => s === '')) return null;

  const month = parseMonth(monthStr);
  if (!month) {
    problems.push({
      field: `mealPlan${n}Monthly${m}Month`,
      header: `${prefix} Month`,
      value: monthStr || null,
      message: `${prefix} Month "${monthStr}" is invalid (use a name or 1–12).`,
    });
  }
  const price = money(problems, `mealPlan${n}Monthly${m}Price`, `${prefix} Price`, priceStr);
  const currency = resolveCurrency(problems, `mealPlan${n}Monthly${m}Currency`, `${prefix} Currency`, curStr, defaultCurrency);

  if (month && monthRates.some((r) => r.month === month)) {
    problems.push({
      field: `mealPlan${n}Monthly${m}Month`,
      header: `${prefix} Month`,
      value: monthStr,
      message: `Duplicate monthly rate for Meal Plan ${n} in month ${month}.`,
    });
  }

  return { month: month ?? 0, price, currency };
}

function resolveMealSeasonalRate(
  input: Record<string, unknown>,
  n: number,
  m: number,
  problems: Problem[],
  seasonRates: MealPlanDraft['seasonRates'],
  defaultCurrency: string,
): MealPlanDraft['seasonRates'][number] | null {
  const nameStr = str(input, `mealPlan${n}Season${m}Name`);
  const startStr = str(input, `mealPlan${n}Season${m}StartDate`);
  const endStr = str(input, `mealPlan${n}Season${m}EndDate`);
  const priceStr = str(input, `mealPlan${n}Season${m}Price`);
  const curStr = str(input, `mealPlan${n}Season${m}Currency`);
  const prefix = `Meal Plan ${n} Seasonal Rate ${m}`;

  if ([nameStr, startStr, endStr, priceStr, curStr].every((s) => s === '')) return null;

  const startDate = parseDate(startStr);
  const endDate = parseDate(endStr);
  if (!startDate || !endDate) {
    problems.push({
      field: `mealPlan${n}Season${m}StartDate`,
      header: `${prefix} Start Date`,
      value: `${startStr}–${endStr}`,
      message: `${prefix} dates must be DD-MM-YYYY (or YYYY-MM-DD).`,
    });
  } else if (endDate < startDate) {
    problems.push({
      field: `mealPlan${n}Season${m}EndDate`,
      header: `${prefix} End Date`,
      value: `${startStr}–${endStr}`,
      message: `${prefix} end date is before the start date.`,
    });
  }
  if (nameStr === '') {
    problems.push({
      field: `mealPlan${n}Season${m}Name`,
      header: `${prefix} Season Name`,
      value: null,
      message: `${prefix} requires a season name when the rate is used.`,
    });
  } else if (nameStr.length > 160) {
    problems.push({
      field: `mealPlan${n}Season${m}Name`,
      header: `${prefix} Season Name`,
      value: nameStr,
      message: `${prefix} season name must be 160 characters or fewer.`,
    });
  }
  const price = money(problems, `mealPlan${n}Season${m}Price`, `${prefix} Price`, priceStr);
  const currency = resolveCurrency(problems, `mealPlan${n}Season${m}Currency`, `${prefix} Currency`, curStr, defaultCurrency);

  if (startDate && endDate && seasonRates.some((s) => startDate <= s.endDate && endDate >= s.startDate)) {
    problems.push({
      field: `mealPlan${n}Season${m}Name`,
      header: `${prefix} Season Name`,
      value: nameStr || null,
      message: `${prefix} overlaps another season of Meal Plan ${n}.`,
    });
  }

  return {
    name: nameStr || `Season ${m}`,
    startDate: startDate ?? new Date(0),
    endDate: endDate ?? new Date(0),
    price,
    currency,
  };
}

function resolveMealPlanGroup(
  input: Record<string, unknown>,
  n: number,
  problems: Problem[],
  seenMealNames: Set<string>,
): MealPlanDraft | null {
  const name = str(input, `mealPlan${n}`);
  const description = str(input, `mealPlan${n}Description`);
  const priceStr = str(input, `mealPlan${n}BasePrice`);
  const currencyStr = str(input, `mealPlan${n}Currency`);

  if (name === '') {
    problems.push({
      field: `mealPlan${n}`,
      header: `Meal Plan ${n}`,
      value: null,
      message: `Meal Plan ${n} requires a name when the group is used.`,
    });
  } else if (name.length > 160) {
    problems.push({
      field: `mealPlan${n}`,
      header: `Meal Plan ${n}`,
      value: name,
      message: `Meal Plan ${n} name must be 160 characters or fewer.`,
    });
  } else if (seenMealNames.has(normalizeCustomerName(name))) {
    problems.push({
      field: `mealPlan${n}`,
      header: `Meal Plan ${n}`,
      value: name,
      message: `Duplicate meal plan "${name}" in this hotel row.`,
    });
  } else {
    seenMealNames.add(normalizeCustomerName(name));
  }
  if (description.length > 2000) {
    problems.push({
      field: `mealPlan${n}Description`,
      header: `Meal Plan ${n} Description`,
      value: description,
      message: `Meal Plan ${n} Description must be 2000 characters or fewer.`,
    });
  }

  const price = money(problems, `mealPlan${n}BasePrice`, `Meal Plan ${n} Base Price`, priceStr);
  const currency = resolveCurrency(problems, `mealPlan${n}Currency`, `Meal Plan ${n} Currency`, currencyStr, 'INR');

  const monthRates: MealPlanDraft['monthRates'] = [];
  const maxMonthly = maxIndex(input, `mealPlan${n}Monthly`);
  for (let m = 1; m <= maxMonthly; m++) {
    const rate = resolveMealMonthlyRate(input, n, m, problems, monthRates, currency);
    if (rate) monthRates.push(rate);
  }

  const seasonRates: MealPlanDraft['seasonRates'] = [];
  const maxSeasonal = maxIndex(input, `mealPlan${n}Season`);
  for (let m = 1; m <= maxSeasonal; m++) {
    const rate = resolveMealSeasonalRate(input, n, m, problems, seasonRates, currency);
    if (rate) seasonRates.push(rate);
  }

  const hasBaseContent = [name, description, priceStr, currencyStr].some((s) => s !== '');
  if (!hasBaseContent && monthRates.length === 0 && seasonRates.length === 0) return null;

  return {
    name,
    description: description === '' ? null : description,
    price,
    currency,
    monthRates,
    seasonRates,
  };
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
  resolveColumns: resolveHotelColumns,
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

    // ---- Room Types: every Room Type N group present in the row -------------
    const roomTypes: RoomRateDraft[] = [];
    const seenRoomNames = new Set<string>();
    const maxRoom = maxIndex(input, 'roomType');
    for (let n = 1; n <= maxRoom; n++) {
      const draft = resolveRoomTypeGroup(input, n, problems, seenRoomNames);
      if (!draft) continue;
      roomTypes.push(draft);
    }

    // ---- Meal Plans: every Meal Plan N group present in the row -------------
    const mealPlans: MealPlanDraft[] = [];
    const seenMealNames = new Set<string>();
    const maxMeal = maxIndex(input, 'mealPlan');
    for (let n = 1; n <= maxMeal; n++) {
      const draft = resolveMealPlanGroup(input, n, problems, seenMealNames);
      if (!draft) continue;
      mealPlans.push(draft);
    }

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
        currency: String(input.currency ?? '').trim().toUpperCase() || 'INR',
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
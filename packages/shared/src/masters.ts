import { z } from 'zod';
import { isKnownCountryCode } from './countries.js';

export const MASTER_STATUSES = ['ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
export const DESTINATION_TYPES = ['DOMESTIC', 'INTERNATIONAL'] as const;
export const DESTINATION_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const countryCode = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine(isKnownCountryCode, 'Select a valid country.');
const optionalRichText = z.string().trim().max(50_000).nullable().optional();

export const cityInputSchema = z.object({
  countryCode,
  name: z.string().trim().min(2).max(160),
  airportCode: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .refine((value) => value === '' || /^[A-Z]{3}$/.test(value), 'Use a three-letter airport code.')
    .nullable()
    .optional(),
  status: z.enum(MASTER_STATUSES).default('ACTIVE'),
});

export const cityUpdateSchema = cityInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

const destinationBaseSchema = z.object({
  countryCode,
  name: z.string().trim().min(2).max(200),
  destinationType: z.enum(DESTINATION_TYPES),
  cityIds: z.array(z.string().uuid()).min(1, 'Select at least one city.').max(100),
  inclusions: optionalRichText,
  exclusions: optionalRichText,
  paymentPolicies: optionalRichText,
  cancellationPolicies: optionalRichText,
  bookingTerms: optionalRichText,
  status: z.enum(MASTER_STATUSES).default('ACTIVE'),
});

export const destinationInputSchema = destinationBaseSchema.refine(
  (value) => new Set(value.cityIds).size === value.cityIds.length,
  { path: ['cityIds'], message: 'A city can only be selected once.' },
);

export const destinationUpdateSchema = destinationBaseSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.')
  .refine((value) => !value.cityIds || new Set(value.cityIds).size === value.cityIds.length, {
    path: ['cityIds'],
    message: 'A city can only be selected once.',
  });

export const destinationImageUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(DESTINATION_IMAGE_MIME_TYPES),
  fileSize: z.coerce.number().int().positive(),
});

// ---------------------------------------------------------------------------
// Hotels
// ---------------------------------------------------------------------------

export const HOTEL_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const AIRLINE_LOGO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const HOTEL_MEAL_PLAN_TYPES = [
  'ROOM_ONLY',
  'BREAKFAST',
  'HALF_BOARD',
  'FULL_BOARD',
  'ALL_INCLUSIVE',
  'CUSTOM',
] as const;

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalTime = z
  .string()
  .trim()
  .refine((value) => value === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(value), 'Use a HH:MM time.')
  .nullable()
  .optional();
const optionalMoney = z.coerce.number().nonnegative().max(99_999_999.99).nullable().optional();
const optionalCount = z.coerce.number().int().min(0).max(100).nullable().optional();
const currency = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z]{3}$/.test(value), 'Use a three-letter currency code.');

const hotelBaseSchema = z.object({
  destinationId: z.string().uuid(),
  cityId: z.string().uuid(),
  name: z.string().trim().min(2).max(200),
  starCategory: z.coerce.number().int().min(1).max(5).nullable().optional(),
  starRating: z.coerce.number().min(0).max(5).nullable().optional(),
  propertyType: optionalText(80),
  address: optionalText(1000),
  landmark: optionalText(200),
  postalCode: optionalText(20),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  contactName: optionalText(160),
  phone: optionalText(40),
  email: z.string().trim().max(255).email().nullable().optional().or(z.literal('')),
  website: optionalText(255),
  reviewLink: optionalText(500),
  checkInTime: optionalTime,
  checkOutTime: optionalTime,
  description: optionalRichText,
  amenities: optionalRichText,
  internalNotes: optionalText(50_000),
  externalCode: optionalText(80),
  isDefaultForCity: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(100_000).optional(),
  status: z.enum(MASTER_STATUSES).default('ACTIVE'),
});

export const hotelInputSchema = hotelBaseSchema;
export const hotelUpdateSchema = hotelBaseSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export const hotelRoomTypeInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  code: optionalText(40),
  description: optionalText(2000),
  maxAdults: optionalCount,
  maxChildren: optionalCount,
  maxOccupancy: optionalCount,
  bedType: optionalText(80),
  numberOfBeds: optionalCount,
  roomSize: optionalText(60),
  viewType: optionalText(80),
  baseCost: optionalMoney,
  sellingPrice: optionalMoney,
  currency: currency.default('INR'),
  taxPercentage: z.coerce.number().min(0).max(100).nullable().optional(),
  internalNotes: optionalText(2000),
  status: z.enum(MASTER_STATUSES).default('ACTIVE'),
  sortOrder: z.coerce.number().int().min(0).max(100_000).optional(),
});
export const hotelRoomTypeUpdateSchema = hotelRoomTypeInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export const hotelMealPlanInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  code: optionalText(40),
  type: z.enum(HOTEL_MEAL_PLAN_TYPES).default('CUSTOM'),
  description: optionalText(2000),
  baseCost: optionalMoney,
  sellingPrice: optionalMoney,
  currency: currency.default('INR'),
  internalNotes: optionalText(2000),
  status: z.enum(MASTER_STATUSES).default('ACTIVE'),
  sortOrder: z.coerce.number().int().min(0).max(100_000).optional(),
});
export const hotelMealPlanUpdateSchema = hotelMealPlanInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export const hotelImageUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(HOTEL_IMAGE_MIME_TYPES),
  fileSize: z.coerce.number().int().positive(),
});

// ---------------------------------------------------------------------------
// Airlines
// ---------------------------------------------------------------------------

const optionalIata = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => value === '' || /^[A-Z0-9]{2}$/.test(value), 'Use a two-character IATA code.')
  .nullable()
  .optional();
const optionalIcao = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => value === '' || /^[A-Z]{3}$/.test(value), 'Use a three-letter ICAO code.')
  .nullable()
  .optional();

const airlineBaseSchema = z.object({
  name: z.string().trim().min(2).max(200),
  iataCode: optionalIata,
  icaoCode: optionalIcao,
  countryCode: countryCode.nullable().optional(),
  website: optionalText(255),
  internalNotes: optionalText(50_000),
  status: z.enum(MASTER_STATUSES).default('ACTIVE'),
});

export const airlineInputSchema = airlineBaseSchema;
export const airlineUpdateSchema = airlineBaseSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

export const airlineLogoUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum(AIRLINE_LOGO_MIME_TYPES),
  fileSize: z.coerce.number().int().positive(),
});

export const destinationCityAddSchema = z.object({ cityId: z.string().uuid() });
export const destinationCityReorderSchema = z.object({
  cityIds: z.array(z.string().uuid()).min(1).max(100),
});
export const masterStatusSchema = z.object({ status: z.enum(MASTER_STATUSES) });

export type CityInput = z.infer<typeof cityInputSchema>;
export type CityUpdateInput = z.infer<typeof cityUpdateSchema>;
export type DestinationInput = z.infer<typeof destinationInputSchema>;
export type DestinationUpdateInput = z.infer<typeof destinationUpdateSchema>;
export type DestinationImageUploadInput = z.infer<typeof destinationImageUploadSchema>;
export type HotelInput = z.infer<typeof hotelInputSchema>;
export type HotelUpdateInput = z.infer<typeof hotelUpdateSchema>;
export type HotelRoomTypeInput = z.infer<typeof hotelRoomTypeInputSchema>;
export type HotelRoomTypeUpdateInput = z.infer<typeof hotelRoomTypeUpdateSchema>;
export type HotelMealPlanInput = z.infer<typeof hotelMealPlanInputSchema>;
export type HotelMealPlanUpdateInput = z.infer<typeof hotelMealPlanUpdateSchema>;
export type HotelImageUploadInput = z.infer<typeof hotelImageUploadSchema>;
export type HotelMealPlanType = (typeof HOTEL_MEAL_PLAN_TYPES)[number];
export type AirlineInput = z.infer<typeof airlineInputSchema>;
export type AirlineUpdateInput = z.infer<typeof airlineUpdateSchema>;
export type AirlineLogoUploadInput = z.infer<typeof airlineLogoUploadSchema>;

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

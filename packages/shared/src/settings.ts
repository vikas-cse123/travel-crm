import { z } from 'zod';

/**
 * Company settings validation (Phase 18).
 *
 * All update schemas trim input and normalise empty optionals to null so a
 * cleared field is stored consistently. Nothing here calculates tax or converts
 * currency; these are plain company-configuration values.
 */

const trimmed = (max: number) => z.string().trim().max(max);
const optionalTrimmed = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value ? value : null))
    .nullable()
    .optional();

/** A curated, extensible list of IANA zones surfaced in the selector. */
export const SETTINGS_TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Bangkok',
  'Asia/Kathmandu',
  'Asia/Colombo',
  'Asia/Karachi',
  'Asia/Dhaka',
  'Asia/Tokyo',
  'Asia/Hong_Kong',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Los_Angeles',
  'Australia/Sydney',
  'UTC',
] as const;

/** Short list of common currencies offered in the selector. */
export const SETTINGS_CURRENCIES = [
  'INR',
  'USD',
  'EUR',
  'GBP',
  'AED',
  'SGD',
  'THB',
  'AUD',
  'JPY',
] as const;

/** Any valid IANA zone (validated at runtime), not only the curated list. */
const ianaTimezone = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'A valid IANA timezone is required.');

const currencyCode = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Za-z]{3}$/, 'Use a three-letter currency code.')
  .transform((value) => value.toUpperCase());

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a #RRGGBB colour.');

export const LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export const settingsProfileSchema = z.object({
  name: trimmed(120).min(2, 'Company name is required.'),
  email: z.string().trim().email().max(255),
  phone: optionalTrimmed(32),
  website: z
    .union([z.string().trim().url().max(255), z.literal('')])
    .transform((value) => (value ? value : null))
    .nullable()
    .optional(),
  address: optionalTrimmed(1000),
});

export const settingsBrandingSchema = z.object({
  primaryColor: hexColor,
});

export const settingsTaxSchema = z.object({
  // Optional; supports Indian GSTIN and other registration formats alike.
  taxRegistrationNumber: optionalTrimmed(40),
});

export const settingsPreferencesSchema = z.object({
  timezone: ianaTimezone,
  defaultCurrency: currencyCode,
});

export const settingsDefaultTermsSchema = z.object({
  quotationTerms: optionalTrimmed(8000),
  bookingTerms: optionalTrimmed(8000),
});

export const companyBankAccountSchema = z
  .object({
    accountHolderName: trimmed(200).min(2),
    bankName: trimmed(200).min(2),
    branchName: optionalTrimmed(200),
    accountNumber: z
      .string()
      .trim()
      .min(4)
      .max(64)
      .regex(/^[0-9A-Za-z]+$/, 'Account number may only contain letters and digits.'),
    confirmAccountNumber: z.string().trim().min(4).max(64),
    ifscCode: optionalTrimmed(20),
    swiftCode: optionalTrimmed(20),
    accountType: optionalTrimmed(40),
  })
  .refine((value) => value.accountNumber === value.confirmAccountNumber, {
    message: 'Account number and confirmation must match.',
    path: ['confirmAccountNumber'],
  });

export const logoUploadRequestSchema = z.object({
  fileName: trimmed(255).min(1),
  mimeType: z.enum(LOGO_MIME_TYPES),
  fileSize: z.coerce
    .number()
    .int()
    .positive()
    .max(50 * 1024 * 1024),
});

export type SettingsProfileInput = z.infer<typeof settingsProfileSchema>;
export type SettingsBrandingInput = z.infer<typeof settingsBrandingSchema>;
export type SettingsTaxInput = z.infer<typeof settingsTaxSchema>;
export type SettingsPreferencesInput = z.infer<typeof settingsPreferencesSchema>;
export type SettingsDefaultTermsInput = z.infer<typeof settingsDefaultTermsSchema>;
export type CompanyBankAccountInput = z.infer<typeof companyBankAccountSchema>;
export type LogoUploadRequestInput = z.infer<typeof logoUploadRequestSchema>;

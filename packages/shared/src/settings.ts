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
/** Optional field normalised to uppercase (GSTIN, TAN); empty becomes null. */
const optionalTrimmedUpper = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value ? value.toUpperCase() : null))
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

/**
 * Active ISO 4217 currency codes offered in the selector — the complete list of
 * circulating currencies (including supranational codes such as XAF/XCD/XOF/XPF).
 * Single shared source for every currency picker in the app; INR stays the
 * default for new prices but any active code is selectable. No conversion is
 * ever performed — a stored code is always used as-is.
 */
export const SETTINGS_CURRENCIES = [
  'AED',
  'AFN',
  'ALL',
  'AMD',
  'ANG',
  'AOA',
  'ARS',
  'AUD',
  'AWG',
  'AZN',
  'BAM',
  'BBD',
  'BDT',
  'BGN',
  'BHD',
  'BIF',
  'BMD',
  'BND',
  'BOB',
  'BRL',
  'BSD',
  'BTN',
  'BWP',
  'BYN',
  'BZD',
  'CAD',
  'CDF',
  'CHF',
  'CLP',
  'CNY',
  'COP',
  'CRC',
  'CUC',
  'CUP',
  'CVE',
  'CZK',
  'DJF',
  'DKK',
  'DOP',
  'DZD',
  'EGP',
  'ERN',
  'ETB',
  'EUR',
  'FJD',
  'FKP',
  'GBP',
  'GEL',
  'GHS',
  'GIP',
  'GMD',
  'GNF',
  'GTQ',
  'GYD',
  'HKD',
  'HNL',
  'HTG',
  'HUF',
  'IDR',
  'ILS',
  'INR',
  'IQD',
  'IRR',
  'ISK',
  'JMD',
  'JOD',
  'JPY',
  'KES',
  'KGS',
  'KHR',
  'KMF',
  'KPW',
  'KRW',
  'KWD',
  'KYD',
  'KZT',
  'LAK',
  'LBP',
  'LKR',
  'LRD',
  'LSL',
  'LYD',
  'MAD',
  'MDL',
  'MGA',
  'MKD',
  'MMK',
  'MNT',
  'MOP',
  'MRU',
  'MUR',
  'MVR',
  'MWK',
  'MXN',
  'MYR',
  'MZN',
  'NAD',
  'NGN',
  'NIO',
  'NOK',
  'NPR',
  'NZD',
  'OMR',
  'PAB',
  'PEN',
  'PGK',
  'PHP',
  'PKR',
  'PLN',
  'PYG',
  'QAR',
  'RON',
  'RSD',
  'RUB',
  'RWF',
  'SAR',
  'SBD',
  'SCR',
  'SDG',
  'SEK',
  'SGD',
  'SHP',
  'SLE',
  'SLL',
  'SOS',
  'SRD',
  'SSP',
  'STN',
  'SVC',
  'SYP',
  'SZL',
  'THB',
  'TJS',
  'TMT',
  'TND',
  'TOP',
  'TRY',
  'TTD',
  'TWD',
  'TZS',
  'UAH',
  'UGX',
  'USD',
  'UYU',
  'UZS',
  'VED',
  'VES',
  'VND',
  'VUV',
  'WST',
  'XAF',
  'XCD',
  'XOF',
  'XPF',
  'YER',
  'ZAR',
  'ZMW',
  'ZWL',
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

/** Optional non-negative whole-number metric (e.g. reviews, trips sold). */
const optionalCount = (max: number) => z.number().int().min(0).max(max).nullable().optional();

/** Year the company started operating (company profile). */
const optionalOperatingSince = z.number().int().min(1900).max(2100).nullable().optional();

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
  operatingSince: optionalOperatingSince,
  totalReviews: optionalCount(100_000_000),
  tripsSold: optionalCount(100_000_000),
});

export const settingsBrandingSchema = z.object({
  primaryColor: hexColor,
});

export const settingsTaxSchema = z.object({
  // Optional GSTIN, stored uppercase in the legacy taxRegistrationNumber column
  // so existing PDF/document rendering keeps working. Supports Indian GSTIN and
  // other registration formats alike.
  taxRegistrationNumber: optionalTrimmedUpper(40),
  // Optional TAN (Tax Deduction Account Number), stored uppercase.
  tan: optionalTrimmedUpper(40),
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

export const customDomainCreateSchema = z.object({
  hostname: z.string().trim().min(1).max(253),
});

export type SettingsProfileInput = z.infer<typeof settingsProfileSchema>;
export type SettingsBrandingInput = z.infer<typeof settingsBrandingSchema>;
export type SettingsTaxInput = z.infer<typeof settingsTaxSchema>;
export type SettingsPreferencesInput = z.infer<typeof settingsPreferencesSchema>;
export type SettingsDefaultTermsInput = z.infer<typeof settingsDefaultTermsSchema>;
export type CompanyBankAccountInput = z.infer<typeof companyBankAccountSchema>;
export type LogoUploadRequestInput = z.infer<typeof logoUploadRequestSchema>;
export type CustomDomainCreateInput = z.infer<typeof customDomainCreateSchema>;

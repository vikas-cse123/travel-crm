/**
 * Field limits shared by the Zod schemas, the Prisma column sizes and the
 * frontend forms, so all three agree on what "too long" means.
 */

export const FIELD_LIMITS = {
  COMPANY_NAME_MIN: 2,
  COMPANY_NAME_MAX: 120,
  COMPANY_SLUG_MAX: 140,

  FULL_NAME_MIN: 2,
  FULL_NAME_MAX: 120,

  USERNAME_MIN: 3,
  USERNAME_MAX: 40,

  EMAIL_MAX: 255,
  PHONE_MAX: 32,

  PASSWORD_MIN: 8,
  PASSWORD_MAX: 128,

  ROLE_NAME_MAX: 60,
  TEMPLATE_NAME_MAX: 60,
  DESCRIPTION_MAX: 500,

  IP_ADDRESS_MAX: 45, // IPv6 with an IPv4-mapped suffix
  USER_AGENT_MAX: 512,
} as const;

/** Lowercase letters, digits, dot, underscore and hyphen. */
export const USERNAME_PATTERN = /^[a-z0-9._-]+$/;

/** Lowercase alphanumeric words joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** At least one lowercase, one uppercase, one digit and one special character. */
export const PASSWORD_RULES = {
  minLength: FIELD_LIMITS.PASSWORD_MIN,
  requireLowercase: /[a-z]/,
  requireUppercase: /[A-Z]/,
  requireNumber: /[0-9]/,
  requireSpecial: /[^A-Za-z0-9]/,
} as const;

/** Length of the numeric email-verification OTP. */
export const OTP_LENGTH = 6;

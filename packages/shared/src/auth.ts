import { z } from 'zod';
import { FIELD_LIMITS, OTP_LENGTH, PASSWORD_RULES } from './validation.js';
import type { UserStatus } from './enums.js';

/**
 * Authentication contracts shared by the API and the web app.
 *
 * The Zod schemas here are the single source of truth for validation: the
 * frontend uses them in React Hook Form, the backend uses them in
 * `validateRequest`. One definition means the client cannot accept something
 * the server will reject, or vice versa.
 */

// ---------------------------------------------------------------------------
// Field-level schemas
// ---------------------------------------------------------------------------

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .max(FIELD_LIMITS.EMAIL_MAX, 'Email is too long')
  .email('Enter a valid email address')
  // Normalisation lives in the schema so every entry point agrees on the
  // canonical form used by the unique index.
  .transform((value) => value.toLowerCase());

export const phoneSchema = z
  .string()
  .trim()
  .min(6, 'Enter a valid phone number')
  .max(FIELD_LIMITS.PHONE_MAX, 'Phone number is too long')
  .regex(/^\+?[0-9\s()-]{6,}$/, 'Enter a valid phone number');

/**
 * Password policy. Each rule is a separate `.refine` so the form can show
 * exactly which requirement is unmet rather than one lumped message.
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_RULES.minLength, `Password must be at least ${PASSWORD_RULES.minLength} characters`)
  .max(FIELD_LIMITS.PASSWORD_MAX, 'Password is too long')
  .refine((v) => PASSWORD_RULES.requireLowercase.test(v), {
    message: 'Password must include a lowercase letter',
  })
  .refine((v) => PASSWORD_RULES.requireUppercase.test(v), {
    message: 'Password must include an uppercase letter',
  })
  .refine((v) => PASSWORD_RULES.requireNumber.test(v), {
    message: 'Password must include a number',
  })
  .refine((v) => PASSWORD_RULES.requireSpecial.test(v), {
    message: 'Password must include a special character',
  });

/** Individual password requirements, for the live checklist in the UI. */
export const PASSWORD_REQUIREMENTS: ReadonlyArray<{
  id: string;
  label: string;
  test: (value: string) => boolean;
}> = [
  {
    id: 'length',
    label: `At least ${PASSWORD_RULES.minLength} characters`,
    test: (v) => v.length >= PASSWORD_RULES.minLength,
  },
  {
    id: 'lowercase',
    label: 'One lowercase letter',
    test: (v) => PASSWORD_RULES.requireLowercase.test(v),
  },
  {
    id: 'uppercase',
    label: 'One uppercase letter',
    test: (v) => PASSWORD_RULES.requireUppercase.test(v),
  },
  { id: 'number', label: 'One number', test: (v) => PASSWORD_RULES.requireNumber.test(v) },
  {
    id: 'special',
    label: 'One special character',
    test: (v) => PASSWORD_RULES.requireSpecial.test(v),
  },
];

export const otpSchema = z
  .string()
  .trim()
  .length(OTP_LENGTH, `Enter the ${OTP_LENGTH}-digit code`)
  .regex(/^\d+$/, 'The code must contain digits only');

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

export const registerSchema = z
  .object({
    companyName: z
      .string()
      .trim()
      .min(FIELD_LIMITS.COMPANY_NAME_MIN, 'Company name must be at least 2 characters')
      .max(FIELD_LIMITS.COMPANY_NAME_MAX, 'Company name is too long'),
    fullName: z
      .string()
      .trim()
      .min(FIELD_LIMITS.FULL_NAME_MIN, 'Full name must be at least 2 characters')
      .max(FIELD_LIMITS.FULL_NAME_MAX, 'Full name is too long'),
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the Terms and Privacy Policy' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({ otp: otpSchema });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'The reset link is invalid'),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ---------------------------------------------------------------------------
// Response contracts
// ---------------------------------------------------------------------------

export interface AuthCompany {
  id: string;
  name: string;
  slug: string;
  /** Non-sensitive branding for the app shell (Phase 18). */
  primaryColor?: string;
  timezone?: string;
  defaultCurrency?: string;
  hasLogo?: boolean;
}

export interface AuthRole {
  id: string;
  name: string;
  hierarchyLevel: number;
}

/**
 * The current-user object returned by `GET /api/auth/me`.
 *
 * Deliberately excludes `passwordHash` and every token hash — this type is the
 * contract that keeps secrets out of responses.
 */
export interface AuthenticatedUser {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  emailVerified: boolean;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  mustChangePassword: boolean;
  company: AuthCompany;
  role: AuthRole;
  /** Effective permission keys: (role ∪ template) ∩ available. */
  permissions: string[];
}

/** Non-sensitive session facts safe to expose to the client. */
export interface AuthSessionState {
  expiresAt: string;
  rememberMe: boolean;
}

export interface MeResponse {
  user: AuthenticatedUser;
  session: AuthSessionState;
}

export interface RegisterResponse {
  user: AuthenticatedUser;
  /** Always true immediately after registration. */
  requiresEmailVerification: true;
  /** Masked for display on the verification screen, e.g. `a••i@example.com`. */
  maskedEmail: string;
}

export interface LoginResponse {
  user: AuthenticatedUser;
  session: AuthSessionState;
  /** True when the account still needs OTP verification. */
  requiresEmailVerification: boolean;
  maskedEmail?: string;
}

export interface VerifyEmailResponse {
  user: AuthenticatedUser;
  session: AuthSessionState;
}

export interface ResendOtpResponse {
  /** Seconds the client must wait before another resend is allowed. */
  cooldownSeconds: number;
  maskedEmail: string;
}

export interface ResetTokenValidationResponse {
  valid: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Partially mask an address for display: `owner@example.com` → `o••••r@example.com`.
 *
 * Confirms to the user which mailbox to check without printing the full
 * address on a screen someone may be looking over.
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '•••';

  if (local.length <= 2) {
    return `${local[0] ?? '•'}•••@${domain}`;
  }

  const first = local[0] ?? '';
  const last = local[local.length - 1] ?? '';
  return `${first}${'•'.repeat(Math.min(local.length - 2, 6))}${last}@${domain}`;
}

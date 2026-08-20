import { z } from 'zod';
import { emailSchema, passwordSchema, phoneSchema } from './auth.js';
import { FIELD_LIMITS, USERNAME_PATTERN } from './validation.js';
import type { UserStatus } from './enums.js';

export const adminUserStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']);
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(FIELD_LIMITS.USERNAME_MIN, 'Username must be at least 3 characters')
  .max(FIELD_LIMITS.USERNAME_MAX)
  .regex(USERNAME_PATTERN, 'Use lowercase letters, numbers, dots, underscores or hyphens');
const fullNameSchema = z.string().trim().min(2, 'Full name must be at least 2 characters').max(120);
const optionalPhoneSchema = z
  .union([phoneSchema, z.literal('').transform(() => undefined)])
  .optional();
const optionalUuid = z.union([z.string().uuid(), z.null()]).optional();

export const USER_GENDER_VALUES = ['MALE', 'FEMALE'] as const;
const optionalGender = z.enum(USER_GENDER_VALUES).nullable().optional();
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const createUserSchema = z
  .object({
    fullName: fullNameSchema,
    username: usernameSchema,
    email: emailSchema,
    phone: optionalPhoneSchema,
    roleId: z.string().uuid(),
    permissionTemplateId: optionalUuid,
    status: adminUserStatusSchema.default('ACTIVE'),
    temporaryPassword: passwordSchema,
    confirmTemporaryPassword: z.string(),
    mustChangePassword: z.boolean().default(true),
    gender: optionalGender,
    jobTitle: optionalText(120),
    bio: optionalText(2000),
    specialization: optionalText(200),
    yearsOfExperience: z.coerce.number().int().min(0).max(100).nullable().optional(),
    tripsPlanned: z.coerce.number().int().min(0).max(1000000).nullable().optional(),
    languages: optionalText(200),
    whatsappNumber: optionalPhoneSchema.nullable(),
  })
  .refine((v) => v.temporaryPassword === v.confirmTemporaryPassword, {
    path: ['confirmTemporaryPassword'],
    message: 'Passwords do not match',
  });

export const updateUserSchema = z
  .object({
    fullName: fullNameSchema.optional(),
    username: usernameSchema.optional(),
    email: emailSchema.optional(),
    phone: optionalPhoneSchema.nullable(),
    roleId: z.string().uuid().optional(),
    permissionTemplateId: optionalUuid,
    mustChangePassword: z.boolean().optional(),
    gender: optionalGender,
    jobTitle: optionalText(120),
    bio: optionalText(2000),
    specialization: optionalText(200),
    yearsOfExperience: z.coerce.number().int().min(0).max(100).nullable().optional(),
    tripsPlanned: z.coerce.number().int().min(0).max(1000000).nullable().optional(),
    languages: optionalText(200),
    whatsappNumber: optionalPhoneSchema.nullable(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field');

/**
 * Owner-only administrative password set. Reuses the exact same password rules
 * as signup/reset; `oldPassword` is deliberately not accepted because this is
 * an administrative reset, not the normal change-password flow.
 */
export const setUserPasswordSchema = z.object({
  password: passwordSchema,
});

export type SetUserPasswordInput = z.infer<typeof setUserPasswordSchema>;

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export interface ManagedUser {
  id: string;
  fullName: string;
  username: string;
  email: string;
  phone: string | null;
  status: UserStatus;
  emailVerified?: boolean;
  emailVerifiedAt?: string | null;
  lastLoginAt: string | null;
  mustChangePassword?: boolean;
  createdAt: string;
  updatedAt?: string;
  role: { id: string; name: string; hierarchyLevel: number };
  permissionTemplate: { id: string; name: string } | null;
  effectivePermissions?: string[];
  gender?: 'MALE' | 'FEMALE' | null;
  jobTitle?: string | null;
  bio?: string | null;
  specialization?: string | null;
  yearsOfExperience?: number | null;
  tripsPlanned?: number | null;
  languages?: string | null;
  whatsappNumber?: string | null;
  profileImageUrl?: string | null;
}

export interface UserListResult {
  data: ManagedUser[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
export interface UserLookups {
  roles: Array<{ id: string; name: string; hierarchyLevel: number }>;
  permissionTemplates: Array<{ id: string; name: string }>;
}

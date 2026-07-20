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
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide at least one field');

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
}

export interface UserListResult {
  data: ManagedUser[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}
export interface UserLookups {
  roles: Array<{ id: string; name: string; hierarchyLevel: number }>;
  permissionTemplates: Array<{ id: string; name: string }>;
}

import { z } from 'zod';
import { FIELD_LIMITS } from './validation.js';

const permissionKeys = z.array(z.string().min(1)).max(200).default([]);
export const roleInputSchema = z.object({
  name: z.string().trim().min(2).max(FIELD_LIMITS.ROLE_NAME_MAX),
  description: z.string().trim().max(FIELD_LIMITS.DESCRIPTION_MAX).nullable().optional(),
  hierarchyLevel: z.number().int().min(1).max(99),
  permissions: permissionKeys,
});
export const roleUpdateSchema = roleInputSchema.partial().refine((v) => Object.keys(v).length > 0);
export const templateInputSchema = z.object({
  name: z.string().trim().min(2).max(FIELD_LIMITS.TEMPLATE_NAME_MAX),
  description: z.string().trim().max(FIELD_LIMITS.DESCRIPTION_MAX).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  permissions: permissionKeys,
});
export const templateUpdateSchema = templateInputSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export type RoleInput = z.infer<typeof roleInputSchema>;
export type RoleUpdate = z.infer<typeof roleUpdateSchema>;
export type TemplateInput = z.infer<typeof templateInputSchema>;
export type TemplateUpdate = z.infer<typeof templateUpdateSchema>;

export interface PermissionRecord {
  id: string;
  key: string;
  module: string;
  action: string;
  description: string;
  isAvailable: boolean;
}
export interface PermissionGroup {
  module: string;
  label: string;
  permissions: PermissionRecord[];
}
export interface ManagedRole {
  id: string;
  name: string;
  description: string | null;
  hierarchyLevel: number;
  isSystem: boolean;
  permissionCount: number;
  activeUserCount: number;
  createdAt: string;
  updatedAt: string;
  permissions?: PermissionRecord[];
  users?: Array<{ id: string; fullName: string; username: string; status: string }>;
}
export interface ManagedTemplate {
  id: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  permissionCount: number;
  assignedUserCount: number;
  createdBy: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
  permissions?: PermissionRecord[];
  users?: Array<{ id: string; fullName: string; username: string; status: string }>;
}
export interface PageResult<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

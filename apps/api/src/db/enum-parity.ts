import type {
  ActivityAction as PrismaActivityAction,
  CompanyStatus as PrismaCompanyStatus,
  TemplateStatus as PrismaTemplateStatus,
  UserStatus as PrismaUserStatus,
} from '@prisma/client';
import type {
  ActivityAction as SharedActivityAction,
  CompanyStatus as SharedCompanyStatus,
  TemplateStatus as SharedTemplateStatus,
  UserStatus as SharedUserStatus,
} from '@interscale/shared';

/**
 * Compile-time proof that the enums in `@interscale/shared` match the enums
 * Prisma generates from schema.prisma.
 *
 * The shared package cannot import Prisma (the browser bundles it), so the two
 * definitions are written twice. This file makes divergence a build error
 * instead of a bug that surfaces at runtime: adding a value to the schema
 * without adding it to shared — or vice versa — fails `npm run typecheck`.
 *
 * The form matters. On mismatch `AssertEqual` resolves to `never`, and only a
 * type ANNOTATION rejects `true` against it:
 *
 *   const ok: AssertEqual<A, B> = true;   // errors on drift  ✅
 *   const no = true as AssertEqual<A, B>; // `as never` is allowed, silent  ❌
 *   type T = AssertEqual<A, B>;           // a bare alias never errors      ❌
 *
 * Verified by temporarily adding a value to one side and confirming
 * `npm run typecheck` fails.
 */

/** Resolves to `true` when A and B are the same union, otherwise `never`. */
type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

const companyStatusParity: AssertEqual<SharedCompanyStatus, PrismaCompanyStatus> = true;
const userStatusParity: AssertEqual<SharedUserStatus, PrismaUserStatus> = true;
const templateStatusParity: AssertEqual<SharedTemplateStatus, PrismaTemplateStatus> = true;
const activityActionParity: AssertEqual<SharedActivityAction, PrismaActivityAction> = true;

/** Exported only so `noUnusedLocals` is satisfied; the types are the point. */
export const ENUM_PARITY = {
  companyStatusParity,
  userStatusParity,
  templateStatusParity,
  activityActionParity,
} as const;

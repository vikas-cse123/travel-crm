import { randomUUID } from 'node:crypto';
import type { Prisma, ActivityAction } from '@prisma/client';
import {
  PERMISSIONS,
  type CompanyBankAccountInput,
  type LogoUploadRequestInput,
  type SettingsBrandingInput,
  type SettingsDefaultTermsInput,
  type SettingsPreferencesInput,
  type SettingsProfileInput,
  type SettingsTaxInput,
} from '@interscale/shared';
import type { AuthContext } from '../../middleware/authenticate.js';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { ValidationError } from '../../utils/errors.js';
import { encryptSensitiveValue, maskSensitiveIdentifier, safeCompare } from '../../utils/crypto.js';
import { companyLogoObjectKey, storageService } from '../../services/storage/storage.service.js';
import { permissionsService } from '../auth/permissions.service.js';

export type RequestContext = { ipAddress: string | null; userAgent: string | null };

const PRESIGN_TTL = env.MASTER_MEDIA_PRESIGNED_URL_EXPIRY_SECONDS;
const LOGO_URL_TTL = env.MASTER_MEDIA_PRESIGNED_URL_EXPIRY_SECONDS;

const has = (auth: AuthContext, permission: string) =>
  permissionsService.userHasPermission(auth.userId, permission);

function audit(
  auth: AuthContext,
  action: ActivityAction,
  context: RequestContext,
  metadata?: Prisma.InputJsonValue,
): Prisma.ActivityLogUncheckedCreateInput {
  return {
    companyId: auth.companyId,
    actorUserId: auth.userId,
    action,
    entityType: 'Company',
    entityId: auth.companyId,
    ...(metadata === undefined ? {} : { metadata }),
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  };
}

/** Read-only numbering formats surfaced in the settings overview. */
function numberingExamples() {
  const year = new Date().getUTCFullYear();
  const example = (prefix: string) => `${prefix}-${year}-000001`;
  return {
    queryExample: example('QRY'),
    customerExample: example('CUS'),
    quotationExample: example('QT'),
    quotationTemplateExample: example('QTP'),
    bookingExample: example('BK'),
    customerPaymentExample: example('PAY'),
    refundExample: example('REF'),
    vendorExample: example('VEN'),
    vendorPayableExample: example('VP'),
    vendorPaymentExample: example('VPAY'),
    year,
  };
}

async function getCompany(companyId: string) {
  return prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    include: { bankAccount: true },
  });
}

type CompanyWithBank = Awaited<ReturnType<typeof getCompany>>;

/** Signed download URL for the confirmed logo, or undefined. */
async function logoUrl(company: CompanyWithBank): Promise<string | undefined> {
  if (!company.logoObjectKey || !company.logoConfirmedAt) return undefined;
  try {
    return await storageService.createDownloadUrl(company.logoObjectKey, 'logo', LOGO_URL_TTL);
  } catch {
    return undefined;
  }
}

export const settingsService = {
  async get(auth: AuthContext) {
    const company = await getCompany(auth.companyId);
    const canUpdate = await has(auth, PERMISSIONS.SETTINGS_UPDATE);
    const bank = company.bankAccount;
    return {
      profile: {
        name: company.name,
        email: company.email,
        phone: company.phone,
        website: company.website,
        address: company.address,
      },
      branding: {
        primaryColor: company.primaryColor,
        hasLogo: Boolean(company.logoObjectKey && company.logoConfirmedAt),
        logoUrl: await logoUrl(company),
        logoMimeType: company.logoConfirmedAt ? company.logoMimeType : null,
        logoFileSize: company.logoConfirmedAt ? company.logoFileSize : null,
      },
      tax: { taxRegistrationNumber: company.taxRegistrationNumber },
      preferences: { timezone: company.timezone, defaultCurrency: company.defaultCurrency },
      defaultTerms: {
        quotationTerms: company.defaultQuotationTerms,
        bookingTerms: company.defaultBookingTerms,
      },
      bankAccount: bank
        ? {
            exists: true,
            accountHolderName: bank.accountHolderName,
            bankName: bank.bankName,
            branchName: bank.branchName,
            accountNumberLast4: bank.accountNumberLast4,
            accountNumberMasked: maskSensitiveIdentifier(bank.accountNumberLast4),
            ifscCode: bank.ifscCode,
            swiftCode: bank.swiftCode,
            accountType: bank.accountType,
          }
        : { exists: false },
      numbering: numberingExamples(),
      capabilities: {
        canView: await has(auth, PERMISSIONS.SETTINGS_VIEW),
        canUpdate,
      },
    };
  },

  async updateProfile(auth: AuthContext, input: SettingsProfileInput, context: RequestContext) {
    await prisma.$transaction([
      prisma.company.update({
        where: { id: auth.companyId },
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone ?? null,
          website: input.website ?? null,
          address: input.address ?? null,
        },
      }),
      prisma.activityLog.create({
        data: audit(auth, 'COMPANY_PROFILE_UPDATED', context, {
          changedFields: Object.keys(input),
        }),
      }),
    ]);
    return this.get(auth);
  },

  async updateBranding(auth: AuthContext, input: SettingsBrandingInput, context: RequestContext) {
    await prisma.$transaction([
      prisma.company.update({
        where: { id: auth.companyId },
        data: { primaryColor: input.primaryColor },
      }),
      prisma.activityLog.create({ data: audit(auth, 'COMPANY_BRANDING_UPDATED', context) }),
    ]);
    return this.get(auth);
  },

  async updateTax(auth: AuthContext, input: SettingsTaxInput, context: RequestContext) {
    await prisma.$transaction([
      prisma.company.update({
        where: { id: auth.companyId },
        data: { taxRegistrationNumber: input.taxRegistrationNumber ?? null },
      }),
      // Presence only, never the value itself.
      prisma.activityLog.create({
        data: audit(auth, 'COMPANY_TAX_SETTINGS_UPDATED', context, {
          hasTaxRegistration: Boolean(input.taxRegistrationNumber),
        }),
      }),
    ]);
    return this.get(auth);
  },

  async updatePreferences(
    auth: AuthContext,
    input: SettingsPreferencesInput,
    context: RequestContext,
  ) {
    await prisma.$transaction([
      prisma.company.update({
        where: { id: auth.companyId },
        data: { timezone: input.timezone, defaultCurrency: input.defaultCurrency },
      }),
      prisma.activityLog.create({
        data: audit(auth, 'COMPANY_PREFERENCES_UPDATED', context, {
          changedFields: Object.keys(input),
        }),
      }),
    ]);
    return this.get(auth);
  },

  async updateDefaultTerms(
    auth: AuthContext,
    input: SettingsDefaultTermsInput,
    context: RequestContext,
  ) {
    await prisma.$transaction([
      prisma.company.update({
        where: { id: auth.companyId },
        data: {
          defaultQuotationTerms: input.quotationTerms ?? null,
          defaultBookingTerms: input.bookingTerms ?? null,
        },
      }),
      // Never log the raw terms text; only which fields were set.
      prisma.activityLog.create({
        data: audit(auth, 'COMPANY_DEFAULT_TERMS_UPDATED', context, {
          quotationTermsSet: Boolean(input.quotationTerms),
          bookingTermsSet: Boolean(input.bookingTerms),
        }),
      }),
    ]);
    return this.get(auth);
  },

  // --- Bank account --------------------------------------------------------

  async getBankAccount(auth: AuthContext) {
    const bank = await prisma.companyBankAccount.findUnique({
      where: { companyId: auth.companyId },
    });
    if (!bank) return { exists: false };
    return {
      exists: true,
      accountHolderName: bank.accountHolderName,
      bankName: bank.bankName,
      branchName: bank.branchName,
      accountNumberLast4: bank.accountNumberLast4,
      accountNumberMasked: maskSensitiveIdentifier(bank.accountNumberLast4),
      ifscCode: bank.ifscCode,
      swiftCode: bank.swiftCode,
      accountType: bank.accountType,
    };
  },

  async putBankAccount(auth: AuthContext, input: CompanyBankAccountInput, context: RequestContext) {
    if (!env.DATA_ENCRYPTION_KEY)
      throw new ValidationError('Bank-account encryption is not configured.');
    // Defence in depth; the schema already enforces this.
    if (!safeCompare(input.accountNumber, input.confirmAccountNumber))
      throw new ValidationError('Account number and confirmation must match.');
    const compactAccount = input.accountNumber.replace(/\s+/g, '');
    const data = {
      accountHolderName: input.accountHolderName,
      bankName: input.bankName,
      branchName: input.branchName ?? null,
      accountNumberEncrypted: encryptSensitiveValue(
        compactAccount,
        env.DATA_ENCRYPTION_KEY!,
        env.DATA_ENCRYPTION_KEY_VERSION,
      ),
      accountNumberLast4: compactAccount.slice(-4),
      encryptionKeyVersion: env.DATA_ENCRYPTION_KEY_VERSION,
      ifscCode: input.ifscCode ?? null,
      swiftCode: input.swiftCode ?? null,
      accountType: input.accountType ?? null,
      isActive: true,
    };
    await prisma.$transaction([
      prisma.companyBankAccount.upsert({
        where: { companyId: auth.companyId },
        create: { companyId: auth.companyId, ...data },
        update: data,
      }),
      // Never log the account number, encrypted value or key version.
      prisma.activityLog.create({
        data: audit(auth, 'COMPANY_BANK_ACCOUNT_UPDATED', context, {
          bankName: input.bankName,
        }),
      }),
    ]);
    return this.getBankAccount(auth);
  },

  // --- Logo ----------------------------------------------------------------

  async requestLogoUpload(auth: AuthContext, input: LogoUploadRequestInput) {
    const max = env.COMPANY_LOGO_MAX_UPLOAD_SIZE_MB * 1024 * 1024;
    if (input.fileSize > max)
      throw new ValidationError(
        `The logo must be ${env.COMPANY_LOGO_MAX_UPLOAD_SIZE_MB} MB or smaller.`,
      );
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: auth.companyId },
      select: { pendingLogoObjectKey: true },
    });
    const key = companyLogoObjectKey({
      companyId: auth.companyId,
      imageId: randomUUID(),
      fileName: input.fileName,
    });
    const oldPending = company.pendingLogoObjectKey;
    await prisma.company.update({
      where: { id: auth.companyId },
      data: { pendingLogoObjectKey: key },
    });
    // Discard a superseded pending object so it does not orphan.
    if (oldPending && oldPending !== key) await storageService.deleteObject(oldPending);
    return {
      uploadUrl: await storageService.createUploadUrl(
        key,
        input.mimeType,
        input.fileSize,
        PRESIGN_TTL,
      ),
      expiresInSeconds: PRESIGN_TTL,
    };
  },

  async confirmLogo(auth: AuthContext, context: RequestContext) {
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: auth.companyId },
      select: {
        pendingLogoObjectKey: true,
        logoObjectKey: true,
        logoConfirmedAt: true,
      },
    });
    const key = company.pendingLogoObjectKey;
    if (!key) throw new ValidationError('No logo upload is awaiting confirmation.');
    const metadata = await storageService.headObject(key);
    if (!metadata) throw new ValidationError('The uploaded logo could not be found.');
    const previousKey = company.logoObjectKey;
    await prisma.$transaction([
      prisma.company.update({
        where: { id: auth.companyId },
        data: {
          logoObjectKey: key,
          logoBucket: storageService.bucket,
          logoStorageProvider: storageService.provider,
          logoMimeType: metadata.contentType ?? null,
          logoFileSize: metadata.size ?? null,
          logoConfirmedAt: new Date(),
          pendingLogoObjectKey: null,
        },
      }),
      prisma.activityLog.create({ data: audit(auth, 'COMPANY_LOGO_UPDATED', context) }),
    ]);
    // Remove the superseded confirmed object once the new one is live.
    if (previousKey && previousKey !== key) await storageService.deleteObject(previousKey);
    return this.get(auth);
  },

  async getLogoUrl(auth: AuthContext) {
    const company = await getCompany(auth.companyId);
    const url = await logoUrl(company);
    if (!url) throw new ValidationError('No logo is configured.');
    return { url, expiresInSeconds: LOGO_URL_TTL };
  },

  async deleteLogo(auth: AuthContext, context: RequestContext) {
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: auth.companyId },
      select: { logoObjectKey: true, pendingLogoObjectKey: true },
    });
    await prisma.$transaction([
      prisma.company.update({
        where: { id: auth.companyId },
        data: {
          logoObjectKey: null,
          logoBucket: null,
          logoStorageProvider: null,
          logoMimeType: null,
          logoFileSize: null,
          logoConfirmedAt: null,
          pendingLogoObjectKey: null,
        },
      }),
      prisma.activityLog.create({ data: audit(auth, 'COMPANY_LOGO_REMOVED', context) }),
    ]);
    for (const key of [company.logoObjectKey, company.pendingLogoObjectKey])
      if (key) await storageService.deleteObject(key);
    return this.get(auth);
  },
};

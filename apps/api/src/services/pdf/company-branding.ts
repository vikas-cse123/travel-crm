import type PDFDocument from 'pdfkit';
import { prisma } from '../../config/prisma.js';
import { maskSensitiveIdentifier } from '../../utils/crypto.js';
import { storageService } from '../storage/storage.service.js';

/**
 * Company branding used by every customer-facing PDF (Phase 18).
 *
 * The logo bytes are loaded through the storage abstraction and are optional —
 * a missing or unreadable logo never fails PDF generation, the header simply
 * falls back to the company name. The bank summary is masked (last four digits
 * only); the encrypted full account number is never decrypted here.
 */
export interface CompanyBranding {
  name: string;
  email: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  primaryColor: string;
  taxRegistrationNumber: string | null;
  logo: Buffer | null;
  bank: {
    accountHolderName: string;
    bankName: string;
    branchName: string | null;
    ifscCode: string | null;
    accountNumberMasked: string;
  } | null;
}

export async function loadCompanyBranding(
  companyId: string,
  options: { includeBank?: boolean } = {},
): Promise<CompanyBranding> {
  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: {
      name: true,
      email: true,
      phone: true,
      website: true,
      address: true,
      primaryColor: true,
      taxRegistrationNumber: true,
      logoObjectKey: true,
      logoConfirmedAt: true,
      bankAccount: options.includeBank
        ? {
            select: {
              accountHolderName: true,
              bankName: true,
              branchName: true,
              ifscCode: true,
              accountNumberLast4: true,
              isActive: true,
            },
          }
        : false,
    },
  });

  let logo: Buffer | null = null;
  if (company.logoObjectKey && company.logoConfirmedAt) {
    try {
      logo = await storageService.getObject(company.logoObjectKey);
    } catch {
      logo = null; // Never let a logo read failure break the document.
    }
  }

  const bankRow = options.includeBank ? company.bankAccount : null;
  return {
    name: company.name,
    email: company.email,
    phone: company.phone,
    website: company.website,
    address: company.address,
    primaryColor: company.primaryColor,
    taxRegistrationNumber: company.taxRegistrationNumber,
    logo,
    bank:
      bankRow && bankRow.isActive
        ? {
            accountHolderName: bankRow.accountHolderName,
            bankName: bankRow.bankName,
            branchName: bankRow.branchName,
            ifscCode: bankRow.ifscCode,
            accountNumberMasked: maskSensitiveIdentifier(bankRow.accountNumberLast4),
          }
        : null,
  };
}

/**
 * Draw the confirmed logo into a fit box at the top-right of the header band.
 * No-op (returns false) when there is no logo or the bytes cannot be decoded,
 * so the caller's text header remains the fallback.
 */
export function drawHeaderLogo(
  doc: InstanceType<typeof PDFDocument>,
  logo: Buffer | null,
  box: { x: number; y: number; width: number; height: number },
): boolean {
  if (!logo) return false;
  try {
    doc.image(logo, box.x, box.y, { fit: [box.width, box.height], align: 'right', valign: 'top' });
    return true;
  } catch {
    return false;
  }
}

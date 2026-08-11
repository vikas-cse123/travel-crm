import { parse as parseDomain } from 'tldts';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { isReservedHostname, normalizeHostname } from '../../utils/hostname.js';
import { ConflictError, NotFoundError, ValidationError } from '../../utils/errors.js';
import type { AuthContext } from '../../middleware/authenticate.js';
import {
  attachCertificate,
  deleteCertificate,
  describeCertificate,
  detachCertificate,
  isCertificateAttached,
  requestCertificate,
  type AcmValidationRecord,
} from './aws-provisioning.service.js';
import { normalizeDnsTarget, resolveCnameChain } from './dns.service.js';

/**
 * Phase 3 Custom Domain provisioning: create (PENDING + ACM request), Check
 * Again (CNAME + ACM + ALB attach + activate), and disable (detach + DISABLED).
 * No per-customer infrastructure is created — one shared HTTPS listener is
 * reused. AWS/DNS operations are isolated so tests mock them.
 */

const cnameTarget = (): string => normalizeDnsTarget(env.CUSTOM_DOMAIN_CNAME_TARGET);

/** A hostname must have a real registrable domain AND a non-empty subdomain. */
export function isValidSubdomainHostname(hostname: string): boolean {
  const parsed = parseDomain(hostname);
  return Boolean(parsed.domain && parsed.subdomain);
}

/** Customer-safe domain information (never exposes AWS ARNs/internals). */
export interface CustomDomainInfo {
  hostname: string | null;
  status: string;
  cnameTarget: string;
  validationName: string | null;
  validationValue: string | null;
  dnsVerifiedAt: string | null;
  activatedAt: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
}

function toInfo(
  domain: {
    hostname: string;
    status: string;
    certificateValidationName: string | null;
    certificateValidationValue: string | null;
    dnsVerifiedAt: Date | null;
    activatedAt: Date | null;
    lastCheckedAt: Date | null;
    lastError: string | null;
  } | null,
): CustomDomainInfo {
  if (!domain) {
    return {
      hostname: null,
      status: 'NONE',
      cnameTarget: cnameTarget(),
      validationName: null,
      validationValue: null,
      dnsVerifiedAt: null,
      activatedAt: null,
      lastCheckedAt: null,
      lastError: null,
    };
  }
  return {
    hostname: domain.hostname,
    status: domain.status,
    cnameTarget: cnameTarget(),
    validationName: domain.certificateValidationName,
    validationValue: domain.certificateValidationValue,
    dnsVerifiedAt: domain.dnsVerifiedAt?.toISOString() ?? null,
    activatedAt: domain.activatedAt?.toISOString() ?? null,
    lastCheckedAt: domain.lastCheckedAt?.toISOString() ?? null,
    lastError: domain.lastError,
  };
}

const domainSelect = {
  id: true,
  hostname: true,
  status: true,
  certificateArn: true,
  certificateValidationName: true,
  certificateValidationValue: true,
  dnsVerifiedAt: true,
  activatedAt: true,
  lastCheckedAt: true,
  lastError: true,
} as const;

async function findOwned(auth: AuthContext) {
  return prisma.customDomain.findUnique({
    where: { companyId: auth.companyId },
    select: domainSelect,
  });
}

/** GET — return the current safe domain setup, or a "none" shape. */
export async function getCustomDomain(auth: AuthContext): Promise<CustomDomainInfo> {
  return toInfo(await findOwned(auth));
}

/** POST — configure a new PENDING custom domain and request its ACM certificate. */
export async function createCustomDomain(
  auth: AuthContext,
  rawHostname: string,
): Promise<CustomDomainInfo> {
  const normalized = normalizeHostname(rawHostname);
  if (!normalized) throw new ValidationError('Enter a valid hostname.');
  if (isReservedHostname(normalized)) {
    throw new ConflictError('This hostname is reserved by the platform.');
  }
  if (!isValidSubdomainHostname(normalized)) {
    throw new ValidationError('Use a subdomain such as crm.yourcompany.com.');
  }

  const existing = await prisma.customDomain.findUnique({
    where: { companyId: auth.companyId },
    select: { id: true, hostname: true, status: true },
  });
  if (existing && existing.status === 'ACTIVE') {
    throw new ConflictError(
      'An active custom domain is already configured. Disable it before changing domains.',
    );
  }

  // Global hostname uniqueness: no other company may claim the same hostname.
  if (existing?.hostname !== normalized) {
    const clash = await prisma.customDomain.findUnique({ where: { hostname: normalized } });
    if (clash && clash.companyId !== auth.companyId) {
      throw new ConflictError('That hostname is already in use.');
    }
  }

  let certificateArn: string | null = null;
  let validation: AcmValidationRecord | null = null;
  let lastError: string | null = null;
  try {
    certificateArn = await requestCertificate(normalized);
    const described = await describeCertificate(certificateArn);
    if (described.validationRecord?.name && described.validationRecord?.value) {
      validation = described.validationRecord;
    }
  } catch {
    // ACM is unavailable (e.g. not configured): the PENDING record still exists
    // so the customer can retry via Check Again. Keep a safe lastError.
    lastError = 'SSL certificate could not be requested. Try again shortly.';
  }

  const now = new Date();
  if (existing) {
    await prisma.customDomain.update({
      where: { id: existing.id },
      data: {
        hostname: normalized,
        status: 'PENDING',
        certificateArn,
        certificateValidationName: validation?.name ?? null,
        certificateValidationValue: validation?.value ?? null,
        dnsVerifiedAt: null,
        activatedAt: null,
        lastCheckedAt: now,
        lastError,
      },
    });
  } else {
    await prisma.customDomain.create({
      data: {
        companyId: auth.companyId,
        hostname: normalized,
        status: 'PENDING',
        certificateArn,
        certificateValidationName: validation?.name ?? null,
        certificateValidationValue: validation?.value ?? null,
        lastCheckedAt: now,
        lastError,
      },
    });
  }

  return toInfo(await findOwned(auth));
}

/** POST check — verify CNAME, ACM status, attach cert, activate when ready. */
export async function checkCustomDomain(auth: AuthContext): Promise<CustomDomainInfo> {
  const domain = await findOwned(auth);
  if (!domain) throw new NotFoundError('No custom domain is configured.');
  const now = new Date();

  const update = (data: Record<string, unknown>) =>
    prisma.customDomain.update({ where: { id: domain.id }, select: domainSelect, data });

  // 1. Verify the CRM CNAME points to the platform target.
  const targets = await resolveCnameChain(domain.hostname);
  if (!targets.includes(cnameTarget())) {
    await update({
      status: 'PENDING',
      lastCheckedAt: now,
      lastError: 'CNAME record is not configured correctly.',
    });
    return toInfo(await findOwned(auth));
  }

  // 2. Ensure a certificate exists (reuse, never request a duplicate).
  let certificateArn = domain.certificateArn;
  if (!certificateArn) {
    try {
      certificateArn = await requestCertificate(domain.hostname);
    } catch {
      await update({
        status: 'PENDING',
        lastCheckedAt: now,
        lastError: 'SSL certificate could not be requested. Try again shortly.',
      });
      return toInfo(await findOwned(auth));
    }
  }

  const described = await describeCertificate(certificateArn);
  if (described.validationRecord?.name && described.validationRecord?.value) {
    await update({
      certificateArn,
      certificateValidationName: described.validationRecord.name,
      certificateValidationValue: described.validationRecord.value,
    });
  }
  if (described.status === 'PENDING_VALIDATION') {
    await update({
      status: 'PENDING',
      certificateArn,
      lastCheckedAt: now,
      lastError: 'SSL validation is still pending.',
    });
    return toInfo(await findOwned(auth));
  }
  if (described.status === 'FAILED') {
    await update({
      status: 'PENDING',
      certificateArn,
      lastCheckedAt: now,
      lastError: 'SSL certificate validation failed.',
    });
    return toInfo(await findOwned(auth));
  }
  if (described.status !== 'ISSUED') {
    await update({
      status: 'PENDING',
      certificateArn,
      lastCheckedAt: now,
      lastError: `SSL certificate status: ${described.status}.`,
    });
    return toInfo(await findOwned(auth));
  }

  // 3. Attach the issued certificate to the shared HTTPS listener (idempotent).
  const attached = await isCertificateAttached(certificateArn);
  if (!attached) await attachCertificate(certificateArn);

  // 4. Activate — the Phase 1 resolver then recognises the hostname.
  await update({
    status: 'ACTIVE',
    certificateArn,
    dnsVerifiedAt: now,
    activatedAt: now,
    lastCheckedAt: now,
    lastError: null,
  });
  return toInfo(await findOwned(auth));
}

/** POST disable — detach the certificate and mark DISABLED (no deletion). */
export async function disableCustomDomain(auth: AuthContext): Promise<CustomDomainInfo> {
  const domain = await findOwned(auth);
  if (!domain) throw new NotFoundError('No custom domain is configured.');

  if (domain.certificateArn) {
    try {
      await detachCertificate(domain.certificateArn);
    } catch {
      // Detach failure must not prevent disabling; the record is retained.
    }
  }

  await prisma.customDomain.update({
    where: { id: domain.id },
    select: domainSelect,
    data: { status: 'DISABLED', lastCheckedAt: new Date(), lastError: null },
  });
  return toInfo(await findOwned(auth));
}

/** PUT — edit/replace the configured domain: reset to PENDING, request a new
 * certificate for the new hostname and surface the new DNS/SSL records. */
export async function updateCustomDomain(
  auth: AuthContext,
  rawHostname: string,
): Promise<CustomDomainInfo> {
  const normalized = normalizeHostname(rawHostname);
  if (!normalized) throw new ValidationError('Enter a valid hostname.');
  if (isReservedHostname(normalized)) {
    throw new ConflictError('This hostname is reserved by the platform.');
  }
  if (!isValidSubdomainHostname(normalized)) {
    throw new ValidationError('Use a subdomain such as crm.yourcompany.com.');
  }

  const existing = await findOwned(auth);
  if (!existing) throw new NotFoundError('No custom domain is configured.');

  // Global hostname uniqueness: no other company may claim the same hostname.
  if (existing.hostname !== normalized) {
    const clash = await prisma.customDomain.findUnique({ where: { hostname: normalized } });
    if (clash && clash.companyId !== auth.companyId) {
      throw new ConflictError('That hostname is already in use.');
    }
  }

  const changed = existing.hostname !== normalized;
  const now = new Date();
  let certificateArn = existing.certificateArn;
  let validation: AcmValidationRecord | null = null;
  let lastError: string | null = null;

  if (changed && certificateArn) {
    try {
      await detachCertificate(certificateArn);
    } catch {
      // Detach failure must not block replacing the configuration.
    }
    try {
      await deleteCertificate(certificateArn);
    } catch {
      // ACM delete is best-effort (an in-use certificate is simply skipped).
    }
    certificateArn = null;
  }

  try {
    if (!certificateArn) certificateArn = await requestCertificate(normalized);
    const described = await describeCertificate(certificateArn);
    if (described.validationRecord?.name && described.validationRecord?.value) {
      validation = described.validationRecord;
    }
  } catch {
    // ACM is unavailable (e.g. not configured): the PENDING record still exists
    // so the customer can retry via Check Again. Keep a safe lastError.
    lastError = 'SSL certificate could not be requested. Try again shortly.';
  }

  await prisma.customDomain.update({
    where: { id: existing.id },
    data: {
      hostname: normalized,
      status: 'PENDING',
      certificateArn,
      certificateValidationName: validation?.name ?? null,
      certificateValidationValue: validation?.value ?? null,
      dnsVerifiedAt: null,
      activatedAt: null,
      lastCheckedAt: now,
      lastError,
    },
  });
  return toInfo(await findOwned(auth));
}

/** DELETE — remove the custom-domain configuration and its SSL data entirely. */
export async function deleteCustomDomain(auth: AuthContext): Promise<CustomDomainInfo> {
  const domain = await findOwned(auth);
  if (!domain) throw new NotFoundError('No custom domain is configured.');

  if (domain.certificateArn) {
    try {
      await detachCertificate(domain.certificateArn);
    } catch {
      // Detach failure must not block deletion.
    }
    try {
      await deleteCertificate(domain.certificateArn);
    } catch {
      // ACM delete is best-effort (an in-use certificate is simply skipped).
    }
  }

  await prisma.customDomain.delete({ where: { id: domain.id } });
  return toInfo(null);
}

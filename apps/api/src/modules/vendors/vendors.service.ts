import { randomUUID } from 'node:crypto';
import { Prisma, type ActivityAction } from '@prisma/client';
import {
  PERMISSIONS,
  VENDOR_CONTRACT_TYPES,
  VENDOR_PAYMENT_STATUSES,
  VENDOR_PAYMENT_TERMS,
  VENDOR_STATUSES,
  VENDOR_TYPES,
  type VendorBankAccountInput,
  type VendorContactInput,
  type VendorDocumentUpload,
  type VendorInput,
  type VendorNoteInput,
  type VendorPayableInput,
  type VendorPaymentInput,
  type VendorRateInput,
  type VendorServiceInput,
  type VendorUpdateInput,
} from '@interscale/shared';
import type { AuthContext } from '../../middleware/authenticate.js';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { storageService, vendorObjectKey } from '../../services/storage/storage.service.js';
import {
  decryptSensitiveValue,
  encryptSensitiveValue,
  maskSensitiveIdentifier,
} from '../../utils/crypto.js';
import {
  normalizeCustomerName,
  normalizeCustomerPhone,
  normalizeEmail,
} from '../../utils/normalize.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../utils/errors.js';
import { resolvePagination } from '../../utils/pagination.js';
import { permissionsService } from '../auth/permissions.service.js';
import { reminderProcessor } from '../reminders/reminder-processor.service.js';

export type RequestContext = { ipAddress: string | null; userAgent: string | null };
const userSelect = { id: true, fullName: true, username: true } as const;
const decimal = (value: Prisma.Decimal | null | undefined) => value?.toFixed(2) ?? null;
const has = (auth: AuthContext, permission: string) =>
  permissionsService.userHasPermission(auth.userId, permission);

async function serializableTransaction<T>(
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        attempt < 5 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      )
        continue;
      throw error;
    }
  }
  throw new Error('Serializable transaction retry limit reached.');
}

function audit(
  auth: AuthContext,
  action: Prisma.ActivityLogCreateInput['action'],
  entityType: string,
  entityId: string,
  context: RequestContext,
  metadata?: Prisma.InputJsonValue,
): Prisma.ActivityLogUncheckedCreateInput {
  return {
    companyId: auth.companyId,
    actorUserId: auth.userId,
    action,
    entityType,
    entityId,
    ...(metadata === undefined ? {} : { metadata }),
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  };
}

function compact(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

async function visibility(auth: AuthContext): Promise<Prisma.VendorWhereInput> {
  return (await has(auth, PERMISSIONS.VENDORS_VIEW_ALL)) ? {} : { status: 'ACTIVE' };
}

async function visibleWhere(auth: AuthContext, extra: Prisma.VendorWhereInput = {}) {
  return { companyId: auth.companyId, deletedAt: null, AND: [await visibility(auth), extra] };
}

const vendorInclude = {
  createdBy: { select: userSelect },
  assignedTo: { select: userSelect },
  contacts: {
    where: { deletedAt: null },
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
  },
  services: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' as const },
    include: { rates: { where: { deletedAt: null }, orderBy: { effectiveFrom: 'desc' as const } } },
  },
} satisfies Prisma.VendorInclude;

async function getVendor(auth: AuthContext, vendorId: string, include = vendorInclude) {
  const vendor = await prisma.vendor.findFirst({
    where: await visibleWhere(auth, { id: vendorId }),
    include,
  });
  if (!vendor) throw new NotFoundError('Vendor not found.');
  return vendor;
}

async function assertAssignable(auth: AuthContext, assignedToId: string | null | undefined) {
  if (!assignedToId) return;
  const user = await prisma.user.findFirst({
    where: { id: assignedToId, companyId: auth.companyId, status: 'ACTIVE', deletedAt: null },
    select: { id: true },
  });
  if (!user) throw new ValidationError('The assignee must be an active user in this company.');
}

function vendorData(input: VendorInput | VendorUpdateInput) {
  return compact({
    name: input.name,
    normalizedName: input.name ? normalizeCustomerName(input.name) : undefined,
    vendorType: input.vendorType,
    contactPerson: input.contactPerson === '' ? null : input.contactPerson,
    primaryPhone: input.primaryPhone === '' ? null : input.primaryPhone,
    normalizedPhone:
      input.primaryPhone === undefined
        ? undefined
        : normalizeCustomerPhone(input.primaryPhone, env.DEFAULT_VENDOR_COUNTRY),
    primaryEmail: input.primaryEmail === '' ? null : input.primaryEmail,
    normalizedEmail:
      input.primaryEmail === undefined
        ? undefined
        : input.primaryEmail
          ? normalizeEmail(input.primaryEmail)
          : null,
    address: input.address === '' ? null : input.address,
    city: input.city === '' ? null : input.city,
    state: input.state === '' ? null : input.state,
    country: input.country === '' ? null : input.country,
    postalCode: input.postalCode === '' ? null : input.postalCode,
    coverageAreas: input.coverageAreas === '' ? null : input.coverageAreas,
    servicesOffered: input.servicesOffered === '' ? null : input.servicesOffered,
    contractType: input.contractType,
    contractStartDate: input.contractStartDate,
    contractEndDate: input.contractEndDate,
    paymentTerm: input.paymentTerm,
    customPaymentTermDays: input.customPaymentTermDays,
    taxRegistrationNumber: input.taxRegistrationNumber === '' ? null : input.taxRegistrationNumber,
    gstNumber: input.gstNumber === '' ? null : input.gstNumber?.toUpperCase(),
    panNumber: input.panNumber === '' ? null : input.panNumber?.toUpperCase(),
    status: input.status,
    rating: input.rating,
    assignedToId: input.assignedToId,
  });
}

async function nextNumber(
  tx: Prisma.TransactionClient,
  companyId: string,
  kind: 'vendor' | 'payable' | 'payment',
) {
  const year = new Date().getUTCFullYear();
  const create = {
    companyId,
    year,
    vendorValue: kind === 'vendor' ? 1 : 0,
    payableValue: kind === 'payable' ? 1 : 0,
    paymentValue: kind === 'payment' ? 1 : 0,
  };
  const update =
    kind === 'vendor'
      ? { vendorValue: { increment: 1 } }
      : kind === 'payable'
        ? { payableValue: { increment: 1 } }
        : { paymentValue: { increment: 1 } };
  const counter = await tx.vendorCounter.upsert({
    where: { companyId_year: { companyId, year } },
    create,
    update,
    select: { vendorValue: true, payableValue: true, paymentValue: true },
  });
  const value =
    kind === 'vendor'
      ? counter.vendorValue
      : kind === 'payable'
        ? counter.payableValue
        : counter.paymentValue;
  const prefix = kind === 'vendor' ? 'VEN' : kind === 'payable' ? 'VP' : 'VPAY';
  return `${prefix}-${year}-${String(value).padStart(6, '0')}`;
}

function presentVendor(vendor: Record<string, unknown>, financial: boolean) {
  const {
    companyId,
    normalizedName,
    normalizedPhone,
    normalizedEmail,
    deletedAt,
    totalBusiness,
    totalPaid,
    totalOutstanding,
    averageBookingCost,
    services,
    ...safe
  } = vendor;
  void companyId;
  void normalizedName;
  void normalizedPhone;
  void normalizedEmail;
  void deletedAt;
  const presentedServices = Array.isArray(services)
    ? services.map((service) => {
        const { baseCost, sellingReferencePrice, rates, ...serviceSafe } = service as Record<
          string,
          unknown
        >;
        return {
          ...serviceSafe,
          ...(financial
            ? {
                baseCost: decimal(baseCost as Prisma.Decimal),
                sellingReferencePrice: decimal(sellingReferencePrice as Prisma.Decimal),
                rates: Array.isArray(rates)
                  ? rates.map((rate) => {
                      const { amount, ...rateSafe } = rate as Record<string, unknown>;
                      return { ...rateSafe, amount: decimal(amount as Prisma.Decimal) };
                    })
                  : [],
              }
            : {}),
        };
      })
    : undefined;
  return {
    ...safe,
    ...(presentedServices === undefined ? {} : { services: presentedServices }),
    ...(financial
      ? {
          totalBusiness: decimal(totalBusiness as Prisma.Decimal),
          totalPaid: decimal(totalPaid as Prisma.Decimal),
          totalOutstanding: decimal(totalOutstanding as Prisma.Decimal),
          averageBookingCost: decimal(averageBookingCost as Prisma.Decimal),
        }
      : {}),
  };
}

async function duplicates(
  auth: AuthContext,
  input: {
    name?: string;
    city?: string;
    phone?: string;
    email?: string;
    gstNumber?: string;
    panNumber?: string;
    excludeVendorId?: string;
  },
) {
  const phone = normalizeCustomerPhone(input.phone, env.DEFAULT_VENDOR_COUNTRY);
  const email = input.email ? normalizeEmail(input.email) : null;
  const name = input.name ? normalizeCustomerName(input.name) : null;
  const rows = await prisma.vendor.findMany({
    where: {
      companyId: auth.companyId,
      deletedAt: null,
      ...(input.excludeVendorId ? { id: { not: input.excludeVendorId } } : {}),
      OR: [
        ...(phone ? [{ normalizedPhone: phone }] : []),
        ...(email ? [{ normalizedEmail: email }] : []),
        ...(input.gstNumber ? [{ gstNumber: input.gstNumber.toUpperCase() }] : []),
        ...(input.panNumber ? [{ panNumber: input.panNumber.toUpperCase() }] : []),
        ...(name
          ? [
              {
                normalizedName: name,
                ...(input.city
                  ? { city: { equals: input.city, mode: 'insensitive' as const } }
                  : {}),
              },
            ]
          : []),
      ],
    },
    select: {
      id: true,
      vendorCode: true,
      name: true,
      vendorType: true,
      primaryPhone: true,
      primaryEmail: true,
      city: true,
      status: true,
      normalizedPhone: true,
      normalizedEmail: true,
      normalizedName: true,
      gstNumber: true,
      panNumber: true,
    },
    take: 20,
  });
  return rows.map(
    ({ normalizedPhone, normalizedEmail, normalizedName, gstNumber, panNumber, ...row }) => {
      const reasons: string[] = [];
      if (phone && phone === normalizedPhone) reasons.push('PHONE_EXACT');
      if (email && email === normalizedEmail) reasons.push('EMAIL_EXACT');
      if (input.gstNumber && input.gstNumber.toUpperCase() === gstNumber) reasons.push('GST_EXACT');
      if (input.panNumber && input.panNumber.toUpperCase() === panNumber) reasons.push('PAN_EXACT');
      if (
        name &&
        name === normalizedName &&
        (!input.city || input.city.toLowerCase() === row.city?.toLowerCase())
      )
        reasons.push('NAME_CITY_EXACT');
      return { ...row, reasons, strongMatch: reasons.length > 0 };
    },
  );
}

export async function recalculateVendor(
  tx: Prisma.TransactionClient,
  companyId: string,
  vendorId: string,
) {
  const [payables, services] = await Promise.all([
    tx.vendorPayable.findMany({
      where: {
        companyId,
        vendorId,
        deletedAt: null,
        paymentStatus: { notIn: ['CANCELLED', 'REFUNDED'] },
      },
      select: { bookingId: true, originalAmount: true, paidAmount: true, outstandingAmount: true },
    }),
    tx.bookingService.findMany({
      where: {
        companyId,
        vendorId,
        deletedAt: null,
        confirmationStatus: { notIn: ['CANCELLED', 'FAILED'] },
      },
      select: { bookingId: true, confirmationStatus: true },
    }),
  ]);
  const sum = (key: 'originalAmount' | 'paidAmount' | 'outstandingAmount') =>
    payables.reduce((total, row) => total.add(row[key]), new Prisma.Decimal(0));
  const bookingIds = new Set([
    ...payables.map((r) => r.bookingId),
    ...services.map((r) => r.bookingId),
  ]);
  const totalBusiness = sum('originalAmount');
  const totalBookings = bookingIds.size;
  const eligible = services.length;
  const confirmed = services.filter((row) => row.confirmationStatus === 'CONFIRMED').length;
  await tx.vendor.update({
    where: { id: vendorId },
    data: {
      totalBookings,
      totalBusiness,
      totalPaid: sum('paidAmount'),
      totalOutstanding: sum('outstandingAmount'),
      averageBookingCost: totalBookings ? totalBusiness.div(totalBookings) : new Prisma.Decimal(0),
      confirmationRate: eligible
        ? new Prisma.Decimal(confirmed).div(eligible).mul(100)
        : new Prisma.Decimal(0),
    },
  });
}

async function updatePayableStatus(
  tx: Prisma.TransactionClient,
  payableId: string,
  reference = new Date(),
) {
  const payable = await tx.vendorPayable.findUniqueOrThrow({
    where: { id: payableId },
    include: {
      allocations: {
        where: {
          vendorPayment: { reversedAt: null, paymentStatus: { in: ['RECEIVED', 'CLEARED'] } },
        },
        include: { vendorPayment: true },
      },
    },
  });
  const paid = payable.allocations.reduce((sum, row) => sum.add(row.amount), new Prisma.Decimal(0));
  const outstanding = Prisma.Decimal.max(new Prisma.Decimal(0), payable.originalAmount.sub(paid));
  const status = outstanding.isZero()
    ? 'PAID'
    : paid.gt(0)
      ? 'PARTIALLY_PAID'
      : payable.dueDate && payable.dueDate < reference
        ? 'OVERDUE'
        : 'UNPAID';
  await tx.vendorPayable.update({
    where: { id: payableId },
    data: { paidAmount: paid, outstandingAmount: outstanding, paymentStatus: status },
  });
}

export const vendorsService = {
  duplicates,
  async list(auth: AuthContext, query: Record<string, unknown>) {
    const pagination = resolvePagination({
      page: Number(query.page) || undefined,
      pageSize: Number(query.pageSize) || undefined,
    });
    const financial = await has(auth, PERMISSIONS.VENDORS_VIEW_FINANCIALS);
    if ((query.paymentStatus || query.hasOutstanding !== undefined) && !financial)
      throw new ForbiddenError('Vendor financial filters require financial access.');
    const search = typeof query.search === 'string' ? query.search : '';
    const where = await visibleWhere(auth, {
      ...(query.vendorType
        ? { vendorType: String(query.vendorType) as Prisma.EnumVendorTypeFilter }
        : {}),
      ...(query.status ? { status: String(query.status) as Prisma.EnumVendorStatusFilter } : {}),
      ...(query.contractType
        ? { contractType: String(query.contractType) as Prisma.EnumVendorContractTypeFilter }
        : {}),
      ...(query.paymentTerm
        ? { paymentTerm: String(query.paymentTerm) as Prisma.EnumVendorPaymentTermFilter }
        : {}),
      ...(query.coverageArea
        ? { coverageAreas: { contains: String(query.coverageArea), mode: 'insensitive' } }
        : {}),
      ...(query.ratingMin ? { rating: { gte: Number(query.ratingMin) } } : {}),
      ...(query.hasOutstanding !== undefined
        ? { totalOutstanding: query.hasOutstanding ? { gt: 0 } : { equals: 0 } }
        : {}),
      ...(query.paymentStatus
        ? {
            payables: {
              some: { paymentStatus: String(query.paymentStatus) as 'UNPAID', deletedAt: null },
            },
          }
        : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            createdAt: {
              ...(query.createdFrom ? { gte: new Date(String(query.createdFrom)) } : {}),
              ...(query.createdTo ? { lte: new Date(String(query.createdTo)) } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { vendorCode: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
              { contactPerson: { contains: search, mode: 'insensitive' } },
              { primaryPhone: { contains: search } },
              { primaryEmail: { contains: search, mode: 'insensitive' } },
              { city: { contains: search, mode: 'insensitive' } },
              { coverageAreas: { contains: search, mode: 'insensitive' } },
              {
                services: {
                  some: { name: { contains: search, mode: 'insensitive' }, deletedAt: null },
                },
              },
            ],
          }
        : {}),
    });
    const allowed = [
      'vendorCode',
      'name',
      'vendorType',
      'totalBookings',
      'totalBusiness',
      'totalPaid',
      'totalOutstanding',
      'rating',
      'confirmationRate',
      'createdAt',
      'updatedAt',
    ];
    const sortBy = allowed.includes(String(query.sortBy)) ? String(query.sortBy) : 'createdAt';
    const [rows, total] = await Promise.all([
      prisma.vendor.findMany({
        where,
        include: {
          createdBy: { select: userSelect },
          services: {
            where: { deletedAt: null },
            select: { id: true, name: true, serviceType: true, status: true },
          },
          payables: { where: { deletedAt: null }, select: { paymentStatus: true } },
        },
        orderBy: { [sortBy]: query.sortOrder === 'asc' ? 'asc' : 'desc' },
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
      }),
      prisma.vendor.count({ where }),
    ]);
    return {
      data: rows.map((row) => presentVendor(row as unknown as Record<string, unknown>, financial)),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pagination.pageSize)),
      },
    };
  },
  async analytics(auth: AuthContext) {
    const financial = await has(auth, PERMISSIONS.VENDORS_VIEW_FINANCIALS);
    const where = await visibleWhere(auth);
    const [total, active, groups, avg, withoutServices, expiring] = await Promise.all([
      prisma.vendor.count({ where }),
      prisma.vendor.count({ where: { ...where, status: 'ACTIVE' } }),
      prisma.vendor.groupBy({ by: ['vendorType'], where, _count: true }),
      prisma.vendor.aggregate({ where, _avg: { rating: true, confirmationRate: true } }),
      prisma.vendor.count({
        where: { ...where, services: { none: { deletedAt: null, status: 'ACTIVE' } } },
      }),
      prisma.vendor.count({
        where: {
          ...where,
          contractEndDate: {
            gte: new Date(),
            lte: new Date(Date.now() + env.VENDOR_CONTRACT_EXPIRY_WARNING_DAYS * 86400000),
          },
        },
      }),
    ]);
    const distribution = Object.fromEntries(
      VENDOR_TYPES.map((type) => [type, groups.find((g) => g.vendorType === type)?._count ?? 0]),
    );
    if (!financial)
      return {
        total,
        active,
        averageRating: decimal(avg._avg.rating),
        averageConfirmationRate: decimal(avg._avg.confirmationRate),
        distribution,
        withoutServices,
        expiringContracts: expiring,
      };
    const sums = await prisma.vendor.aggregate({
      where,
      _sum: { totalBusiness: true, totalPaid: true, totalOutstanding: true, totalBookings: true },
      _avg: { averageBookingCost: true },
    });
    const payableGroups = await prisma.vendorPayable.groupBy({
      by: ['paymentStatus'],
      where: { companyId: auth.companyId, deletedAt: null },
      _count: true,
    });
    return {
      total,
      active,
      averageRating: decimal(avg._avg.rating),
      averageConfirmationRate: decimal(avg._avg.confirmationRate),
      distribution,
      withoutServices,
      expiringContracts: expiring,
      totalVendorCosts: decimal(sums._sum.totalBusiness),
      totalBusiness: decimal(sums._sum.totalBusiness),
      totalPaid: decimal(sums._sum.totalPaid),
      totalOutstanding: decimal(sums._sum.totalOutstanding),
      totalBookings: sums._sum.totalBookings ?? 0,
      averageBookingCost: decimal(sums._avg.averageBookingCost),
      paymentDistribution: Object.fromEntries(
        VENDOR_PAYMENT_STATUSES.map((status) => [
          status,
          payableGroups.find((g) => g.paymentStatus === status)?._count ?? 0,
        ]),
      ),
    };
  },
  async lookups(auth: AuthContext) {
    const users = await prisma.user.findMany({
      where: { companyId: auth.companyId, status: 'ACTIVE', deletedAt: null },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
    return {
      vendorTypes: VENDOR_TYPES,
      statuses: VENDOR_STATUSES,
      contractTypes: VENDOR_CONTRACT_TYPES,
      paymentTerms: VENDOR_PAYMENT_TERMS,
      paymentStatuses: VENDOR_PAYMENT_STATUSES,
      users,
    };
  },
  async create(auth: AuthContext, input: VendorInput, context: RequestContext) {
    await assertAssignable(auth, input.assignedToId);
    const matches = await duplicates(
      auth,
      compact({
        name: input.name,
        city: input.city,
        phone: input.primaryPhone,
        email: input.primaryEmail,
        gstNumber: input.gstNumber,
        panNumber: input.panNumber,
      }),
    );
    if (matches.length && !input.createAnyway)
      throw new ConflictError(
        'Possible duplicate vendor found. Review the matches and explicitly create anyway.',
      );
    const created = await serializableTransaction(async (tx) => {
      const vendor = await tx.vendor.create({
        data: {
          ...(vendorData(input) as Prisma.VendorUncheckedCreateInput),
          companyId: auth.companyId,
          vendorCode: await nextNumber(tx, auth.companyId, 'vendor'),
          createdById: auth.userId,
        },
        include: vendorInclude,
      });
      await tx.activityLog.create({
        data: audit(auth, 'VENDOR_CREATED', 'Vendor', vendor.id, context, {
          vendorCode: vendor.vendorCode,
          vendorType: vendor.vendorType,
        }),
      });
      return presentVendor(
        vendor as unknown as Record<string, unknown>,
        await has(auth, PERMISSIONS.VENDORS_VIEW_FINANCIALS),
      );
    });
    reminderProcessor.scheduleEvent(auth.companyId, ['VENDOR_CONTRACT']);
    return created;
  },
  async details(auth: AuthContext, vendorId: string) {
    const financial = await has(auth, PERMISSIONS.VENDORS_VIEW_FINANCIALS);
    const vendor = await getVendor(auth, vendorId);
    const [recentBookingServices, recentPayments, documents, notes, bankAccounts] =
      await Promise.all([
        prisma.bookingService.findMany({
          where: { companyId: auth.companyId, vendorId, deletedAt: null },
          select: {
            id: true,
            serviceType: true,
            name: true,
            serviceDate: true,
            startDate: true,
            internalCostSnapshot: true,
            confirmationStatus: true,
            supplierConfirmationNumber: true,
            createdAt: true,
            booking: { select: { id: true, bookingNumber: true } },
            vendorPayables: {
              where: { deletedAt: null },
              select: { paidAmount: true, outstandingAmount: true, paymentStatus: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        financial
          ? prisma.vendorPayment.findMany({
              where: { companyId: auth.companyId, vendorId },
              include: {
                allocations: {
                  include: {
                    vendorPayable: {
                      select: {
                        payableNumber: true,
                        booking: { select: { id: true, bookingNumber: true } },
                      },
                    },
                  },
                },
              },
              orderBy: { paidAt: 'desc' },
              take: 10,
            })
          : Promise.resolve([]),
        prisma.vendorDocument.findMany({
          where: { companyId: auth.companyId, vendorId, deletedAt: null },
          select: {
            id: true,
            documentType: true,
            fileName: true,
            mimeType: true,
            fileSize: true,
            uploadStatus: true,
            expiresAt: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.vendorNote.findMany({
          where: {
            companyId: auth.companyId,
            vendorId,
            deletedAt: null,
            ...(financial ? {} : { noteType: { not: 'PAYMENT' as const } }),
          },
          include: { author: { select: userSelect } },
          orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        }),
        financial
          ? prisma.vendorBankAccount.findMany({
              where: { companyId: auth.companyId, vendorId, deletedAt: null },
              orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            })
          : Promise.resolve([]),
      ]);
    return {
      ...presentVendor(vendor as unknown as Record<string, unknown>, financial),
      recentBookingServices: recentBookingServices.map((row) => ({
        ...row,
        internalCostSnapshot: financial ? decimal(row.internalCostSnapshot) : undefined,
        vendorPayables: financial
          ? row.vendorPayables.map((p) => ({
              ...p,
              paidAmount: decimal(p.paidAmount),
              outstandingAmount: decimal(p.outstandingAmount),
            }))
          : undefined,
      })),
      recentPayments: financial
        ? recentPayments.map((p) => ({
            ...p,
            amount: decimal(p.amount),
            allocations: p.allocations.map((a) => ({ ...a, amount: decimal(a.amount) })),
          }))
        : undefined,
      documents,
      notes,
      bankAccounts: financial
        ? bankAccounts.map(({ accountNumberEncrypted, companyId, ...row }) => {
            void accountNumberEncrypted;
            void companyId;
            return { ...row, accountNumber: maskSensitiveIdentifier(row.accountNumberLast4) };
          })
        : undefined,
    };
  },
  async update(
    auth: AuthContext,
    vendorId: string,
    input: VendorUpdateInput,
    context: RequestContext,
  ) {
    await getVendor(auth, vendorId);
    await assertAssignable(auth, input.assignedToId);
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.vendor.update({
        where: { id: vendorId },
        data: vendorData(input),
        include: vendorInclude,
      });
      await tx.activityLog.create({
        data: audit(auth, 'VENDOR_UPDATED', 'Vendor', vendorId, context),
      });
      return updated;
    });
    return presentVendor(
      row as unknown as Record<string, unknown>,
      await has(auth, PERMISSIONS.VENDORS_VIEW_FINANCIALS),
    );
  },
  async status(
    auth: AuthContext,
    vendorId: string,
    status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED',
    context: RequestContext,
  ) {
    const vendor = await getVendor(auth, vendorId);
    if (
      status === 'ARCHIVED' &&
      vendor.totalOutstanding.gt(0) &&
      !(await has(auth, PERMISSIONS.VENDORS_MANAGE_PAYMENTS))
    )
      throw new ForbiddenError(
        'Archiving a vendor with outstanding payables requires payment-management access.',
      );
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.vendor.update({
        where: { id: vendorId },
        data: { status },
      });
      await tx.activityLog.create({
        data: audit(
          auth,
          status === 'ARCHIVED' ? 'VENDOR_ARCHIVED' : 'VENDOR_STATUS_CHANGED',
          'Vendor',
          vendorId,
          context,
          { from: vendor.status, to: status },
        ),
      });
      return updated;
    });
    return { id: row.id, status: row.status };
  },
  archive(auth: AuthContext, vendorId: string, context: RequestContext) {
    return this.status(auth, vendorId, 'ARCHIVED', context);
  },
  async rating(auth: AuthContext, vendorId: string, rating: number, context: RequestContext) {
    await getVendor(auth, vendorId);
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.vendor.update({ where: { id: vendorId }, data: { rating } });
      await tx.activityLog.create({
        data: audit(auth, 'VENDOR_RATING_UPDATED', 'Vendor', vendorId, context, { rating }),
      });
      return updated;
    });
    return { id: row.id, rating: decimal(row.rating) };
  },

  async contacts(auth: AuthContext, vendorId: string) {
    await getVendor(auth, vendorId);
    return prisma.vendorContact.findMany({
      where: { companyId: auth.companyId, vendorId, deletedAt: null },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  },
  async createContact(
    auth: AuthContext,
    vendorId: string,
    input: VendorContactInput,
    context: RequestContext,
  ) {
    await getVendor(auth, vendorId);
    return prisma.$transaction(async (tx) => {
      if (input.isPrimary)
        await tx.vendorContact.updateMany({
          where: { companyId: auth.companyId, vendorId, deletedAt: null },
          data: { isPrimary: false },
        });
      const row = await tx.vendorContact.create({
        data: compact({
          ...input,
          email: input.email || null,
          normalizedEmail: input.email ? normalizeEmail(input.email) : null,
          normalizedPhone: normalizeCustomerPhone(input.phone, env.DEFAULT_VENDOR_COUNTRY),
          companyId: auth.companyId,
          vendorId,
        }) as Prisma.VendorContactUncheckedCreateInput,
      });
      await tx.activityLog.create({
        data: audit(auth, 'VENDOR_CONTACT_CREATED', 'Vendor', vendorId, context, {
          contactId: row.id,
        }),
      });
      return row;
    });
  },
  async updateContact(
    auth: AuthContext,
    vendorId: string,
    contactId: string,
    input: Partial<VendorContactInput>,
    context: RequestContext,
  ) {
    await getVendor(auth, vendorId);
    const contact = await prisma.vendorContact.findFirst({
      where: { id: contactId, companyId: auth.companyId, vendorId, deletedAt: null },
    });
    if (!contact) throw new NotFoundError('Vendor contact not found.');
    return prisma.$transaction(async (tx) => {
      if (input.isPrimary)
        await tx.vendorContact.updateMany({
          where: { companyId: auth.companyId, vendorId, id: { not: contactId }, deletedAt: null },
          data: { isPrimary: false },
        });
      const row = await tx.vendorContact.update({
        where: { id: contactId },
        data: compact({
          ...input,
          ...(input.email !== undefined
            ? {
                email: input.email || null,
                normalizedEmail: input.email ? normalizeEmail(input.email) : null,
              }
            : {}),
          ...(input.phone !== undefined
            ? { normalizedPhone: normalizeCustomerPhone(input.phone, env.DEFAULT_VENDOR_COUNTRY) }
            : {}),
        }) as Prisma.VendorContactUncheckedUpdateInput,
      });
      await tx.activityLog.create({
        data: audit(auth, 'VENDOR_CONTACT_UPDATED', 'Vendor', vendorId, context, { contactId }),
      });
      return row;
    });
  },
  async deleteContact(auth: AuthContext, vendorId: string, contactId: string) {
    await getVendor(auth, vendorId);
    const result = await prisma.vendorContact.updateMany({
      where: { id: contactId, companyId: auth.companyId, vendorId, deletedAt: null },
      data: { deletedAt: new Date(), isPrimary: false },
    });
    if (!result.count) throw new NotFoundError('Vendor contact not found.');
    return { id: contactId, deleted: true };
  },

  async services(auth: AuthContext, vendorId: string) {
    await getVendor(auth, vendorId);
    const financial = await has(auth, PERMISSIONS.VENDORS_VIEW_FINANCIALS);
    const rows = await prisma.vendorService.findMany({
      where: { companyId: auth.companyId, vendorId, deletedAt: null },
      include: { rates: { where: { deletedAt: null }, orderBy: { effectiveFrom: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      ...row,
      baseCost: financial ? decimal(row.baseCost) : undefined,
      sellingReferencePrice: financial ? decimal(row.sellingReferencePrice) : undefined,
      rates: financial
        ? row.rates.map((r) => ({
            ...r,
            netRate: decimal(r.netRate),
            taxAmount: decimal(r.taxAmount),
            commissionAmount: decimal(r.commissionAmount),
          }))
        : [],
    }));
  },
  async service(auth: AuthContext, vendorId: string, serviceId: string) {
    await getVendor(auth, vendorId);
    const row = await prisma.vendorService.findFirst({
      where: { id: serviceId, companyId: auth.companyId, vendorId, deletedAt: null },
      include: { rates: { where: { deletedAt: null } } },
    });
    if (!row) throw new NotFoundError('Vendor service not found.');
    return row;
  },
  async createService(
    auth: AuthContext,
    vendorId: string,
    input: VendorServiceInput,
    context: RequestContext,
  ) {
    await getVendor(auth, vendorId);
    const row = await prisma.$transaction(async (tx) => {
      const service = await tx.vendorService.create({
        data: {
          ...(input as Prisma.VendorServiceUncheckedCreateInput),
          companyId: auth.companyId,
          vendorId,
          createdById: auth.userId,
        },
      });
      await tx.activityLog.create({
        data: audit(auth, 'VENDOR_SERVICE_CREATED', 'VendorService', service.id, context, {
          vendorId,
          serviceType: service.serviceType,
        }),
      });
      return service;
    });
    return row;
  },
  async updateService(
    auth: AuthContext,
    vendorId: string,
    serviceId: string,
    input: Partial<VendorServiceInput>,
    context: RequestContext,
  ) {
    await this.service(auth, vendorId, serviceId);
    return prisma.$transaction(async (tx) => {
      const row = await tx.vendorService.update({
        where: { id: serviceId },
        data: compact(input) as Prisma.VendorServiceUncheckedUpdateInput,
      });
      await tx.activityLog.create({
        data: audit(auth, 'VENDOR_SERVICE_UPDATED', 'VendorService', serviceId, context, {
          vendorId,
        }),
      });
      return row;
    });
  },
  async serviceStatus(
    auth: AuthContext,
    vendorId: string,
    serviceId: string,
    status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED',
    context: RequestContext,
  ) {
    await this.service(auth, vendorId, serviceId);
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.vendorService.update({
        where: { id: serviceId },
        data: { status, ...(status === 'ARCHIVED' ? { deletedAt: new Date() } : {}) },
      });
      await tx.activityLog.create({
        data: audit(
          auth,
          status === 'ARCHIVED' ? 'VENDOR_SERVICE_ARCHIVED' : 'VENDOR_SERVICE_UPDATED',
          'VendorService',
          serviceId,
          context,
          { vendorId, status },
        ),
      });
      return updated;
    });
    return { id: row.id, status: row.status };
  },
  deleteService(auth: AuthContext, vendorId: string, serviceId: string, context: RequestContext) {
    return this.serviceStatus(auth, vendorId, serviceId, 'ARCHIVED', context);
  },
  async rates(auth: AuthContext, vendorId: string, serviceId: string) {
    await this.service(auth, vendorId, serviceId);
    if (!(await has(auth, PERMISSIONS.VENDORS_VIEW_FINANCIALS)))
      throw new ForbiddenError('Vendor rates require financial access.');
    return prisma.vendorRate.findMany({
      where: { companyId: auth.companyId, vendorServiceId: serviceId, deletedAt: null },
      orderBy: { effectiveFrom: 'desc' },
    });
  },
  async createRate(
    auth: AuthContext,
    vendorId: string,
    serviceId: string,
    input: VendorRateInput,
    context: RequestContext,
  ) {
    await this.service(auth, vendorId, serviceId);
    return prisma.$transaction(async (tx) => {
      const row = await tx.vendorRate.create({
        data: {
          ...(input as Prisma.VendorRateUncheckedCreateInput),
          companyId: auth.companyId,
          vendorServiceId: serviceId,
        },
      });
      await tx.activityLog.create({
        data: audit(auth, 'VENDOR_RATE_CREATED', 'VendorService', serviceId, context, {
          vendorId,
          rateId: row.id,
        }),
      });
      return row;
    });
  },
  async updateRate(
    auth: AuthContext,
    vendorId: string,
    serviceId: string,
    rateId: string,
    input: Partial<VendorRateInput>,
    context: RequestContext,
  ) {
    await this.service(auth, vendorId, serviceId);
    const existing = await prisma.vendorRate.findFirst({
      where: { id: rateId, companyId: auth.companyId, vendorServiceId: serviceId, deletedAt: null },
    });
    if (!existing) throw new NotFoundError('Vendor rate not found.');
    return prisma.$transaction(async (tx) => {
      const row = await tx.vendorRate.update({
        where: { id: rateId },
        data: compact(input) as Prisma.VendorRateUncheckedUpdateInput,
      });
      await tx.activityLog.create({
        data: audit(auth, 'VENDOR_RATE_UPDATED', 'VendorService', serviceId, context, {
          vendorId,
          rateId,
        }),
      });
      return row;
    });
  },
  async deleteRate(auth: AuthContext, vendorId: string, serviceId: string, rateId: string) {
    await this.service(auth, vendorId, serviceId);
    const result = await prisma.vendorRate.updateMany({
      where: { id: rateId, companyId: auth.companyId, vendorServiceId: serviceId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (!result.count) throw new NotFoundError('Vendor rate not found.');
    return { id: rateId, deleted: true };
  },

  async payables(auth: AuthContext, vendorId: string) {
    await getVendor(auth, vendorId);
    return prisma.vendorPayable.findMany({
      where: { companyId: auth.companyId, vendorId, deletedAt: null },
      include: {
        booking: { select: { id: true, bookingNumber: true } },
        bookingService: { select: { id: true, name: true, serviceType: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },
  async createPayable(
    auth: AuthContext,
    vendorId: string,
    input: VendorPayableInput,
    context: RequestContext,
  ) {
    await getVendor(auth, vendorId);
    const booking = await prisma.booking.findFirst({
      where: { id: input.bookingId, companyId: auth.companyId, deletedAt: null },
      select: { id: true },
    });
    if (!booking) throw new ValidationError('Booking not found in this company.');
    if (input.bookingServiceId) {
      const service = await prisma.bookingService.findFirst({
        where: {
          id: input.bookingServiceId,
          companyId: auth.companyId,
          bookingId: input.bookingId,
          vendorId,
          deletedAt: null,
        },
      });
      if (!service) throw new ValidationError('Booking service is not linked to this vendor.');
    }
    if (input.bookingCostId) {
      const cost = await prisma.bookingCost.findFirst({
        where: {
          id: input.bookingCostId,
          companyId: auth.companyId,
          bookingId: input.bookingId,
          deletedAt: null,
        },
      });
      if (!cost) throw new ValidationError('Booking cost not found in this company.');
    }
    const created = await serializableTransaction(async (tx) => {
      const row = await tx.vendorPayable.create({
        data: compact({
          ...input,
          companyId: auth.companyId,
          vendorId,
          payableNumber: await nextNumber(tx, auth.companyId, 'payable'),
          paidAmount: 0,
          outstandingAmount: input.originalAmount,
          createdById: auth.userId,
        }) as Prisma.VendorPayableUncheckedCreateInput,
      });
      if (input.bookingCostId)
        await tx.bookingCost.update({
          where: { id: input.bookingCostId },
          data: { vendorId, costStatus: 'PAYABLE' },
        });
      await recalculateVendor(tx, auth.companyId, vendorId);
      await tx.activityLog.create({
        data: audit(auth, 'VENDOR_PAYABLE_CREATED', 'VendorPayable', row.id, context, {
          vendorId,
          bookingId: input.bookingId,
          payableNumber: row.payableNumber,
        }),
      });
      return row;
    });
    reminderProcessor.scheduleEvent(auth.companyId, ['VENDOR_PAYABLE']);
    return created;
  },
  async updatePayable(
    auth: AuthContext,
    vendorId: string,
    payableId: string,
    input: Partial<VendorPayableInput>,
    context: RequestContext,
  ) {
    await getVendor(auth, vendorId);
    const row = await prisma.vendorPayable.findFirst({
      where: { id: payableId, companyId: auth.companyId, vendorId, deletedAt: null },
    });
    if (!row) throw new NotFoundError('Vendor payable not found.');
    if (
      input.originalAmount !== undefined &&
      new Prisma.Decimal(input.originalAmount).lt(row.paidAmount)
    )
      throw new ValidationError('Original amount cannot be below the amount already paid.');
    return prisma.$transaction(async (tx) => {
      const updated = await tx.vendorPayable.update({
        where: { id: payableId },
        data: compact(input) as Prisma.VendorPayableUncheckedUpdateInput,
      });
      await updatePayableStatus(tx, payableId);
      await recalculateVendor(tx, auth.companyId, vendorId);
      await tx.activityLog.create({
        data: audit(auth, 'VENDOR_PAYABLE_UPDATED', 'VendorPayable', payableId, context, {
          vendorId,
        }),
      });
      return updated;
    });
  },
  async deletePayable(auth: AuthContext, vendorId: string, payableId: string) {
    await getVendor(auth, vendorId);
    const row = await prisma.vendorPayable.findFirst({
      where: { id: payableId, companyId: auth.companyId, vendorId, deletedAt: null },
    });
    if (!row) throw new NotFoundError('Vendor payable not found.');
    if (row.paidAmount.gt(0))
      throw new ConflictError('A payable with payment history cannot be deleted.');
    await prisma.$transaction(async (tx) => {
      await tx.vendorPayable.update({
        where: { id: payableId },
        data: { deletedAt: new Date(), paymentStatus: 'CANCELLED' },
      });
      await recalculateVendor(tx, auth.companyId, vendorId);
    });
    return { id: payableId, deleted: true };
  },

  async payments(auth: AuthContext, vendorId: string) {
    await getVendor(auth, vendorId);
    return prisma.vendorPayment.findMany({
      where: { companyId: auth.companyId, vendorId },
      include: {
        allocations: {
          include: {
            vendorPayable: { select: { id: true, payableNumber: true, description: true } },
          },
        },
        recordedBy: { select: userSelect },
        reversedBy: { select: userSelect },
      },
      orderBy: { paidAt: 'desc' },
    });
  },
  async payment(auth: AuthContext, vendorId: string, paymentId: string) {
    await getVendor(auth, vendorId);
    const row = await prisma.vendorPayment.findFirst({
      where: { id: paymentId, companyId: auth.companyId, vendorId },
      include: {
        allocations: { include: { vendorPayable: true } },
        recordedBy: { select: userSelect },
        reversedBy: { select: userSelect },
      },
    });
    if (!row) throw new NotFoundError('Vendor payment not found.');
    return row;
  },
  async createPayment(
    auth: AuthContext,
    vendorId: string,
    input: VendorPaymentInput,
    context: RequestContext,
  ) {
    await getVendor(auth, vendorId);
    const allocationTotal = input.allocations.reduce(
      (sum, row) => sum.add(row.amount),
      new Prisma.Decimal(0),
    );
    if (!allocationTotal.eq(input.amount))
      throw new ValidationError('Allocations must equal the payment amount.');
    return serializableTransaction(async (tx) => {
      const ids = input.allocations.map((row) => row.payableId);
      const payables = await tx.vendorPayable.findMany({
        where: { id: { in: ids }, companyId: auth.companyId, vendorId, deletedAt: null },
      });
      if (payables.length !== ids.length)
        throw new ValidationError('Every payable must belong to this vendor.');
      for (const allocation of input.allocations) {
        const payable = payables.find((p) => p.id === allocation.payableId)!;
        if (new Prisma.Decimal(allocation.amount).gt(payable.outstandingAmount))
          throw new ValidationError(
            `Allocation exceeds outstanding amount for ${payable.payableNumber}.`,
          );
        if (payable.currency !== input.currency)
          throw new ValidationError('Payment and payable currencies must match.');
      }
      const payment = await tx.vendorPayment.create({
        data: compact({
          amount: input.amount,
          currency: input.currency,
          paymentMethod: input.paymentMethod,
          paidAt: input.paidAt,
          referenceNumber: input.referenceNumber,
          bankName: input.bankName,
          notes: input.notes,
          paymentStatus: 'CLEARED',
          companyId: auth.companyId,
          vendorId,
          paymentNumber: await nextNumber(tx, auth.companyId, 'payment'),
          recordedById: auth.userId,
        }) as Prisma.VendorPaymentUncheckedCreateInput,
      });
      await tx.vendorPaymentAllocation.createMany({
        data: input.allocations.map((a) => ({
          companyId: auth.companyId,
          vendorPaymentId: payment.id,
          vendorPayableId: a.payableId,
          amount: a.amount,
        })),
      });
      for (const id of ids) await updatePayableStatus(tx, id);
      await recalculateVendor(tx, auth.companyId, vendorId);
      await tx.activityLog.create({
        data: audit(auth, 'VENDOR_PAYMENT_RECORDED', 'VendorPayment', payment.id, context, {
          vendorId,
          paymentNumber: payment.paymentNumber,
          payableCount: ids.length,
        }),
      });
      return payment;
    });
  },
  async reversePayment(
    auth: AuthContext,
    vendorId: string,
    paymentId: string,
    reason: string,
    context: RequestContext,
  ) {
    await getVendor(auth, vendorId);
    return serializableTransaction(async (tx) => {
      const payment = await tx.vendorPayment.findFirst({
        where: { id: paymentId, companyId: auth.companyId, vendorId },
        include: { allocations: true },
      });
      if (!payment) throw new NotFoundError('Vendor payment not found.');
      if (payment.reversedAt) throw new ConflictError('Vendor payment is already reversed.');
      const row = await tx.vendorPayment.update({
        where: { id: paymentId },
        data: {
          paymentStatus: 'REVERSED',
          reversedAt: new Date(),
          reversedById: auth.userId,
          reversalReason: reason,
        },
      });
      for (const allocation of payment.allocations)
        await updatePayableStatus(tx, allocation.vendorPayableId);
      await recalculateVendor(tx, auth.companyId, vendorId);
      await tx.activityLog.create({
        data: audit(auth, 'VENDOR_PAYMENT_REVERSED', 'VendorPayment', paymentId, context, {
          vendorId,
          paymentNumber: payment.paymentNumber,
          reason,
        }),
      });
      return row;
    });
  },

  async bankAccounts(auth: AuthContext, vendorId: string) {
    await getVendor(auth, vendorId);
    const full = await has(auth, PERMISSIONS.VENDORS_VIEW_BANK_DETAILS);
    const rows = await prisma.vendorBankAccount.findMany({
      where: { companyId: auth.companyId, vendorId, deletedAt: null },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map(({ accountNumberEncrypted, companyId, ...row }) => {
      void companyId;
      return {
        ...row,
        accountNumber:
          full && env.DATA_ENCRYPTION_KEY
            ? decryptSensitiveValue(accountNumberEncrypted, env.DATA_ENCRYPTION_KEY)
            : maskSensitiveIdentifier(row.accountNumberLast4),
      };
    });
  },
  async createBankAccount(auth: AuthContext, vendorId: string, input: VendorBankAccountInput) {
    await getVendor(auth, vendorId);
    if (!env.DATA_ENCRYPTION_KEY)
      throw new ValidationError('Bank-account encryption is not configured.');
    return prisma.$transaction(async (tx) => {
      if (input.isPrimary)
        await tx.vendorBankAccount.updateMany({
          where: { companyId: auth.companyId, vendorId, deletedAt: null },
          data: { isPrimary: false },
        });
      const compactAccount = input.accountNumber.replace(/\s+/g, '');
      const { accountNumber, ...fields } = input;
      void accountNumber;
      const row = await tx.vendorBankAccount.create({
        data: compact({
          ...fields,
          companyId: auth.companyId,
          vendorId,
          accountNumberEncrypted: encryptSensitiveValue(
            compactAccount,
            env.DATA_ENCRYPTION_KEY!,
            env.DATA_ENCRYPTION_KEY_VERSION,
          ),
          accountNumberLast4: compactAccount.slice(-4),
          encryptionKeyVersion: env.DATA_ENCRYPTION_KEY_VERSION,
        }) as Prisma.VendorBankAccountUncheckedCreateInput,
      });
      const { accountNumberEncrypted, ...safe } = row;
      void accountNumberEncrypted;
      return { ...safe, accountNumber: maskSensitiveIdentifier(row.accountNumberLast4) };
    });
  },
  async updateBankAccount(
    auth: AuthContext,
    vendorId: string,
    bankAccountId: string,
    input: Partial<VendorBankAccountInput>,
  ) {
    await getVendor(auth, vendorId);
    const existing = await prisma.vendorBankAccount.findFirst({
      where: { id: bankAccountId, companyId: auth.companyId, vendorId, deletedAt: null },
    });
    if (!existing) throw new NotFoundError('Vendor bank account not found.');
    return prisma.$transaction(async (tx) => {
      if (input.isPrimary)
        await tx.vendorBankAccount.updateMany({
          where: {
            companyId: auth.companyId,
            vendorId,
            id: { not: bankAccountId },
            deletedAt: null,
          },
          data: { isPrimary: false },
        });
      const { accountNumber, ...rest } = input;
      const compactAccount = accountNumber?.replace(/\s+/g, '');
      if (compactAccount && !env.DATA_ENCRYPTION_KEY)
        throw new ValidationError('Bank-account encryption is not configured.');
      const row = await tx.vendorBankAccount.update({
        where: { id: bankAccountId },
        data: compact({
          ...rest,
          ...(compactAccount
            ? {
                accountNumberEncrypted: encryptSensitiveValue(
                  compactAccount,
                  env.DATA_ENCRYPTION_KEY!,
                  env.DATA_ENCRYPTION_KEY_VERSION,
                ),
                accountNumberLast4: compactAccount.slice(-4),
                encryptionKeyVersion: env.DATA_ENCRYPTION_KEY_VERSION,
              }
            : {}),
        }) as Prisma.VendorBankAccountUncheckedUpdateInput,
      });
      const { accountNumberEncrypted, ...safe } = row;
      void accountNumberEncrypted;
      return { ...safe, accountNumber: maskSensitiveIdentifier(row.accountNumberLast4) };
    });
  },
  async deleteBankAccount(auth: AuthContext, vendorId: string, bankAccountId: string) {
    await getVendor(auth, vendorId);
    const result = await prisma.vendorBankAccount.updateMany({
      where: { id: bankAccountId, companyId: auth.companyId, vendorId, deletedAt: null },
      data: { deletedAt: new Date(), isPrimary: false },
    });
    if (!result.count) throw new NotFoundError('Vendor bank account not found.');
    return { id: bankAccountId, deleted: true };
  },

  async documents(auth: AuthContext, vendorId: string) {
    await getVendor(auth, vendorId);
    return prisma.vendorDocument.findMany({
      where: { companyId: auth.companyId, vendorId, deletedAt: null },
      select: {
        id: true,
        documentType: true,
        fileName: true,
        originalFileName: true,
        mimeType: true,
        fileSize: true,
        uploadStatus: true,
        expiresAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  },
  async requestDocumentUpload(auth: AuthContext, vendorId: string, input: VendorDocumentUpload) {
    await getVendor(auth, vendorId);
    if (input.fileSize > env.VENDOR_DOCUMENT_MAX_UPLOAD_SIZE_MB * 1024 * 1024)
      throw new ValidationError(
        `Files may not exceed ${env.VENDOR_DOCUMENT_MAX_UPLOAD_SIZE_MB} MB.`,
      );
    if (input.vendorServiceId) await this.service(auth, vendorId, input.vendorServiceId);
    const id = randomUUID();
    const objectKey = vendorObjectKey({
      companyId: auth.companyId,
      vendorId,
      documentId: id,
      fileName: input.fileName,
      ...(input.vendorServiceId ? { serviceId: input.vendorServiceId } : {}),
    });
    const row = await prisma.vendorDocument.create({
      data: compact({
        id,
        companyId: auth.companyId,
        vendorId,
        vendorServiceId: input.vendorServiceId,
        documentType: input.documentType,
        storageProvider: storageService.provider,
        bucket: storageService.bucket,
        objectKey,
        fileName: input.fileName,
        originalFileName: input.fileName,
        mimeType: input.mimeType,
        fileSize: input.fileSize,
        expiresAt: input.expiresAt,
        uploadedById: auth.userId,
      }) as Prisma.VendorDocumentUncheckedCreateInput,
    });
    return {
      document: {
        id: row.id,
        fileName: row.fileName,
        documentType: row.documentType,
        uploadStatus: row.uploadStatus,
      },
      uploadUrl: await storageService.createUploadUrl(
        objectKey,
        input.mimeType,
        input.fileSize,
        env.VENDOR_DOCUMENT_PRESIGNED_URL_EXPIRY_SECONDS,
      ),
      expiresInSeconds: env.VENDOR_DOCUMENT_PRESIGNED_URL_EXPIRY_SECONDS,
    };
  },
  async confirmDocumentUpload(
    auth: AuthContext,
    vendorId: string,
    documentId: string,
    context: RequestContext,
  ) {
    await getVendor(auth, vendorId);
    const document = await prisma.vendorDocument.findFirst({
      where: { id: documentId, companyId: auth.companyId, vendorId, deletedAt: null },
    });
    if (!document) throw new NotFoundError('Vendor document not found.');
    const metadata = await storageService.headObject(document.objectKey);
    if (
      !metadata ||
      metadata.size !== document.fileSize ||
      metadata.contentType !== document.mimeType
    ) {
      await prisma.vendorDocument.update({
        where: { id: documentId },
        data: { uploadStatus: 'FAILED' },
      });
      throw new ValidationError('The uploaded object metadata does not match the approved file.');
    }
    return prisma.$transaction(async (tx) => {
      const row = await tx.vendorDocument.update({
        where: { id: documentId },
        data: { uploadStatus: 'AVAILABLE', checksum: metadata.checksum ?? null },
      });
      await tx.activityLog.create({
        data: audit(auth, 'VENDOR_DOCUMENT_UPLOADED', 'VendorDocument', documentId, context, {
          vendorId,
          documentType: row.documentType,
        }),
      });
      return { id: row.id, uploadStatus: row.uploadStatus };
    });
  },
  async documentUrl(auth: AuthContext, vendorId: string, documentId: string) {
    await getVendor(auth, vendorId);
    const row = await prisma.vendorDocument.findFirst({
      where: {
        id: documentId,
        companyId: auth.companyId,
        vendorId,
        uploadStatus: 'AVAILABLE',
        deletedAt: null,
      },
    });
    if (!row) throw new NotFoundError('Vendor document not found.');
    return {
      url: await storageService.createDownloadUrl(
        row.objectKey,
        row.fileName,
        env.VENDOR_DOCUMENT_PRESIGNED_URL_EXPIRY_SECONDS,
      ),
      expiresInSeconds: env.VENDOR_DOCUMENT_PRESIGNED_URL_EXPIRY_SECONDS,
    };
  },
  async deleteDocument(
    auth: AuthContext,
    vendorId: string,
    documentId: string,
    context: RequestContext,
  ) {
    await getVendor(auth, vendorId);
    const row = await prisma.vendorDocument.findFirst({
      where: { id: documentId, companyId: auth.companyId, vendorId, deletedAt: null },
    });
    if (!row) throw new NotFoundError('Vendor document not found.');
    await prisma.$transaction(async (tx) => {
      await tx.vendorDocument.update({
        where: { id: documentId },
        data: { deletedAt: new Date() },
      });
      await tx.activityLog.create({
        data: audit(auth, 'VENDOR_DOCUMENT_DELETED', 'VendorDocument', documentId, context, {
          vendorId,
          documentType: row.documentType,
        }),
      });
    });
    await storageService.deleteObject(row.objectKey);
    return { id: documentId, deleted: true };
  },

  async notes(auth: AuthContext, vendorId: string) {
    await getVendor(auth, vendorId);
    const financial = await has(auth, PERMISSIONS.VENDORS_VIEW_FINANCIALS);
    return prisma.vendorNote.findMany({
      where: {
        companyId: auth.companyId,
        vendorId,
        deletedAt: null,
        ...(financial ? {} : { noteType: { not: 'PAYMENT' } }),
      },
      include: { author: { select: userSelect } },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    });
  },
  async createNote(
    auth: AuthContext,
    vendorId: string,
    input: VendorNoteInput,
    context: RequestContext,
  ) {
    await getVendor(auth, vendorId);
    if (input.noteType === 'PAYMENT' && !(await has(auth, PERMISSIONS.VENDORS_VIEW_FINANCIALS)))
      throw new ForbiddenError('Payment notes require financial access.');
    return prisma.$transaction(async (tx) => {
      const row = await tx.vendorNote.create({
        data: { ...input, companyId: auth.companyId, vendorId, authorUserId: auth.userId },
        include: { author: { select: userSelect } },
      });
      await tx.activityLog.create({
        data: audit(auth, 'VENDOR_NOTE_CREATED', 'Vendor', vendorId, context, {
          noteId: row.id,
          noteType: row.noteType,
        }),
      });
      return row;
    });
  },
  async updateNote(
    auth: AuthContext,
    vendorId: string,
    noteId: string,
    input: Partial<VendorNoteInput>,
  ) {
    await getVendor(auth, vendorId);
    const row = await prisma.vendorNote.findFirst({
      where: { id: noteId, companyId: auth.companyId, vendorId, deletedAt: null },
    });
    if (!row) throw new NotFoundError('Vendor note not found.');
    if (row.authorUserId !== auth.userId && !(await has(auth, PERMISSIONS.VENDORS_VIEW_ALL)))
      throw new ForbiddenError('You can edit only your own notes.');
    if (input.noteType === 'PAYMENT' && !(await has(auth, PERMISSIONS.VENDORS_VIEW_FINANCIALS)))
      throw new ForbiddenError('Payment notes require financial access.');
    return prisma.vendorNote.update({
      where: { id: noteId },
      data: input,
      include: { author: { select: userSelect } },
    });
  },
  async deleteNote(auth: AuthContext, vendorId: string, noteId: string) {
    await getVendor(auth, vendorId);
    const row = await prisma.vendorNote.findFirst({
      where: { id: noteId, companyId: auth.companyId, vendorId, deletedAt: null },
    });
    if (!row) throw new NotFoundError('Vendor note not found.');
    if (row.authorUserId !== auth.userId && !(await has(auth, PERMISSIONS.VENDORS_VIEW_ALL)))
      throw new ForbiddenError('You can delete only your own notes.');
    await prisma.vendorNote.update({ where: { id: noteId }, data: { deletedAt: new Date() } });
    return { id: noteId, deleted: true };
  },
  async timeline(auth: AuthContext, vendorId: string, query: Record<string, unknown>) {
    await getVendor(auth, vendorId);
    const financial = await has(auth, PERMISSIONS.VENDORS_VIEW_FINANCIALS);
    const page = resolvePagination({
      page: Number(query.page) || undefined,
      pageSize: Number(query.pageSize) || undefined,
    });
    const financialActions: ActivityAction[] = [
      'VENDOR_PAYABLE_CREATED',
      'VENDOR_PAYABLE_UPDATED',
      'VENDOR_PAYMENT_RECORDED',
      'VENDOR_PAYMENT_REVERSED',
    ];
    const where: Prisma.ActivityLogWhereInput = {
      companyId: auth.companyId,
      OR: [
        { entityType: 'Vendor', entityId: vendorId },
        { metadata: { path: ['vendorId'], equals: vendorId } },
      ],
      ...(financial ? {} : { action: { notIn: financialActions } }),
    };
    const [rows, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        include: { actorUser: { select: userSelect } },
        orderBy: { createdAt: 'desc' },
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
      prisma.activityLog.count({ where }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        type: row.action,
        actor: row.actorUser,
        title: row.action.replaceAll('_', ' '),
        description: row.entityType,
        timestamp: row.createdAt,
        linkedEntity: { type: row.entityType, id: row.entityId },
        metadata: row.metadata,
      })),
      pagination: {
        page: page.page,
        pageSize: page.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / page.pageSize)),
      },
    };
  },
  async relationship(
    auth: AuthContext,
    vendorId: string,
    type: 'bookings' | 'booking-services' | 'costs',
  ) {
    await getVendor(auth, vendorId);
    if (type === 'bookings')
      return prisma.booking.findMany({
        where: {
          companyId: auth.companyId,
          deletedAt: null,
          services: { some: { vendorId, deletedAt: null } },
        },
        select: {
          id: true,
          bookingNumber: true,
          customerName: true,
          destinationSummary: true,
          bookingStatus: true,
          travelStartDate: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    if (type === 'booking-services')
      return prisma.bookingService.findMany({
        where: { companyId: auth.companyId, vendorId, deletedAt: null },
        include: { booking: { select: { id: true, bookingNumber: true } } },
        orderBy: { createdAt: 'desc' },
      });
    if (!(await has(auth, PERMISSIONS.VENDORS_VIEW_FINANCIALS)))
      throw new ForbiddenError('Vendor costs require financial access.');
    return prisma.bookingCost.findMany({
      where: { companyId: auth.companyId, vendorId, deletedAt: null },
      include: { booking: { select: { id: true, bookingNumber: true } } },
      orderBy: { createdAt: 'desc' },
    });
  },
  async export(auth: AuthContext, query: Record<string, unknown>) {
    const page = await this.list(auth, { ...query, page: 1, pageSize: 100 });
    return {
      columns: Object.keys(page.data[0] ?? {}).filter(
        (key) => !['bankAccounts', 'normalizedPhone', 'normalizedEmail'].includes(key),
      ),
      rows: page.data,
      truncated: page.pagination.total > 100,
    };
  },
};

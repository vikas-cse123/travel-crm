import type { Prisma } from '@prisma/client';
import {
  PERMISSIONS,
  type QuotationTemplateInput,
  type QuotationTemplateUpdate,
} from '@interscale/shared';
import type { AuthContext } from '../../middleware/authenticate.js';
import { prisma } from '../../config/prisma.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';
import { resolvePagination } from '../../utils/pagination.js';
import { permissionsService } from '../auth/permissions.service.js';
import {
  nextCompanyNumber,
  quotationAudit,
  type RequestContext,
} from '../quotations/quotation.utils.js';

const userSelect = { id: true, fullName: true, username: true } as const;
export const templateInclude = {
  createdBy: { select: userSelect },
  itinerary: { orderBy: { sequence: 'asc' as const } },
  hotels: { orderBy: { sequence: 'asc' as const } },
  services: { orderBy: { sequence: 'asc' as const } },
  inclusions: { orderBy: { sequence: 'asc' as const } },
  exclusions: { orderBy: { sequence: 'asc' as const } },
  terms: { orderBy: { sequence: 'asc' as const } },
} as const;

type FullTemplate = Prisma.QuotationTemplateGetPayload<{ include: typeof templateInclude }>;

function nestedRows(input: QuotationTemplateInput, companyId: string) {
  return {
    itinerary: input.itinerary.map(({ date: _date, ...row }) => {
      void _date;
      return { ...row, companyId };
    }),
    hotels: input.hotels.map((row) => ({ ...row, companyId })),
    services: input.services.map((row) => ({
      ...row,
      companyId,
      internalCost: row.internalCost ?? 0,
      sellingPrice: row.sellingPrice ?? 0,
    })),
    inclusions: input.inclusions.map((row) => ({ ...row, companyId })),
    exclusions: input.exclusions.map((row) => ({ ...row, companyId })),
    terms: input.terms.map((row) => ({ ...row, companyId })),
  };
}

function present(template: FullTemplate, canViewCosting: boolean) {
  const { companyId, deletedAt, ...value } = template;
  void companyId;
  void deletedAt;
  return {
    ...value,
    hotels: value.hotels.map(({ companyId: _companyId, templateId, internalCost, ...hotel }) => {
      void _companyId;
      void templateId;
      return canViewCosting ? { ...hotel, internalCost } : hotel;
    }),
    services: value.services.map(
      ({ companyId: _companyId, templateId, internalCost, ...service }) => {
        void _companyId;
        void templateId;
        return canViewCosting ? { ...service, internalCost } : service;
      },
    ),
    itinerary: value.itinerary.map(({ companyId: _companyId, templateId, ...row }) => {
      void _companyId;
      void templateId;
      return row;
    }),
    inclusions: value.inclusions.map(({ companyId: _companyId, templateId, ...row }) => {
      void _companyId;
      void templateId;
      return row;
    }),
    exclusions: value.exclusions.map(({ companyId: _companyId, templateId, ...row }) => {
      void _companyId;
      void templateId;
      return row;
    }),
    terms: value.terms.map(({ companyId: _companyId, templateId, ...row }) => {
      void _companyId;
      void templateId;
      return row;
    }),
  };
}

async function canCost(auth: AuthContext) {
  return permissionsService.userHasPermission(auth.userId, PERMISSIONS.QUOTATIONS_VIEW_COSTING);
}

async function get(auth: AuthContext, id: string) {
  const value = await prisma.quotationTemplate.findFirst({
    where: { id, companyId: auth.companyId, deletedAt: null },
    include: templateInclude,
  });
  if (!value) throw new NotFoundError('Quotation template not found.');
  return value;
}

export const quotationTemplatesService = {
  async list(auth: AuthContext, query: Record<string, unknown>) {
    const page = resolvePagination({
      page: Number(query.page) || undefined,
      pageSize: Number(query.pageSize) || undefined,
    });
    const search = typeof query.search === 'string' ? query.search : undefined;
    const destination = typeof query.destination === 'string' ? query.destination : undefined;
    const status =
      query.status === 'ACTIVE' || query.status === 'INACTIVE' ? query.status : undefined;
    const createdById = typeof query.createdById === 'string' ? query.createdById : undefined;
    const durationMin = Number(query.durationMin) || undefined;
    const durationMax = Number(query.durationMax) || undefined;
    const allowedSort = [
      'name',
      'durationDays',
      'adultBasePrice',
      'usageCount',
      'createdAt',
      'updatedAt',
    ] as const;
    const requestedSort = typeof query.sortBy === 'string' ? query.sortBy : 'updatedAt';
    const sortBy = allowedSort.find((value) => value === requestedSort) ?? 'updatedAt';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
    const where: Prisma.QuotationTemplateWhereInput = {
      companyId: auth.companyId,
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(createdById ? { createdById } : {}),
      ...(destination
        ? { destinationSummary: { contains: destination, mode: 'insensitive' } }
        : {}),
      ...(durationMin || durationMax
        ? {
            durationDays: {
              ...(durationMin ? { gte: durationMin } : {}),
              ...(durationMax ? { lte: durationMax } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { templateCode: { contains: search, mode: 'insensitive' } },
              { name: { contains: search, mode: 'insensitive' } },
              { destinationSummary: { contains: search, mode: 'insensitive' } },
              { hotels: { some: { hotelName: { contains: search, mode: 'insensitive' } } } },
              { services: { some: { name: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const [rows, total, keys] = await Promise.all([
      prisma.quotationTemplate.findMany({
        where,
        include: templateInclude,
        orderBy: { [sortBy]: sortOrder },
        skip: (page.page - 1) * page.pageSize,
        take: page.pageSize,
      }),
      prisma.quotationTemplate.count({ where }),
      permissionsService.resolveForUser(auth.userId),
    ]);
    const costing = keys.includes(PERMISSIONS.QUOTATIONS_VIEW_COSTING);
    return {
      data: rows.map((row) => ({
        ...present(row, costing),
        cities: [...new Set(row.hotels.map((hotel) => hotel.city))],
        actionPermissions: {
          canUpdate: keys.includes(PERMISSIONS.QUOTATION_TEMPLATES_UPDATE),
          canDelete: keys.includes(PERMISSIONS.QUOTATION_TEMPLATES_DELETE),
          canUse: keys.includes(PERMISSIONS.QUOTATIONS_CREATE),
        },
      })),
      pagination: {
        ...page,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / page.pageSize),
      },
    };
  },

  async details(auth: AuthContext, id: string) {
    return present(await get(auth, id), await canCost(auth));
  },

  async preview(auth: AuthContext, id: string) {
    const template = await get(auth, id);
    const value = present(template, false);
    return {
      ...value,
      internalNotes: undefined,
      cities: [...new Set(template.hotels.map((hotel) => hotel.city))],
      counts: {
        cities: new Set(template.hotels.map((hotel) => hotel.city)).size,
        services: template.services.length,
        hotelOptions: template.hotels.length,
      },
    };
  },

  async create(auth: AuthContext, input: QuotationTemplateInput, context: RequestContext) {
    try {
      const value = await prisma.$transaction(async (tx) => {
        const templateCode = await nextCompanyNumber(tx, auth.companyId, 'template');
        const nested = nestedRows(input, auth.companyId);
        const created = await tx.quotationTemplate.create({
          data: {
            companyId: auth.companyId,
            templateCode,
            name: input.name,
            description: input.description ?? null,
            destinationSummary: input.destinationSummary,
            durationDays: input.durationDays,
            durationNights: input.durationNights,
            baseCurrency: input.baseCurrency,
            adultBasePrice: input.adultBasePrice ?? null,
            childWithBedBasePrice: input.childWithBedBasePrice ?? null,
            childWithoutBedBasePrice: input.childWithoutBedBasePrice ?? null,
            infantBasePrice: input.infantBasePrice ?? null,
            status: input.status,
            internalNotes: input.internalNotes ?? null,
            createdById: auth.userId,
          },
        });
        if (nested.itinerary.length)
          await tx.quotationTemplateItineraryDay.createMany({
            data: nested.itinerary.map((row) => ({
              ...row,
              templateId: created.id,
            })) as Prisma.QuotationTemplateItineraryDayCreateManyInput[],
          });
        if (nested.hotels.length)
          await tx.quotationTemplateHotelOption.createMany({
            data: nested.hotels.map((row) => ({
              ...row,
              templateId: created.id,
            })) as Prisma.QuotationTemplateHotelOptionCreateManyInput[],
          });
        if (nested.services.length)
          await tx.quotationTemplateService.createMany({
            data: nested.services.map((row) => ({
              ...row,
              templateId: created.id,
            })) as Prisma.QuotationTemplateServiceCreateManyInput[],
          });
        if (nested.inclusions.length)
          await tx.quotationTemplateInclusion.createMany({
            data: nested.inclusions.map((row) => ({
              ...row,
              templateId: created.id,
            })) as Prisma.QuotationTemplateInclusionCreateManyInput[],
          });
        if (nested.exclusions.length)
          await tx.quotationTemplateExclusion.createMany({
            data: nested.exclusions.map((row) => ({
              ...row,
              templateId: created.id,
            })) as Prisma.QuotationTemplateExclusionCreateManyInput[],
          });
        if (nested.terms.length)
          await tx.quotationTemplateTerm.createMany({
            data: nested.terms.map((row) => ({
              ...row,
              templateId: created.id,
            })) as Prisma.QuotationTemplateTermCreateManyInput[],
          });
        await tx.activityLog.create({
          data: quotationAudit(
            auth,
            'QUOTATION_TEMPLATE_CREATED',
            'QuotationTemplate',
            created.id,
            context,
            { templateCode },
          ),
        });
        return tx.quotationTemplate.findUniqueOrThrow({
          where: { id: created.id },
          include: templateInclude,
        });
      });
      return present(value, await canCost(auth));
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        throw new ConflictError('A template with this name already exists.');
      throw error;
    }
  },

  async update(
    auth: AuthContext,
    id: string,
    input: QuotationTemplateUpdate,
    context: RequestContext,
  ) {
    await get(auth, id);
    try {
      const value = await prisma.$transaction(async (tx) => {
        const scalar = {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.destinationSummary !== undefined
            ? { destinationSummary: input.destinationSummary }
            : {}),
          ...(input.durationDays !== undefined ? { durationDays: input.durationDays } : {}),
          ...(input.durationNights !== undefined ? { durationNights: input.durationNights } : {}),
          ...(input.baseCurrency !== undefined ? { baseCurrency: input.baseCurrency } : {}),
          ...(input.adultBasePrice !== undefined ? { adultBasePrice: input.adultBasePrice } : {}),
          ...(input.childWithBedBasePrice !== undefined
            ? { childWithBedBasePrice: input.childWithBedBasePrice }
            : {}),
          ...(input.childWithoutBedBasePrice !== undefined
            ? { childWithoutBedBasePrice: input.childWithoutBedBasePrice }
            : {}),
          ...(input.infantBasePrice !== undefined
            ? { infantBasePrice: input.infantBasePrice }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.internalNotes !== undefined ? { internalNotes: input.internalNotes } : {}),
        };
        await tx.quotationTemplate.update({ where: { id }, data: scalar });
        if (input.itinerary !== undefined) {
          await tx.quotationTemplateItineraryDay.deleteMany({
            where: { templateId: id, companyId: auth.companyId },
          });
          if (input.itinerary.length)
            await tx.quotationTemplateItineraryDay.createMany({
              data: input.itinerary.map(({ date: _date, ...row }) => ({
                ...row,
                companyId: auth.companyId,
                templateId: id,
              })) as Prisma.QuotationTemplateItineraryDayCreateManyInput[],
            });
        }
        if (input.hotels !== undefined) {
          await tx.quotationTemplateHotelOption.deleteMany({
            where: { templateId: id, companyId: auth.companyId },
          });
          if (input.hotels.length)
            await tx.quotationTemplateHotelOption.createMany({
              data: input.hotels.map((row) => ({
                ...row,
                companyId: auth.companyId,
                templateId: id,
              })) as Prisma.QuotationTemplateHotelOptionCreateManyInput[],
            });
        }
        if (input.services !== undefined) {
          await tx.quotationTemplateService.deleteMany({
            where: { templateId: id, companyId: auth.companyId },
          });
          if (input.services.length)
            await tx.quotationTemplateService.createMany({
              data: input.services.map((row) => ({
                ...row,
                companyId: auth.companyId,
                templateId: id,
                internalCost: row.internalCost ?? 0,
                sellingPrice: row.sellingPrice ?? 0,
              })) as Prisma.QuotationTemplateServiceCreateManyInput[],
            });
        }
        if (input.inclusions !== undefined) {
          await tx.quotationTemplateInclusion.deleteMany({
            where: { templateId: id, companyId: auth.companyId },
          });
          if (input.inclusions.length)
            await tx.quotationTemplateInclusion.createMany({
              data: input.inclusions.map((row) => ({
                ...row,
                companyId: auth.companyId,
                templateId: id,
              })),
            });
        }
        if (input.exclusions !== undefined) {
          await tx.quotationTemplateExclusion.deleteMany({
            where: { templateId: id, companyId: auth.companyId },
          });
          if (input.exclusions.length)
            await tx.quotationTemplateExclusion.createMany({
              data: input.exclusions.map((row) => ({
                ...row,
                companyId: auth.companyId,
                templateId: id,
              })),
            });
        }
        if (input.terms !== undefined) {
          await tx.quotationTemplateTerm.deleteMany({
            where: { templateId: id, companyId: auth.companyId },
          });
          if (input.terms.length)
            await tx.quotationTemplateTerm.createMany({
              data: input.terms.map((row) => ({
                ...row,
                companyId: auth.companyId,
                templateId: id,
              })),
            });
        }
        await tx.activityLog.create({
          data: quotationAudit(
            auth,
            'QUOTATION_TEMPLATE_UPDATED',
            'QuotationTemplate',
            id,
            context,
          ),
        });
        return tx.quotationTemplate.findUniqueOrThrow({ where: { id }, include: templateInclude });
      });
      return present(value, await canCost(auth));
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        throw new ConflictError('A template with this name already exists.');
      throw error;
    }
  },

  async duplicate(auth: AuthContext, id: string, context: RequestContext) {
    const source = await get(auth, id);
    let suffix = 1;
    let name = `${source.name} (Copy)`;
    while (await prisma.quotationTemplate.count({ where: { companyId: auth.companyId, name } })) {
      suffix += 1;
      name = `${source.name} (Copy ${suffix})`;
    }
    const input: QuotationTemplateInput = {
      name,
      description: source.description,
      destinationSummary: source.destinationSummary,
      durationDays: source.durationDays,
      durationNights: source.durationNights,
      baseCurrency: source.baseCurrency,
      adultBasePrice: source.adultBasePrice?.toNumber(),
      childWithBedBasePrice: source.childWithBedBasePrice?.toNumber(),
      childWithoutBedBasePrice: source.childWithoutBedBasePrice?.toNumber(),
      infantBasePrice: source.infantBasePrice?.toNumber(),
      status: 'INACTIVE',
      internalNotes: source.internalNotes,
      itinerary: source.itinerary.map(
        ({
          id: _id,
          companyId: _companyId,
          templateId: _templateId,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          ...row
        }) => row,
      ),
      hotels: source.hotels.map(
        ({
          id: _id,
          companyId: _companyId,
          templateId: _templateId,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          internalCost,
          sellingPrice,
          ...row
        }) => ({
          ...row,
          internalCost: internalCost?.toNumber(),
          sellingPrice: sellingPrice?.toNumber(),
        }),
      ),
      services: source.services.map(
        ({
          id: _id,
          companyId: _companyId,
          templateId: _templateId,
          createdAt: _createdAt,
          updatedAt: _updatedAt,
          quantity,
          internalCost,
          sellingPrice,
          ...row
        }) => ({
          ...row,
          quantity: quantity.toNumber(),
          internalCost: internalCost?.toNumber(),
          sellingPrice: sellingPrice?.toNumber(),
        }),
      ),
      inclusions: source.inclusions.map(
        ({ id: _id, companyId: _companyId, templateId: _templateId, ...row }) => row,
      ),
      exclusions: source.exclusions.map(
        ({ id: _id, companyId: _companyId, templateId: _templateId, ...row }) => row,
      ),
      terms: source.terms.map(
        ({ id: _id, companyId: _companyId, templateId: _templateId, ...row }) => row,
      ),
    };
    const created = await this.create(auth, input, context);
    await prisma.activityLog.create({
      data: quotationAudit(
        auth,
        'QUOTATION_TEMPLATE_DUPLICATED',
        'QuotationTemplate',
        created.id,
        context,
        { sourceTemplateId: id },
      ),
    });
    return created;
  },

  async status(
    auth: AuthContext,
    id: string,
    status: 'ACTIVE' | 'INACTIVE',
    context: RequestContext,
  ) {
    await get(auth, id);
    const value = await prisma.quotationTemplate.update({
      where: { id },
      data: { status },
      include: templateInclude,
    });
    await prisma.activityLog.create({
      data: quotationAudit(
        auth,
        status === 'ACTIVE' ? 'QUOTATION_TEMPLATE_ACTIVATED' : 'QUOTATION_TEMPLATE_DEACTIVATED',
        'QuotationTemplate',
        id,
        context,
      ),
    });
    return present(value, await canCost(auth));
  },

  async archive(auth: AuthContext, id: string, context: RequestContext) {
    await get(auth, id);
    await prisma.$transaction([
      prisma.quotationTemplate.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'INACTIVE' },
      }),
      prisma.activityLog.create({
        data: quotationAudit(auth, 'QUOTATION_TEMPLATE_ARCHIVED', 'QuotationTemplate', id, context),
      }),
    ]);
    return { id, archived: true };
  },
};

import { PrismaClient } from '@prisma/client';
import {
  normalizeCustomerName,
  normalizeCustomerPhone,
  normalizeEmail,
} from '../utils/normalize.js';
import { env } from '../config/env.js';
import { recalculateCustomerMetrics } from '../modules/customers/customers.service.js';

const prisma = new PrismaClient();

type Totals = {
  created: number;
  linkedLeads: number;
  linkedQuotations: number;
  linkedBookings: number;
  conflicts: number;
};

async function run() {
  const totals: Totals = {
    created: 0,
    linkedLeads: 0,
    linkedQuotations: 0,
    linkedBookings: 0,
    conflicts: 0,
  };
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  for (const company of companies) {
    const customers = await prisma.customer.findMany({
      where: { companyId: company.id, deletedAt: null, status: { not: 'MERGED' } },
      select: { id: true, normalizedPhone: true, normalizedEmail: true },
    });
    const byPhone = new Map<string, string>();
    const byEmail = new Map<string, string>();
    for (const customer of customers) {
      if (customer.normalizedPhone) byPhone.set(customer.normalizedPhone, customer.id);
      if (customer.normalizedEmail) byEmail.set(customer.normalizedEmail, customer.id);
    }
    const leads = await prisma.query.findMany({
      where: { companyId: company.id, customerId: null, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    for (const lead of leads) {
      const phone = normalizeCustomerPhone(lead.phone, env.DEFAULT_PHONE_COUNTRY);
      const email = lead.email ? normalizeEmail(lead.email) : null;
      const matches = new Set(
        [phone ? byPhone.get(phone) : undefined, email ? byEmail.get(email) : undefined].filter(
          (value): value is string => Boolean(value),
        ),
      );
      if (matches.size > 1) {
        totals.conflicts += 1;
        continue;
      }
      await prisma.$transaction(async (tx) => {
        let customerId = [...matches][0];
        if (!customerId) {
          const year = lead.createdAt.getUTCFullYear();
          const counter = await tx.customerCounter.upsert({
            where: { companyId_year: { companyId: company.id, year } },
            create: { companyId: company.id, year, value: 1 },
            update: { value: { increment: 1 } },
            select: { value: true },
          });
          const customer = await tx.customer.create({
            data: {
              companyId: company.id,
              customerNumber: `CUS-${year}-${String(counter.value).padStart(6, '0')}`,
              displayName: lead.customerName,
              normalizedName: normalizeCustomerName(lead.customerName),
              primaryPhone: lead.phone,
              normalizedPhone: phone,
              alternatePhone: lead.alternatePhone,
              email: lead.email,
              normalizedEmail: email,
              dateOfBirth: lead.dateOfBirth,
              source: lead.leadSource,
              assignedToId: lead.assignedToId,
              createdById: lead.createdById,
              createdAt: lead.createdAt,
            },
          });
          customerId = customer.id;
          totals.created += 1;
          if (phone) byPhone.set(phone, customerId);
          if (email) byEmail.set(email, customerId);
        }
        await tx.query.update({ where: { id: lead.id }, data: { customerId } });
        const quotations = await tx.quotation.updateMany({
          where: { companyId: company.id, queryId: lead.id, customerId: null },
          data: { customerId },
        });
        const bookings = await tx.booking.updateMany({
          where: { companyId: company.id, queryId: lead.id, customerId: null },
          data: { customerId },
        });
        const bookingFromQuotation = await tx.booking.updateMany({
          where: { companyId: company.id, customerId: null, quotation: { customerId } },
          data: { customerId },
        });
        totals.linkedLeads += 1;
        totals.linkedQuotations += quotations.count;
        totals.linkedBookings += bookings.count + bookingFromQuotation.count;
      });
    }
    const customerIds = await prisma.customer.findMany({
      where: { companyId: company.id, deletedAt: null, status: { not: 'MERGED' } },
      select: { id: true },
    });
    await prisma.$transaction(async (tx) => {
      for (const customer of customerIds) {
        await recalculateCustomerMetrics(tx, company.id, customer.id);
      }
    });
    process.stdout.write(
      `Backfilled ${company.name}: ${leads.length} unlinked lead(s) inspected.\n`,
    );
  }
  process.stdout.write(`${JSON.stringify(totals, null, 2)}\n`);
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

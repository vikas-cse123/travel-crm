import { LeadStage, type Prisma } from '@prisma/client';
import type { ReminderRuleInput } from '@interscale/shared';
import type { AuthContext } from '../../middleware/authenticate.js';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import type { RequestContext } from '../notifications/notifications.service.js';
import { reminderProcessor } from './reminder-processor.service.js';

const include = {
  fixedUser: { select: { id: true, fullName: true } },
  _count: { select: { reminders: true, executions: true } },
} as const;

const activeLeadStages = Object.values(LeadStage).filter(
  (stage) => !['BOOKING_CONFIRMED', 'LOST', 'CANCELLED', 'INVALID'].includes(stage),
);

function defaults(userId: string) {
  const leadRules = activeLeadStages.map((stage, index) => ({
    companyId: '',
    createdById: userId,
    name: `Lead · ${stage
      .replaceAll('_', ' ')
      .toLowerCase()
      .replace(/^./, (value) => value.toUpperCase())}`,
    description: `Create a follow-up when a lead enters ${stage.replaceAll('_', ' ').toLowerCase()}.`,
    ruleType: 'LEAD_STAGE' as const,
    leadStage: stage,
    reminderType: 'LEAD_FOLLOW_UP' as const,
    reminderPriority: ['HOT', 'NEGOTIATING'].includes(stage)
      ? ('HIGH' as const)
      : ('MEDIUM' as const),
    delayValue: stage === 'NEW_LEAD' ? 2 : 1,
    delayUnit: stage === 'NEW_LEAD' ? ('HOURS' as const) : ('DAYS' as const),
    dueTime: env.REMINDER_DEFAULT_DUE_TIME,
    assignToMode: 'LEAD_ASSIGNEE' as const,
    titleTemplate: `Follow up {{queryNumber}} · {{customerName}}`,
    descriptionTemplate: `Lead is in ${stage.replaceAll('_', ' ').toLowerCase()}.`,
    channels: ['IN_APP', 'EMAIL'] as const,
    escalationEnabled: true,
    escalationAfterValue: 1,
    escalationAfterUnit: 'DAYS' as const,
    escalationRoleName: env.REMINDER_ESCALATION_MANAGER_ROLE,
    sortOrder: index,
  }));
  return [
    ...leadRules,
    {
      companyId: '',
      createdById: userId,
      name: 'Booking · Travel approaching',
      description: 'Remind the booking owner before travel.',
      ruleType: 'BOOKING_TRAVEL' as const,
      reminderType: 'BOOKING_TRAVEL' as const,
      reminderPriority: 'HIGH' as const,
      delayValue: 7,
      delayUnit: 'DAYS' as const,
      dueTime: env.REMINDER_DEFAULT_DUE_TIME,
      assignToMode: 'BOOKING_ASSIGNEE' as const,
      titleTemplate: 'Travel approaching · {{bookingNumber}}',
      descriptionTemplate: '{{customerName}} travels to {{destination}} soon.',
      channels: ['IN_APP', 'EMAIL'] as const,
      escalationEnabled: true,
      escalationAfterValue: 1,
      escalationAfterUnit: 'DAYS' as const,
      escalationRoleName: env.REMINDER_ESCALATION_MANAGER_ROLE,
      sortOrder: 100,
    },
    {
      companyId: '',
      createdById: userId,
      name: 'Booking · Customer payment due',
      description: 'Remind the booking owner before a customer instalment is due.',
      ruleType: 'CUSTOMER_PAYMENT' as const,
      reminderType: 'CUSTOMER_PAYMENT_DUE' as const,
      reminderPriority: 'HIGH' as const,
      delayValue: 2,
      delayUnit: 'DAYS' as const,
      dueTime: env.REMINDER_DEFAULT_DUE_TIME,
      assignToMode: 'BOOKING_ASSIGNEE' as const,
      titleTemplate: 'Payment due · {{bookingNumber}}',
      descriptionTemplate: '{{scheduleLabel}} is due for {{customerName}}.',
      channels: ['IN_APP', 'EMAIL'] as const,
      escalationEnabled: true,
      escalationAfterValue: 1,
      escalationAfterUnit: 'DAYS' as const,
      escalationRoleName: env.REMINDER_ESCALATION_MANAGER_ROLE,
      sortOrder: 110,
    },
    {
      companyId: '',
      createdById: userId,
      name: 'Quotation · Expiry approaching',
      description: 'Remind the quotation owner before validity expires.',
      ruleType: 'QUOTATION_EXPIRY' as const,
      reminderType: 'QUOTATION_EXPIRY' as const,
      reminderPriority: 'MEDIUM' as const,
      delayValue: 2,
      delayUnit: 'DAYS' as const,
      dueTime: env.REMINDER_DEFAULT_DUE_TIME,
      assignToMode: 'LEAD_ASSIGNEE' as const,
      titleTemplate: 'Quotation expiring · {{quotationNumber}}',
      descriptionTemplate: 'Quotation for {{customerName}} is approaching expiry.',
      channels: ['IN_APP'] as const,
      escalationEnabled: false,
      escalationAfterValue: null,
      escalationAfterUnit: null,
      escalationRoleName: null,
      sortOrder: 120,
    },
    {
      companyId: '',
      createdById: userId,
      name: 'Vendor · Payable due',
      description: 'Remind the vendor owner before a payable is due.',
      ruleType: 'VENDOR_PAYABLE' as const,
      reminderType: 'VENDOR_PAYMENT_DUE' as const,
      reminderPriority: 'HIGH' as const,
      delayValue: 2,
      delayUnit: 'DAYS' as const,
      dueTime: env.REMINDER_DEFAULT_DUE_TIME,
      assignToMode: 'VENDOR_ASSIGNEE' as const,
      titleTemplate: 'Vendor payable due · {{payableNumber}}',
      descriptionTemplate: '{{vendorName}} payment is approaching its due date.',
      channels: ['IN_APP', 'EMAIL'] as const,
      escalationEnabled: true,
      escalationAfterValue: 1,
      escalationAfterUnit: 'DAYS' as const,
      escalationRoleName: env.REMINDER_ESCALATION_MANAGER_ROLE,
      sortOrder: 130,
    },
    {
      companyId: '',
      createdById: userId,
      name: 'Vendor · Contract expiry',
      description: 'Remind the vendor owner before a contract expires.',
      ruleType: 'VENDOR_CONTRACT' as const,
      reminderType: 'OTHER' as const,
      reminderPriority: 'MEDIUM' as const,
      delayValue: env.VENDOR_CONTRACT_EXPIRY_WARNING_DAYS,
      delayUnit: 'DAYS' as const,
      dueTime: env.REMINDER_DEFAULT_DUE_TIME,
      assignToMode: 'VENDOR_ASSIGNEE' as const,
      titleTemplate: 'Vendor contract expiring · {{vendorName}}',
      descriptionTemplate: 'Review the vendor contract before expiry.',
      channels: ['IN_APP'] as const,
      escalationEnabled: false,
      escalationAfterValue: null,
      escalationAfterUnit: null,
      escalationRoleName: null,
      sortOrder: 140,
    },
  ];
}

async function validateFixedUser(companyId: string, fixedUserId: string | null | undefined) {
  if (!fixedUserId) return;
  if (
    !(await prisma.user.findFirst({
      where: { id: fixedUserId, companyId, status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    }))
  )
    throw new ValidationError('Fixed assignee must be an active user in your company.');
}

function data(input: Partial<ReminderRuleInput>) {
  return {
    name: input.name,
    description: input.description,
    ruleType: input.ruleType,
    isEnabled: input.isEnabled,
    sortOrder: input.sortOrder,
    leadStage: input.leadStage as LeadStage | null | undefined,
    reminderType: input.reminderType,
    reminderPriority: input.priority,
    delayValue: input.delayValue,
    delayUnit: input.delayUnit,
    dueTime: input.dueTime,
    assignToMode: input.assignToMode,
    fixedUserId: input.fixedUserId,
    titleTemplate: input.titleTemplate,
    descriptionTemplate: input.descriptionTemplate,
    channels: input.channels,
    escalationEnabled: input.escalationEnabled,
    escalationAfterValue: input.escalationAfterValue,
    escalationAfterUnit: input.escalationAfterUnit,
    escalationRoleName: input.escalationRoleName,
    configuration: input.configuration as Prisma.InputJsonValue | undefined,
  };
}

function audit(
  auth: AuthContext,
  action:
    | 'REMINDER_RULE_CREATED'
    | 'REMINDER_RULE_UPDATED'
    | 'REMINDER_RULE_DELETED'
    | 'REMINDER_RULE_RESET',
  id: string | null,
  context: RequestContext,
) {
  return {
    companyId: auth.companyId,
    actorUserId: auth.userId,
    action,
    entityType: 'ReminderRule',
    entityId: id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  } as const;
}

export const reminderRulesService = {
  async ensureDefaults(companyId: string, userId: string) {
    const definitions = defaults(userId);
    const rows = [];
    for (const definition of definitions) {
      const { companyId: _ignored, ...rule } = definition;
      const ruleData = { ...rule, channels: [...rule.channels] };
      rows.push(
        await prisma.reminderRule.upsert({
          where: { companyId_name: { companyId, name: ruleData.name } },
          create: { ...ruleData, companyId },
          update: { ...ruleData, deletedAt: null },
        }),
      );
    }
    return rows;
  },
  async list(auth: AuthContext) {
    return prisma.reminderRule.findMany({
      where: { companyId: auth.companyId, deletedAt: null },
      include,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  },
  async details(auth: AuthContext, id: string) {
    const rule = await prisma.reminderRule.findFirst({
      where: { id, companyId: auth.companyId, deletedAt: null },
      include,
    });
    if (!rule) throw new NotFoundError('Reminder rule not found.');
    return rule;
  },
  async create(auth: AuthContext, input: ReminderRuleInput, context: RequestContext) {
    await validateFixedUser(auth.companyId, input.fixedUserId);
    const id = crypto.randomUUID();
    const [rule] = await prisma.$transaction([
      prisma.reminderRule.create({
        data: {
          id,
          companyId: auth.companyId,
          createdById: auth.userId,
          ...data(input),
        } as Prisma.ReminderRuleUncheckedCreateInput,
        include,
      }),
      prisma.activityLog.create({ data: audit(auth, 'REMINDER_RULE_CREATED', id, context) }),
    ]);
    return rule;
  },
  async update(
    auth: AuthContext,
    id: string,
    input: Partial<ReminderRuleInput>,
    context: RequestContext,
  ) {
    await Promise.all([
      this.details(auth, id),
      validateFixedUser(auth.companyId, input.fixedUserId),
    ]);
    const [rule] = await prisma.$transaction([
      prisma.reminderRule.update({
        where: { id },
        data: data(input) as Prisma.ReminderRuleUncheckedUpdateInput,
        include,
      }),
      prisma.activityLog.create({ data: audit(auth, 'REMINDER_RULE_UPDATED', id, context) }),
    ]);
    return rule;
  },
  async delete(auth: AuthContext, id: string, context: RequestContext) {
    await this.details(auth, id);
    await prisma.$transaction([
      prisma.reminderRule.update({
        where: { id },
        data: { deletedAt: new Date(), isEnabled: false },
      }),
      prisma.activityLog.create({ data: audit(auth, 'REMINDER_RULE_DELETED', id, context) }),
    ]);
    return { id };
  },
  async reset(auth: AuthContext, context: RequestContext) {
    const rows = await this.ensureDefaults(auth.companyId, auth.userId);
    await prisma.activityLog.create({ data: audit(auth, 'REMINDER_RULE_RESET', null, context) });
    return rows;
  },
  async preview(auth: AuthContext, id: string) {
    await this.details(auth, id);
    return reminderProcessor.previewRule(auth.companyId, id);
  },
  async runPreview(auth: AuthContext, id: string) {
    await this.details(auth, id);
    return reminderProcessor.processCompany(auth.companyId, { ruleId: id, dryRun: false });
  },
  leadStages: activeLeadStages,
};

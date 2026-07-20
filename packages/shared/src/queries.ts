import { z } from 'zod';

export const LEAD_SOURCES = [
  'WEBSITE',
  'SOCIAL_MEDIA',
  'FACEBOOK_ADS',
  'INSTAGRAM_ADS',
  'GOOGLE_ADS',
  'WHATSAPP',
  'PHONE_CALL',
  'REFERRAL',
  'WALK_IN',
  'REPEAT_CUSTOMER',
  'PARTNER',
  'OTHER',
] as const;
export const LEAD_TYPES = ['FRESH', 'HOT', 'WARM', 'COLD', 'PROSPECT'] as const;
export const LEAD_STAGES = [
  'NEW_LEAD',
  'CONTACTED',
  'QUALIFIED',
  'QUOTATION_REQUIRED',
  'QUOTATION_SENT',
  'IN_NEGOTIATION',
  'READY_TO_BOOK',
  'BOOKING_CONFIRMED',
  'FOLLOW_UP',
  'AMENDMENT',
  'LOST',
  'CANCELLED',
  'INVALID',
  'ON_HOLD',
] as const;
export const QUERY_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const FOLLOW_UP_STATUSES = ['PENDING', 'COMPLETED', 'CANCELLED', 'MISSED'] as const;
export const FOLLOW_UP_OUTCOMES = [
  'CONNECTED',
  'NO_ANSWER',
  'BUSY',
  'SWITCHED_OFF',
  'CALL_BACK_LATER',
  'INTERESTED',
  'NOT_INTERESTED',
  'QUOTATION_REQUESTED',
  'NEGOTIATING',
  'READY_TO_BOOK',
  'BOOKING_CONFIRMED',
  'WRONG_NUMBER',
  'OTHER',
] as const;
export const CONTACT_METHODS = ['PHONE', 'WHATSAPP', 'EMAIL', 'MEETING', 'OTHER'] as const;
export const SERVICE_TYPES = [
  'FLIGHT',
  'HOTEL',
  'CRUISE',
  'VEHICLE_TRANSFER',
  'SIGHTSEEING',
  'VISA',
  'TRAVEL_INSURANCE',
  'RAIL',
  'PASSPORT_ASSISTANCE',
  'OTHER_ADD_ON',
  'GENERAL_ENQUIRY',
] as const;

export type LeadSourceValue = (typeof LEAD_SOURCES)[number];
export type LeadTypeValue = (typeof LEAD_TYPES)[number];
export type LeadStageValue = (typeof LEAD_STAGES)[number];
export type QueryPriorityValue = (typeof QUERY_PRIORITIES)[number];
export type ServiceTypeValue = (typeof SERVICE_TYPES)[number];
export type FollowUpOutcomeValue = (typeof FOLLOW_UP_OUTCOMES)[number];
export type ContactMethodValue = (typeof CONTACT_METHODS)[number];

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalDate = z.coerce.date().nullable().optional();
const optionalMoney = z.coerce.number().min(0).max(999999999999).nullable().optional();

export const itineraryInputSchema = z
  .object({
    country: z.string().trim().min(1).max(80),
    destination: z.string().trim().min(1).max(120),
    nights: z.coerce.number().int().min(0).max(365),
    sequence: z.coerce.number().int().min(1).max(100),
    arrivalDate: optionalDate,
    departureDate: optionalDate,
    notes: optionalText(1000),
  })
  .refine((v) => !v.arrivalDate || !v.departureDate || v.arrivalDate <= v.departureDate, {
    message: 'Arrival date must be on or before departure date.',
    path: ['departureDate'],
  });

export const followUpInputSchema = z.object({
  scheduledAt: z.coerce.date(),
  assignedToId: z.string().uuid().optional(),
  notes: optionalText(2000),
});

export const queryInputSchema = z
  .object({
    customerName: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(5).max(32),
    alternatePhone: optionalText(32),
    email: z.string().trim().email().max(255).nullable().optional().or(z.literal('')),
    dateOfBirth: optionalDate,
    leadSource: z.enum(LEAD_SOURCES),
    leadType: z.enum(LEAD_TYPES).default('FRESH'),
    leadStage: z.enum(LEAD_STAGES).default('NEW_LEAD'),
    priority: z.enum(QUERY_PRIORITIES).default('MEDIUM'),
    departureCountry: optionalText(80),
    departureCity: optionalText(100),
    travelStartDate: optionalDate,
    travelEndDate: optionalDate,
    flexibleDates: z.boolean().default(false),
    rooms: z.coerce.number().int().min(1).max(100).default(1),
    adults: z.coerce.number().int().min(1).max(200).default(1),
    childrenWithBed: z.coerce.number().int().min(0).max(100).default(0),
    childrenWithoutBed: z.coerce.number().int().min(0).max(100).default(0),
    infants: z.coerce.number().int().min(0).max(100).default(0),
    extraBeds: z.coerce.number().int().min(0).max(100).default(0),
    expectedAmount: optionalMoney,
    budgetMin: optionalMoney,
    budgetMax: optionalMoney,
    expectedMargin: optionalMoney,
    currency: z.string().trim().length(3).default('INR'),
    tripType: optionalText(40),
    quotationRequired: z.boolean().default(false),
    bookingStatusPlaceholder: optionalText(80),
    webLinkPlaceholder: z.string().trim().url().max(500).nullable().optional().or(z.literal('')),
    supplierCostingNotes: optionalText(2000),
    assignedToId: z.string().uuid().nullable().optional(),
    internalRemarks: optionalText(2000),
    services: z.array(z.enum(SERVICE_TYPES)).min(1),
    itinerary: z.array(itineraryInputSchema).min(1).max(100),
    initialNote: optionalText(4000),
    initialFollowUp: followUpInputSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.travelStartDate && v.travelEndDate && v.travelStartDate > v.travelEndDate)
      ctx.addIssue({
        code: 'custom',
        path: ['travelEndDate'],
        message: 'Travel end must be after travel start.',
      });
    if (v.budgetMin != null && v.budgetMax != null && v.budgetMin > v.budgetMax)
      ctx.addIssue({
        code: 'custom',
        path: ['budgetMax'],
        message: 'Maximum budget must not be below minimum budget.',
      });
    if (new Set(v.itinerary.map((r) => r.sequence)).size !== v.itinerary.length)
      ctx.addIssue({
        code: 'custom',
        path: ['itinerary'],
        message: 'Itinerary sequence values must be unique.',
      });
    for (const [i, row] of v.itinerary.entries()) {
      if (v.travelStartDate && row.arrivalDate && row.arrivalDate < v.travelStartDate)
        ctx.addIssue({
          code: 'custom',
          path: ['itinerary', i, 'arrivalDate'],
          message: 'Itinerary must fit the trip dates.',
        });
      if (v.travelEndDate && row.departureDate && row.departureDate > v.travelEndDate)
        ctx.addIssue({
          code: 'custom',
          path: ['itinerary', i, 'departureDate'],
          message: 'Itinerary must fit the trip dates.',
        });
    }
  });

export const queryUpdateSchema = queryInputSchema
  .innerType()
  .omit({ initialNote: true, initialFollowUp: true, leadStage: true, assignedToId: true })
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export const stageInputSchema = z.object({
  stage: z.enum(LEAD_STAGES),
  reason: optionalText(500),
  lostReason: optionalText(500),
});
export const assignmentInputSchema = z.object({
  assignedToId: z.string().uuid().nullable(),
  movePendingFollowUps: z.boolean().default(false),
});
export const noteInputSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  isCustomerContact: z.boolean().default(false),
  contactMethod: z.enum(CONTACT_METHODS).nullable().optional(),
});
export const noteUpdateSchema = noteInputSchema;
export const followUpUpdateSchema = followUpInputSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export const followUpCompleteSchema = z
  .object({
    outcome: z.enum(FOLLOW_UP_OUTCOMES),
    notes: optionalText(2000),
    nextFollowUp: followUpInputSchema.optional(),
    nextLeadStage: z.enum(LEAD_STAGES).optional(),
  })
  .refine((v) => v.outcome !== 'OTHER' || Boolean(v.notes), {
    message: 'A note is required for the Other outcome.',
    path: ['notes'],
  });
export const followUpCancelSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});

export type QueryInput = z.infer<typeof queryInputSchema>;
export type QueryUpdateInput = z.infer<typeof queryUpdateSchema>;
export type FollowUpInput = z.infer<typeof followUpInputSchema>;
export type FollowUpCompleteInput = z.infer<typeof followUpCompleteSchema>;

export const labelForLookup = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

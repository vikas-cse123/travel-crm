import { Router } from 'express';
import {
  PERMISSIONS,
  reportBookingsQuerySchema,
  reportClientPaymentsQuerySchema,
  reportLeadsQuerySchema,
  reportPeriodQuerySchema,
  reportQuotationsQuerySchema,
  reportStaffQuerySchema,
  reportVendorPayablesQuerySchema,
} from '@interscale/shared';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { reportsController as c } from './reports.controller.js';

/**
 * Every route is gated by `reports.view`. The underlying module permissions
 * (queries.view, quotations.view, bookings.view, bookings.view_financials,
 * vendors.view + vendors.view_financials) then decide which sections and which
 * financial columns are actually returned — an unauthorised section is omitted
 * rather than failing the whole request.
 */
const router = Router();
router.use(requireAuth, requireVerifiedEmail, requirePermission(PERMISSIONS.REPORTS_VIEW));

router.get(
  '/summary',
  validateRequest({ query: reportPeriodQuerySchema }),
  asyncHandler(c.summary),
);
router.get('/leads', validateRequest({ query: reportLeadsQuerySchema }), asyncHandler(c.leads));
router.get(
  '/quotations',
  validateRequest({ query: reportQuotationsQuerySchema }),
  asyncHandler(c.quotations),
);
router.get(
  '/quotations/export',
  validateRequest({ query: reportQuotationsQuerySchema }),
  asyncHandler(c.quotationsCsv),
);
router.get(
  '/bookings',
  validateRequest({ query: reportBookingsQuerySchema }),
  asyncHandler(c.bookings),
);
router.get(
  '/bookings/export',
  validateRequest({ query: reportBookingsQuerySchema }),
  asyncHandler(c.bookingsCsv),
);
router.get(
  '/client-payments',
  validateRequest({ query: reportClientPaymentsQuerySchema }),
  asyncHandler(c.clientPayments),
);
router.get(
  '/client-payments/export',
  validateRequest({ query: reportClientPaymentsQuerySchema }),
  asyncHandler(c.clientPaymentsCsv),
);
router.get(
  '/vendor-payables',
  validateRequest({ query: reportVendorPayablesQuerySchema }),
  asyncHandler(c.vendorPayables),
);
router.get(
  '/vendor-payables/export',
  validateRequest({ query: reportVendorPayablesQuerySchema }),
  asyncHandler(c.vendorPayablesCsv),
);
router.get(
  '/staff-conversions',
  validateRequest({ query: reportStaffQuerySchema }),
  asyncHandler(c.staffConversions),
);
router.get(
  '/staff-financials',
  validateRequest({ query: reportStaffQuerySchema }),
  asyncHandler(c.staffFinancials),
);
router.get(
  '/lead-sources',
  validateRequest({ query: reportPeriodQuerySchema }),
  asyncHandler(c.leadSources),
);
router.get(
  '/destinations',
  validateRequest({ query: reportPeriodQuerySchema }),
  asyncHandler(c.destinations),
);

export { router as reportsRoutes };

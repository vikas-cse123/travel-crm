import { Router } from 'express';
import {
  flightSearchQuerySchema,
  hotelAutocompleteQuerySchema,
  hotelSearchQuerySchema,
} from '@interscale/shared';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../utils/async-handler.js';
import { searchController as c } from './search.controller.js';

const router = Router();
router.use(requireAuth, requireVerifiedEmail);

router.get(
  '/flights',
  validateRequest({ query: flightSearchQuerySchema }),
  asyncHandler(c.flights),
);
router.get(
  '/hotels',
  validateRequest({ query: hotelSearchQuerySchema }),
  asyncHandler(c.hotels),
);
router.get(
  '/hotels/autocomplete',
  validateRequest({ query: hotelAutocompleteQuerySchema }),
  asyncHandler(c.hotelsAutocomplete),
);

export { router as searchRoutes };

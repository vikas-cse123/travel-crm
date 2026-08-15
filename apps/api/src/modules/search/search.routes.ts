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

// Live search endpoints.
router.get(
  '/hotels/autocomplete',
  validateRequest({ query: hotelAutocompleteQuerySchema }),
  asyncHandler(c.hotelsAutocomplete),
);
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

// Per-user SearchAPI key management (isolated under /search/keys).
router.get('/keys', asyncHandler(c.keyStatus));
router.post('/keys', asyncHandler(c.saveKey));
router.delete('/keys', asyncHandler(c.removeKey));
router.post('/keys/test', asyncHandler(c.testKey));

export { router as searchRoutes };

import { Router } from 'express';
import {
  bookmarkListQuerySchema,
  createBookmarkSchema,
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

// Bookmarks (DB only — never calls SearchAPI).
router.get(
  '/bookmarks',
  validateRequest({ query: bookmarkListQuerySchema }),
  asyncHandler(c.listBookmarks),
);
router.post(
  '/bookmarks',
  validateRequest({ body: createBookmarkSchema }),
  asyncHandler(c.createBookmark),
);
// Look up a bookmark by its public code (e.g. HTL-000123). Registered before
// the `:id` route so "by-code" is never captured as an id.
router.get('/bookmarks/by-code/:bookmarkCode', asyncHandler(c.getBookmarkByCode));
router.get('/bookmarks/:id', asyncHandler(c.getBookmark));
router.delete('/bookmarks/:id', asyncHandler(c.deleteBookmark));

export { router as searchRoutes };

import { Router } from 'express';
import { z } from 'zod';
import {
  DESTINATION_TYPES,
  MASTER_STATUSES,
  PERMISSIONS,
  airlineInputSchema,
  airlineLogoUploadSchema,
  airlineUpdateSchema,
  cityInputSchema,
  cityUpdateSchema,
  destinationCityAddSchema,
  destinationCityReorderSchema,
  destinationImageUploadSchema,
  destinationInputSchema,
  destinationUpdateSchema,
  hotelImageUploadSchema,
  hotelInputSchema,
  hotelMealPlanInputSchema,
  hotelMealPlanUpdateSchema,
  hotelRoomTypeInputSchema,
  hotelRoomTypeUpdateSchema,
  hotelUpdateSchema,
  masterStatusSchema,
} from '@interscale/shared';
import { requireAuth, requireVerifiedEmail } from '../../middleware/authenticate.js';
import { requirePermission } from '../../middleware/require-permission.js';
import { validateRequest } from '../../middleware/validate-request.js';
import { asyncHandler } from '../../utils/async-handler.js';
import {
  airlinesController as airlines,
  citiesController as cities,
  destinationsController as destinations,
  hotelsController as hotels,
} from './masters.controller.js';

const router = Router();
const cityId = z.object({ cityId: z.string().uuid() });
const destinationId = z.object({ destinationId: z.string().uuid() });
const destinationCityId = destinationId.extend({ cityId: z.string().uuid() });
const bool = z.enum(['true', 'false']).transform((value) => value === 'true');
const commonList = {
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
  search: z.string().trim().max(200).optional(),
  country: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase())
    .optional(),
  status: z.enum(MASTER_STATUSES).optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
};
const cityList = z.object({
  ...commonList,
  hasAirportCode: bool.optional(),
  sortBy: z.enum(['name', 'country', 'airportCode', 'createdAt', 'updatedAt']).optional(),
});
const destinationList = z.object({
  ...commonList,
  destinationType: z.enum(DESTINATION_TYPES).optional(),
  cityId: z.string().uuid().optional(),
  sortBy: z
    .enum(['name', 'country', 'destinationType', 'cityCount', 'createdAt', 'updatedAt'])
    .optional(),
});
const lookups = z.object({
  country: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase())
    .optional(),
  search: z.string().trim().max(160).optional(),
});
const hotelId = z.object({ hotelId: z.string().uuid() });
const hotelRoomTypeId = hotelId.extend({ roomTypeId: z.string().uuid() });
const hotelMealPlanId = hotelId.extend({ mealPlanId: z.string().uuid() });
const airlineId = z.object({ airlineId: z.string().uuid() });
const hotelList = z.object({
  page: commonList.page,
  pageSize: commonList.pageSize,
  search: commonList.search,
  status: commonList.status,
  sortOrder: commonList.sortOrder,
  destinationId: z.string().uuid().optional(),
  cityId: z.string().uuid().optional(),
  starCategory: z.coerce.number().int().min(1).max(5).optional(),
  isDefaultForCity: bool.optional(),
  sortBy: z.enum(['name', 'starCategory', 'createdAt', 'updatedAt']).optional(),
});
const hotelLookups = z.object({
  destinationId: z.string().uuid().optional(),
  cityId: z.string().uuid().optional(),
  search: z.string().trim().max(160).optional(),
});
const airlineList = z.object({
  page: commonList.page,
  pageSize: commonList.pageSize,
  search: commonList.search,
  status: commonList.status,
  country: commonList.country,
  sortOrder: commonList.sortOrder,
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).optional(),
});
const airlineLookups = z.object({ search: z.string().trim().max(160).optional() });

router.use(requireAuth, requireVerifiedEmail);

router.get(
  '/cities',
  requirePermission(PERMISSIONS.MASTER_CITIES_VIEW),
  validateRequest({ query: cityList }),
  asyncHandler(cities.list),
);
router.get(
  '/cities/lookups',
  requirePermission(PERMISSIONS.MASTER_CITIES_VIEW),
  validateRequest({ query: lookups }),
  asyncHandler(cities.lookups),
);
router.post(
  '/cities',
  requirePermission(PERMISSIONS.MASTER_CITIES_CREATE),
  validateRequest({ body: cityInputSchema }),
  asyncHandler(cities.create),
);
router.get(
  '/cities/:cityId',
  requirePermission(PERMISSIONS.MASTER_CITIES_VIEW),
  validateRequest({ params: cityId }),
  asyncHandler(cities.details),
);
router.patch(
  '/cities/:cityId',
  requirePermission(PERMISSIONS.MASTER_CITIES_UPDATE),
  validateRequest({ params: cityId, body: cityUpdateSchema }),
  asyncHandler(cities.update),
);
router.patch(
  '/cities/:cityId/status',
  requirePermission(PERMISSIONS.MASTER_CITIES_UPDATE),
  validateRequest({ params: cityId, body: masterStatusSchema }),
  asyncHandler(cities.status),
);
router.delete(
  '/cities/:cityId',
  requirePermission(PERMISSIONS.MASTER_CITIES_DELETE),
  validateRequest({ params: cityId }),
  asyncHandler(cities.archive),
);

router.get(
  '/destinations',
  requirePermission(PERMISSIONS.MASTER_DESTINATIONS_VIEW),
  validateRequest({ query: destinationList }),
  asyncHandler(destinations.list),
);
router.get(
  '/destinations/lookups',
  requirePermission(PERMISSIONS.MASTER_DESTINATIONS_VIEW),
  validateRequest({ query: lookups }),
  asyncHandler(destinations.lookups),
);
router.post(
  '/destinations',
  requirePermission(PERMISSIONS.MASTER_DESTINATIONS_CREATE),
  validateRequest({ body: destinationInputSchema }),
  asyncHandler(destinations.create),
);
router.get(
  '/destinations/:destinationId',
  requirePermission(PERMISSIONS.MASTER_DESTINATIONS_VIEW),
  validateRequest({ params: destinationId }),
  asyncHandler(destinations.details),
);
router.patch(
  '/destinations/:destinationId',
  requirePermission(PERMISSIONS.MASTER_DESTINATIONS_UPDATE),
  validateRequest({ params: destinationId, body: destinationUpdateSchema }),
  asyncHandler(destinations.update),
);
router.patch(
  '/destinations/:destinationId/status',
  requirePermission(PERMISSIONS.MASTER_DESTINATIONS_UPDATE),
  validateRequest({ params: destinationId, body: masterStatusSchema }),
  asyncHandler(destinations.status),
);
router.delete(
  '/destinations/:destinationId',
  requirePermission(PERMISSIONS.MASTER_DESTINATIONS_DELETE),
  validateRequest({ params: destinationId }),
  asyncHandler(destinations.archive),
);
router.get(
  '/destinations/:destinationId/cities',
  requirePermission(PERMISSIONS.MASTER_DESTINATIONS_VIEW),
  validateRequest({ params: destinationId }),
  asyncHandler(destinations.cities),
);
router.post(
  '/destinations/:destinationId/cities',
  requirePermission(PERMISSIONS.MASTER_DESTINATIONS_UPDATE),
  validateRequest({ params: destinationId, body: destinationCityAddSchema }),
  asyncHandler(destinations.addCity),
);
router.delete(
  '/destinations/:destinationId/cities/:cityId',
  requirePermission(PERMISSIONS.MASTER_DESTINATIONS_UPDATE),
  validateRequest({ params: destinationCityId }),
  asyncHandler(destinations.removeCity),
);
router.post(
  '/destinations/:destinationId/cities/reorder',
  requirePermission(PERMISSIONS.MASTER_DESTINATIONS_UPDATE),
  validateRequest({ params: destinationId, body: destinationCityReorderSchema }),
  asyncHandler(destinations.reorderCities),
);
router.post(
  '/destinations/:destinationId/image/upload',
  requirePermission(PERMISSIONS.MASTER_DESTINATIONS_MANAGE_IMAGES),
  validateRequest({ params: destinationId, body: destinationImageUploadSchema }),
  asyncHandler(destinations.imageUpload),
);
router.post(
  '/destinations/:destinationId/image/confirm',
  requirePermission(PERMISSIONS.MASTER_DESTINATIONS_MANAGE_IMAGES),
  validateRequest({ params: destinationId }),
  asyncHandler(destinations.imageConfirm),
);
router.get(
  '/destinations/:destinationId/image/download-url',
  requirePermission(PERMISSIONS.MASTER_DESTINATIONS_VIEW),
  validateRequest({ params: destinationId }),
  asyncHandler(destinations.imageDownload),
);
router.delete(
  '/destinations/:destinationId/image',
  requirePermission(PERMISSIONS.MASTER_DESTINATIONS_MANAGE_IMAGES),
  validateRequest({ params: destinationId }),
  asyncHandler(destinations.imageDelete),
);

// ---------------------------------------------------------------------------
// Hotels
// ---------------------------------------------------------------------------

router.get(
  '/hotels',
  requirePermission(PERMISSIONS.MASTER_HOTELS_VIEW),
  validateRequest({ query: hotelList }),
  asyncHandler(hotels.list),
);
router.get(
  '/hotels/lookups',
  requirePermission(PERMISSIONS.MASTER_HOTELS_VIEW),
  validateRequest({ query: hotelLookups }),
  asyncHandler(hotels.lookups),
);
router.post(
  '/hotels',
  requirePermission(PERMISSIONS.MASTER_HOTELS_CREATE),
  validateRequest({ body: hotelInputSchema }),
  asyncHandler(hotels.create),
);
router.get(
  '/hotels/:hotelId',
  requirePermission(PERMISSIONS.MASTER_HOTELS_VIEW),
  validateRequest({ params: hotelId }),
  asyncHandler(hotels.details),
);
router.patch(
  '/hotels/:hotelId',
  requirePermission(PERMISSIONS.MASTER_HOTELS_UPDATE),
  validateRequest({ params: hotelId, body: hotelUpdateSchema }),
  asyncHandler(hotels.update),
);
router.patch(
  '/hotels/:hotelId/status',
  requirePermission(PERMISSIONS.MASTER_HOTELS_UPDATE),
  validateRequest({ params: hotelId, body: masterStatusSchema }),
  asyncHandler(hotels.status),
);
router.delete(
  '/hotels/:hotelId',
  requirePermission(PERMISSIONS.MASTER_HOTELS_DELETE),
  validateRequest({ params: hotelId }),
  asyncHandler(hotels.archive),
);
router.post(
  '/hotels/:hotelId/room-types',
  requirePermission(PERMISSIONS.MASTER_HOTELS_UPDATE),
  validateRequest({ params: hotelId, body: hotelRoomTypeInputSchema }),
  asyncHandler(hotels.createRoomType),
);
router.patch(
  '/hotels/:hotelId/room-types/:roomTypeId',
  requirePermission(PERMISSIONS.MASTER_HOTELS_UPDATE),
  validateRequest({ params: hotelRoomTypeId, body: hotelRoomTypeUpdateSchema }),
  asyncHandler(hotels.updateRoomType),
);
router.post(
  '/hotels/:hotelId/meal-plans',
  requirePermission(PERMISSIONS.MASTER_HOTELS_UPDATE),
  validateRequest({ params: hotelId, body: hotelMealPlanInputSchema }),
  asyncHandler(hotels.createMealPlan),
);
router.patch(
  '/hotels/:hotelId/meal-plans/:mealPlanId',
  requirePermission(PERMISSIONS.MASTER_HOTELS_UPDATE),
  validateRequest({ params: hotelMealPlanId, body: hotelMealPlanUpdateSchema }),
  asyncHandler(hotels.updateMealPlan),
);
router.post(
  '/hotels/:hotelId/image/upload',
  requirePermission(PERMISSIONS.MASTER_HOTELS_MANAGE_MEDIA),
  validateRequest({ params: hotelId, body: hotelImageUploadSchema }),
  asyncHandler(hotels.imageUpload),
);
router.post(
  '/hotels/:hotelId/image/confirm',
  requirePermission(PERMISSIONS.MASTER_HOTELS_MANAGE_MEDIA),
  validateRequest({ params: hotelId }),
  asyncHandler(hotels.imageConfirm),
);
router.get(
  '/hotels/:hotelId/image/download-url',
  requirePermission(PERMISSIONS.MASTER_HOTELS_VIEW),
  validateRequest({ params: hotelId }),
  asyncHandler(hotels.imageDownload),
);
router.delete(
  '/hotels/:hotelId/image',
  requirePermission(PERMISSIONS.MASTER_HOTELS_MANAGE_MEDIA),
  validateRequest({ params: hotelId }),
  asyncHandler(hotels.imageDelete),
);

// ---------------------------------------------------------------------------
// Airlines
// ---------------------------------------------------------------------------

router.get(
  '/airlines',
  requirePermission(PERMISSIONS.MASTER_AIRLINES_VIEW),
  validateRequest({ query: airlineList }),
  asyncHandler(airlines.list),
);
router.get(
  '/airlines/lookups',
  requirePermission(PERMISSIONS.MASTER_AIRLINES_VIEW),
  validateRequest({ query: airlineLookups }),
  asyncHandler(airlines.lookups),
);
router.post(
  '/airlines',
  requirePermission(PERMISSIONS.MASTER_AIRLINES_CREATE),
  validateRequest({ body: airlineInputSchema }),
  asyncHandler(airlines.create),
);
router.get(
  '/airlines/:airlineId',
  requirePermission(PERMISSIONS.MASTER_AIRLINES_VIEW),
  validateRequest({ params: airlineId }),
  asyncHandler(airlines.details),
);
router.patch(
  '/airlines/:airlineId',
  requirePermission(PERMISSIONS.MASTER_AIRLINES_UPDATE),
  validateRequest({ params: airlineId, body: airlineUpdateSchema }),
  asyncHandler(airlines.update),
);
router.patch(
  '/airlines/:airlineId/status',
  requirePermission(PERMISSIONS.MASTER_AIRLINES_UPDATE),
  validateRequest({ params: airlineId, body: masterStatusSchema }),
  asyncHandler(airlines.status),
);
router.delete(
  '/airlines/:airlineId',
  requirePermission(PERMISSIONS.MASTER_AIRLINES_DELETE),
  validateRequest({ params: airlineId }),
  asyncHandler(airlines.archive),
);
router.post(
  '/airlines/:airlineId/logo/upload',
  requirePermission(PERMISSIONS.MASTER_AIRLINES_MANAGE_MEDIA),
  validateRequest({ params: airlineId, body: airlineLogoUploadSchema }),
  asyncHandler(airlines.logoUpload),
);
router.post(
  '/airlines/:airlineId/logo/confirm',
  requirePermission(PERMISSIONS.MASTER_AIRLINES_MANAGE_MEDIA),
  validateRequest({ params: airlineId }),
  asyncHandler(airlines.logoConfirm),
);
router.get(
  '/airlines/:airlineId/logo/download-url',
  requirePermission(PERMISSIONS.MASTER_AIRLINES_VIEW),
  validateRequest({ params: airlineId }),
  asyncHandler(airlines.logoDownload),
);
router.delete(
  '/airlines/:airlineId/logo',
  requirePermission(PERMISSIONS.MASTER_AIRLINES_MANAGE_MEDIA),
  validateRequest({ params: airlineId }),
  asyncHandler(airlines.logoDelete),
);

export { router as mastersRoutes };

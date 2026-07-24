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
  cruiseImageUploadSchema,
  cruiseInputSchema,
  cruiseUpdateSchema,
  vehicleImageUploadSchema,
  vehicleInputSchema,
  vehicleUpdateSchema,
  sightseeingImageUploadSchema,
  sightseeingInputSchema,
  sightseeingReorderSchema,
  sightseeingUpdateSchema,
  addOnServiceInputSchema,
  addOnServiceUpdateSchema,
  visaTypeInputSchema,
  visaTypeUpdateSchema,
  testimonialInputSchema,
  testimonialUpdateSchema,
  testimonialImageUploadSchema,
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
  cruisesController as cruises,
  vehiclesController as vehicles,
  sightseeingController as sightseeing,
  addOnServicesController as addOnServices,
  visaTypesController as visaTypes,
  testimonialsController as testimonials,
} from './masters.controller.js';

const router = Router();
const cityId = z.object({ cityId: z.string().uuid() });
const destinationId = z.object({ destinationId: z.string().uuid() });
const cruiseId = z.object({ cruiseId: z.string().uuid() });
const vehicleId = z.object({ vehicleId: z.string().uuid() });
const sightseeingId = z.object({ sightseeingId: z.string().uuid() });
const addOnServiceId = z.object({ addOnServiceId: z.string().uuid() });
const visaTypeId = z.object({ visaTypeId: z.string().uuid() });
const testimonialId = z.object({ testimonialId: z.string().uuid() });
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

// ---------------------------------------------------------------------------
// Cruises
// ---------------------------------------------------------------------------

const cruiseList = z.object({
  ...commonList,
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).optional(),
});

router.get(
  '/cruises',
  requirePermission(PERMISSIONS.MASTER_CRUISES_VIEW),
  validateRequest({ query: cruiseList }),
  asyncHandler(cruises.list),
);
router.get(
  '/cruises/lookups',
  requirePermission(PERMISSIONS.MASTER_CRUISES_VIEW),
  validateRequest({ query: z.object({ search: z.string().trim().max(200).optional() }) }),
  asyncHandler(cruises.lookups),
);
router.post(
  '/cruises',
  requirePermission(PERMISSIONS.MASTER_CRUISES_CREATE),
  validateRequest({ body: cruiseInputSchema }),
  asyncHandler(cruises.create),
);
router.get(
  '/cruises/:cruiseId',
  requirePermission(PERMISSIONS.MASTER_CRUISES_VIEW),
  validateRequest({ params: cruiseId }),
  asyncHandler(cruises.details),
);
router.patch(
  '/cruises/:cruiseId',
  requirePermission(PERMISSIONS.MASTER_CRUISES_UPDATE),
  validateRequest({ params: cruiseId, body: cruiseUpdateSchema }),
  asyncHandler(cruises.update),
);
router.patch(
  '/cruises/:cruiseId/status',
  requirePermission(PERMISSIONS.MASTER_CRUISES_UPDATE),
  validateRequest({ params: cruiseId, body: masterStatusSchema }),
  asyncHandler(cruises.status),
);
router.delete(
  '/cruises/:cruiseId',
  requirePermission(PERMISSIONS.MASTER_CRUISES_DELETE),
  validateRequest({ params: cruiseId }),
  asyncHandler(cruises.archive),
);
router.post(
  '/cruises/:cruiseId/image/upload',
  requirePermission(PERMISSIONS.MASTER_CRUISES_MANAGE_MEDIA),
  validateRequest({ params: cruiseId, body: cruiseImageUploadSchema }),
  asyncHandler(cruises.imageUpload),
);
router.post(
  '/cruises/:cruiseId/image/confirm',
  requirePermission(PERMISSIONS.MASTER_CRUISES_MANAGE_MEDIA),
  validateRequest({ params: cruiseId }),
  asyncHandler(cruises.imageConfirm),
);
router.get(
  '/cruises/:cruiseId/image/download-url',
  requirePermission(PERMISSIONS.MASTER_CRUISES_VIEW),
  validateRequest({ params: cruiseId }),
  asyncHandler(cruises.imageDownload),
);
router.delete(
  '/cruises/:cruiseId/image',
  requirePermission(PERMISSIONS.MASTER_CRUISES_MANAGE_MEDIA),
  validateRequest({ params: cruiseId }),
  asyncHandler(cruises.imageDelete),
);

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

const vehicleList = z.object({
  ...commonList,
  vehicleType: z.string().trim().max(120).optional(),
  sortBy: z.enum(['name', 'capacity', 'createdAt', 'updatedAt']).optional(),
});

router.get(
  '/vehicles',
  requirePermission(PERMISSIONS.MASTER_VEHICLES_VIEW),
  validateRequest({ query: vehicleList }),
  asyncHandler(vehicles.list),
);
router.get(
  '/vehicles/types',
  requirePermission(PERMISSIONS.MASTER_VEHICLES_VIEW),
  asyncHandler(vehicles.types),
);
router.get(
  '/vehicles/lookups',
  requirePermission(PERMISSIONS.MASTER_VEHICLES_VIEW),
  validateRequest({ query: z.object({ search: z.string().trim().max(200).optional() }) }),
  asyncHandler(vehicles.lookups),
);
router.post(
  '/vehicles',
  requirePermission(PERMISSIONS.MASTER_VEHICLES_CREATE),
  validateRequest({ body: vehicleInputSchema }),
  asyncHandler(vehicles.create),
);
router.get(
  '/vehicles/:vehicleId',
  requirePermission(PERMISSIONS.MASTER_VEHICLES_VIEW),
  validateRequest({ params: vehicleId }),
  asyncHandler(vehicles.details),
);
router.patch(
  '/vehicles/:vehicleId',
  requirePermission(PERMISSIONS.MASTER_VEHICLES_UPDATE),
  validateRequest({ params: vehicleId, body: vehicleUpdateSchema }),
  asyncHandler(vehicles.update),
);
router.patch(
  '/vehicles/:vehicleId/status',
  requirePermission(PERMISSIONS.MASTER_VEHICLES_UPDATE),
  validateRequest({ params: vehicleId, body: masterStatusSchema }),
  asyncHandler(vehicles.status),
);
router.delete(
  '/vehicles/:vehicleId',
  requirePermission(PERMISSIONS.MASTER_VEHICLES_DELETE),
  validateRequest({ params: vehicleId }),
  asyncHandler(vehicles.archive),
);
router.post(
  '/vehicles/:vehicleId/image/upload',
  requirePermission(PERMISSIONS.MASTER_VEHICLES_MANAGE_MEDIA),
  validateRequest({ params: vehicleId, body: vehicleImageUploadSchema }),
  asyncHandler(vehicles.imageUpload),
);
router.post(
  '/vehicles/:vehicleId/image/confirm',
  requirePermission(PERMISSIONS.MASTER_VEHICLES_MANAGE_MEDIA),
  validateRequest({ params: vehicleId }),
  asyncHandler(vehicles.imageConfirm),
);
router.get(
  '/vehicles/:vehicleId/image/download-url',
  requirePermission(PERMISSIONS.MASTER_VEHICLES_VIEW),
  validateRequest({ params: vehicleId }),
  asyncHandler(vehicles.imageDownload),
);
router.delete(
  '/vehicles/:vehicleId/image',
  requirePermission(PERMISSIONS.MASTER_VEHICLES_MANAGE_MEDIA),
  validateRequest({ params: vehicleId }),
  asyncHandler(vehicles.imageDelete),
);

// ---------------------------------------------------------------------------
// Sightseeing
// ---------------------------------------------------------------------------

const sightseeingList = z.object({
  ...commonList,
  destinationId: z.string().uuid().optional(),
  cityId: z.string().uuid().optional(),
  sortBy: z.enum(['title', 'sequence', 'createdAt', 'updatedAt']).optional(),
});

router.get(
  '/sightseeing',
  requirePermission(PERMISSIONS.MASTER_SIGHTSEEING_VIEW),
  validateRequest({ query: sightseeingList }),
  asyncHandler(sightseeing.list),
);
router.get(
  '/sightseeing/summary',
  requirePermission(PERMISSIONS.MASTER_SIGHTSEEING_VIEW),
  asyncHandler(sightseeing.summary),
);
router.get(
  '/sightseeing/lookups',
  requirePermission(PERMISSIONS.MASTER_SIGHTSEEING_VIEW),
  validateRequest({
    query: z.object({
      search: z.string().trim().max(200).optional(),
      destinationId: z.string().uuid().optional(),
      cityId: z.string().uuid().optional(),
    }),
  }),
  asyncHandler(sightseeing.lookups),
);
router.post(
  '/sightseeing',
  requirePermission(PERMISSIONS.MASTER_SIGHTSEEING_CREATE),
  validateRequest({ body: sightseeingInputSchema }),
  asyncHandler(sightseeing.create),
);
router.get(
  '/sightseeing/:sightseeingId',
  requirePermission(PERMISSIONS.MASTER_SIGHTSEEING_VIEW),
  validateRequest({ params: sightseeingId }),
  asyncHandler(sightseeing.details),
);
router.patch(
  '/sightseeing/:sightseeingId',
  requirePermission(PERMISSIONS.MASTER_SIGHTSEEING_UPDATE),
  validateRequest({ params: sightseeingId, body: sightseeingUpdateSchema }),
  asyncHandler(sightseeing.update),
);
router.patch(
  '/sightseeing/:sightseeingId/reorder',
  requirePermission(PERMISSIONS.MASTER_SIGHTSEEING_UPDATE),
  validateRequest({ params: sightseeingId, body: sightseeingReorderSchema }),
  asyncHandler(sightseeing.reorder),
);
router.patch(
  '/sightseeing/:sightseeingId/status',
  requirePermission(PERMISSIONS.MASTER_SIGHTSEEING_UPDATE),
  validateRequest({ params: sightseeingId, body: masterStatusSchema }),
  asyncHandler(sightseeing.status),
);
router.delete(
  '/sightseeing/:sightseeingId',
  requirePermission(PERMISSIONS.MASTER_SIGHTSEEING_DELETE),
  validateRequest({ params: sightseeingId }),
  asyncHandler(sightseeing.archive),
);
router.post(
  '/sightseeing/:sightseeingId/image/upload',
  requirePermission(PERMISSIONS.MASTER_SIGHTSEEING_MANAGE_MEDIA),
  validateRequest({ params: sightseeingId, body: sightseeingImageUploadSchema }),
  asyncHandler(sightseeing.imageUpload),
);
router.post(
  '/sightseeing/:sightseeingId/image/confirm',
  requirePermission(PERMISSIONS.MASTER_SIGHTSEEING_MANAGE_MEDIA),
  validateRequest({ params: sightseeingId }),
  asyncHandler(sightseeing.imageConfirm),
);
router.get(
  '/sightseeing/:sightseeingId/image/download-url',
  requirePermission(PERMISSIONS.MASTER_SIGHTSEEING_VIEW),
  validateRequest({ params: sightseeingId }),
  asyncHandler(sightseeing.imageDownload),
);
router.delete(
  '/sightseeing/:sightseeingId/image',
  requirePermission(PERMISSIONS.MASTER_SIGHTSEEING_MANAGE_MEDIA),
  validateRequest({ params: sightseeingId }),
  asyncHandler(sightseeing.imageDelete),
);

// ---------------------------------------------------------------------------
// Add-On Services
// ---------------------------------------------------------------------------

const addOnServiceList = z.object({
  ...commonList,
  sortBy: z.enum(['name', 'price', 'createdAt', 'updatedAt']).optional(),
});

router.get(
  '/add-on-services',
  requirePermission(PERMISSIONS.MASTER_ADD_ON_SERVICES_VIEW),
  validateRequest({ query: addOnServiceList }),
  asyncHandler(addOnServices.list),
);
router.get(
  '/add-on-services/lookups',
  requirePermission(PERMISSIONS.MASTER_ADD_ON_SERVICES_VIEW),
  validateRequest({ query: z.object({ search: z.string().trim().max(200).optional() }) }),
  asyncHandler(addOnServices.lookups),
);
router.post(
  '/add-on-services',
  requirePermission(PERMISSIONS.MASTER_ADD_ON_SERVICES_CREATE),
  validateRequest({ body: addOnServiceInputSchema }),
  asyncHandler(addOnServices.create),
);
router.get(
  '/add-on-services/:addOnServiceId',
  requirePermission(PERMISSIONS.MASTER_ADD_ON_SERVICES_VIEW),
  validateRequest({ params: addOnServiceId }),
  asyncHandler(addOnServices.details),
);
router.patch(
  '/add-on-services/:addOnServiceId',
  requirePermission(PERMISSIONS.MASTER_ADD_ON_SERVICES_UPDATE),
  validateRequest({ params: addOnServiceId, body: addOnServiceUpdateSchema }),
  asyncHandler(addOnServices.update),
);
router.patch(
  '/add-on-services/:addOnServiceId/status',
  requirePermission(PERMISSIONS.MASTER_ADD_ON_SERVICES_UPDATE),
  validateRequest({ params: addOnServiceId, body: masterStatusSchema }),
  asyncHandler(addOnServices.status),
);
router.delete(
  '/add-on-services/:addOnServiceId',
  requirePermission(PERMISSIONS.MASTER_ADD_ON_SERVICES_DELETE),
  validateRequest({ params: addOnServiceId }),
  asyncHandler(addOnServices.archive),
);

// ---------------------------------------------------------------------------
// Visa Types
// ---------------------------------------------------------------------------
const visaTypeList = z.object({
  page: commonList.page,
  pageSize: commonList.pageSize,
  search: commonList.search,
  status: commonList.status,
  sortOrder: commonList.sortOrder,
  destinationId: z.string().uuid().optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).optional(),
});
router.get(
  '/visa-types',
  requirePermission(PERMISSIONS.MASTER_VISA_TYPES_VIEW),
  validateRequest({ query: visaTypeList }),
  asyncHandler(visaTypes.list),
);
router.post(
  '/visa-types',
  requirePermission(PERMISSIONS.MASTER_VISA_TYPES_CREATE),
  validateRequest({ body: visaTypeInputSchema }),
  asyncHandler(visaTypes.create),
);
router.get(
  '/visa-types/:visaTypeId',
  requirePermission(PERMISSIONS.MASTER_VISA_TYPES_VIEW),
  validateRequest({ params: visaTypeId }),
  asyncHandler(visaTypes.details),
);
router.patch(
  '/visa-types/:visaTypeId',
  requirePermission(PERMISSIONS.MASTER_VISA_TYPES_UPDATE),
  validateRequest({ params: visaTypeId, body: visaTypeUpdateSchema }),
  asyncHandler(visaTypes.update),
);
router.patch(
  '/visa-types/:visaTypeId/status',
  requirePermission(PERMISSIONS.MASTER_VISA_TYPES_UPDATE),
  validateRequest({ params: visaTypeId, body: masterStatusSchema }),
  asyncHandler(visaTypes.status),
);
router.delete(
  '/visa-types/:visaTypeId',
  requirePermission(PERMISSIONS.MASTER_VISA_TYPES_DELETE),
  validateRequest({ params: visaTypeId }),
  asyncHandler(visaTypes.archive),
);

// ---------------------------------------------------------------------------
// Testimonials
// ---------------------------------------------------------------------------
const testimonialList = z.object({
  page: commonList.page,
  pageSize: commonList.pageSize,
  search: commonList.search,
  status: commonList.status,
  sortOrder: commonList.sortOrder,
  sortBy: z.enum(['clientName', 'createdAt', 'updatedAt']).optional(),
});
router.get(
  '/testimonials',
  requirePermission(PERMISSIONS.MASTER_TESTIMONIALS_VIEW),
  validateRequest({ query: testimonialList }),
  asyncHandler(testimonials.list),
);
router.post(
  '/testimonials',
  requirePermission(PERMISSIONS.MASTER_TESTIMONIALS_CREATE),
  validateRequest({ body: testimonialInputSchema }),
  asyncHandler(testimonials.create),
);
router.get(
  '/testimonials/:testimonialId',
  requirePermission(PERMISSIONS.MASTER_TESTIMONIALS_VIEW),
  validateRequest({ params: testimonialId }),
  asyncHandler(testimonials.details),
);
router.patch(
  '/testimonials/:testimonialId',
  requirePermission(PERMISSIONS.MASTER_TESTIMONIALS_UPDATE),
  validateRequest({ params: testimonialId, body: testimonialUpdateSchema }),
  asyncHandler(testimonials.update),
);
router.patch(
  '/testimonials/:testimonialId/status',
  requirePermission(PERMISSIONS.MASTER_TESTIMONIALS_UPDATE),
  validateRequest({ params: testimonialId, body: masterStatusSchema }),
  asyncHandler(testimonials.status),
);
router.delete(
  '/testimonials/:testimonialId',
  requirePermission(PERMISSIONS.MASTER_TESTIMONIALS_DELETE),
  validateRequest({ params: testimonialId }),
  asyncHandler(testimonials.archive),
);
router.post(
  '/testimonials/:testimonialId/image/upload',
  requirePermission(PERMISSIONS.MASTER_TESTIMONIALS_MANAGE_MEDIA),
  validateRequest({ params: testimonialId, body: testimonialImageUploadSchema }),
  asyncHandler(testimonials.imageUpload),
);
router.post(
  '/testimonials/:testimonialId/image/confirm',
  requirePermission(PERMISSIONS.MASTER_TESTIMONIALS_MANAGE_MEDIA),
  validateRequest({ params: testimonialId }),
  asyncHandler(testimonials.imageConfirm),
);
router.get(
  '/testimonials/:testimonialId/image/download-url',
  requirePermission(PERMISSIONS.MASTER_TESTIMONIALS_VIEW),
  validateRequest({ params: testimonialId }),
  asyncHandler(testimonials.imageDownload),
);
router.delete(
  '/testimonials/:testimonialId/image',
  requirePermission(PERMISSIONS.MASTER_TESTIMONIALS_MANAGE_MEDIA),
  validateRequest({ params: testimonialId }),
  asyncHandler(testimonials.imageDelete),
);

export { router as mastersRoutes };

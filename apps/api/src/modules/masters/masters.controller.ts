import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { citiesService, destinationsService } from './masters.service.js';
import { hotelsService } from './hotels.service.js';
import { airlinesService } from './airlines.service.js';
import { cruisesService } from './cruises.service.js';
import { vehiclesService } from './vehicles.service.js';
import { sightseeingService } from './sightseeing.service.js';
import { addOnServicesService } from './add-on-services.service.js';

const auth = (req: Request) => {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
};
const context = (req: Request) => ({
  ipAddress: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null,
});

export const citiesController = {
  list: async (req: Request, res: Response) =>
    sendSuccess(res, await citiesService.list(auth(req), req.query)),
  lookups: async (req: Request, res: Response) =>
    sendSuccess(res, await citiesService.lookups(auth(req), req.query)),
  details: async (req: Request, res: Response) =>
    sendSuccess(res, await citiesService.details(auth(req), req.params.cityId!)),
  create: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await citiesService.create(auth(req), req.body, context(req)),
      'City created.',
      201,
    ),
  update: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await citiesService.update(auth(req), req.params.cityId!, req.body, context(req)),
      'City updated.',
    ),
  status: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await citiesService.status(auth(req), req.params.cityId!, req.body.status, context(req)),
      'City status updated.',
    ),
  archive: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await citiesService.archive(auth(req), req.params.cityId!, context(req)),
      'City archived.',
    ),
};

export const destinationsController = {
  list: async (req: Request, res: Response) =>
    sendSuccess(res, await destinationsService.list(auth(req), req.query)),
  lookups: async (req: Request, res: Response) =>
    sendSuccess(res, await destinationsService.lookups(auth(req), req.query)),
  details: async (req: Request, res: Response) =>
    sendSuccess(res, await destinationsService.details(auth(req), req.params.destinationId!)),
  create: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await destinationsService.create(auth(req), req.body, context(req)),
      'Destination created.',
      201,
    ),
  update: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await destinationsService.update(
        auth(req),
        req.params.destinationId!,
        req.body,
        context(req),
      ),
      'Destination updated.',
    ),
  status: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await destinationsService.status(
        auth(req),
        req.params.destinationId!,
        req.body.status,
        context(req),
      ),
      'Destination status updated.',
    ),
  archive: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await destinationsService.archive(auth(req), req.params.destinationId!, context(req)),
      'Destination archived.',
    ),
  cities: async (req: Request, res: Response) =>
    sendSuccess(res, await destinationsService.cities(auth(req), req.params.destinationId!)),
  addCity: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await destinationsService.addCity(
        auth(req),
        req.params.destinationId!,
        req.body.cityId,
        context(req),
      ),
      'City added.',
      201,
    ),
  removeCity: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await destinationsService.removeCity(
        auth(req),
        req.params.destinationId!,
        req.params.cityId!,
        context(req),
      ),
      'City removed.',
    ),
  reorderCities: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await destinationsService.reorderCities(
        auth(req),
        req.params.destinationId!,
        req.body.cityIds,
        context(req),
      ),
      'Cities reordered.',
    ),
  imageUpload: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await destinationsService.createImageUpload(auth(req), req.params.destinationId!, req.body),
      'Destination image upload authorized.',
      201,
    ),
  imageConfirm: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await destinationsService.confirmImage(auth(req), req.params.destinationId!, context(req)),
      'Destination image confirmed.',
    ),
  imageDownload: async (req: Request, res: Response) =>
    sendSuccess(res, await destinationsService.imageDownload(auth(req), req.params.destinationId!)),
  imageDelete: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await destinationsService.deleteImage(auth(req), req.params.destinationId!, context(req)),
      'Destination image deleted.',
    ),
};

export const hotelsController = {
  list: async (req: Request, res: Response) =>
    sendSuccess(res, await hotelsService.list(auth(req), req.query)),
  lookups: async (req: Request, res: Response) =>
    sendSuccess(res, await hotelsService.lookups(auth(req), req.query)),
  details: async (req: Request, res: Response) =>
    sendSuccess(res, await hotelsService.details(auth(req), req.params.hotelId!)),
  create: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await hotelsService.create(auth(req), req.body, context(req)),
      'Hotel created.',
      201,
    ),
  update: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await hotelsService.update(auth(req), req.params.hotelId!, req.body, context(req)),
      'Hotel updated.',
    ),
  status: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await hotelsService.status(auth(req), req.params.hotelId!, req.body.status, context(req)),
      'Hotel status updated.',
    ),
  archive: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await hotelsService.archive(auth(req), req.params.hotelId!, context(req)),
      'Hotel archived.',
    ),
  createRoomType: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await hotelsService.createRoomType(auth(req), req.params.hotelId!, req.body, context(req)),
      'Room type created.',
      201,
    ),
  updateRoomType: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await hotelsService.updateRoomType(
        auth(req),
        req.params.hotelId!,
        req.params.roomTypeId!,
        req.body,
        context(req),
      ),
      'Room type updated.',
    ),
  createMealPlan: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await hotelsService.createMealPlan(auth(req), req.params.hotelId!, req.body, context(req)),
      'Meal plan created.',
      201,
    ),
  updateMealPlan: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await hotelsService.updateMealPlan(
        auth(req),
        req.params.hotelId!,
        req.params.mealPlanId!,
        req.body,
        context(req),
      ),
      'Meal plan updated.',
    ),
  imageUpload: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await hotelsService.createImageUpload(auth(req), req.params.hotelId!, req.body),
      'Hotel image upload authorized.',
      201,
    ),
  imageConfirm: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await hotelsService.confirmImage(auth(req), req.params.hotelId!, context(req)),
      'Hotel image confirmed.',
    ),
  imageDownload: async (req: Request, res: Response) =>
    sendSuccess(res, await hotelsService.imageDownload(auth(req), req.params.hotelId!)),
  imageDelete: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await hotelsService.deleteImage(auth(req), req.params.hotelId!, context(req)),
      'Hotel image deleted.',
    ),
};

export const airlinesController = {
  list: async (req: Request, res: Response) =>
    sendSuccess(res, await airlinesService.list(auth(req), req.query)),
  lookups: async (req: Request, res: Response) =>
    sendSuccess(res, await airlinesService.lookups(auth(req), req.query)),
  details: async (req: Request, res: Response) =>
    sendSuccess(res, await airlinesService.details(auth(req), req.params.airlineId!)),
  create: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await airlinesService.create(auth(req), req.body, context(req)),
      'Airline created.',
      201,
    ),
  update: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await airlinesService.update(auth(req), req.params.airlineId!, req.body, context(req)),
      'Airline updated.',
    ),
  status: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await airlinesService.status(auth(req), req.params.airlineId!, req.body.status, context(req)),
      'Airline status updated.',
    ),
  archive: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await airlinesService.archive(auth(req), req.params.airlineId!, context(req)),
      'Airline archived.',
    ),
  logoUpload: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await airlinesService.createLogoUpload(auth(req), req.params.airlineId!, req.body),
      'Airline logo upload authorized.',
      201,
    ),
  logoConfirm: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await airlinesService.confirmLogo(auth(req), req.params.airlineId!, context(req)),
      'Airline logo confirmed.',
    ),
  logoDownload: async (req: Request, res: Response) =>
    sendSuccess(res, await airlinesService.logoDownload(auth(req), req.params.airlineId!)),
  logoDelete: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await airlinesService.deleteLogo(auth(req), req.params.airlineId!, context(req)),
      'Airline logo deleted.',
    ),
};

export const cruisesController = {
  list: async (req: Request, res: Response) =>
    sendSuccess(res, await cruisesService.list(auth(req), req.query)),
  lookups: async (req: Request, res: Response) =>
    sendSuccess(res, await cruisesService.lookups(auth(req), req.query)),
  details: async (req: Request, res: Response) =>
    sendSuccess(res, await cruisesService.details(auth(req), req.params.cruiseId!)),
  create: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await cruisesService.create(auth(req), req.body, context(req)),
      'Cruise created.',
      201,
    ),
  update: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await cruisesService.update(auth(req), req.params.cruiseId!, req.body, context(req)),
      'Cruise updated.',
    ),
  status: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await cruisesService.status(auth(req), req.params.cruiseId!, req.body.status, context(req)),
      'Cruise status updated.',
    ),
  archive: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await cruisesService.archive(auth(req), req.params.cruiseId!, context(req)),
      'Cruise archived.',
    ),
  imageUpload: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await cruisesService.createImageUpload(auth(req), req.params.cruiseId!, req.body),
      'Cruise image upload authorized.',
      201,
    ),
  imageConfirm: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await cruisesService.confirmImage(auth(req), req.params.cruiseId!, context(req)),
      'Cruise image confirmed.',
    ),
  imageDownload: async (req: Request, res: Response) =>
    sendSuccess(res, await cruisesService.imageDownload(auth(req), req.params.cruiseId!)),
  imageDelete: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await cruisesService.deleteImage(auth(req), req.params.cruiseId!, context(req)),
      'Cruise image deleted.',
    ),
};

export const vehiclesController = {
  list: async (req: Request, res: Response) =>
    sendSuccess(res, await vehiclesService.list(auth(req), req.query)),
  types: async (req: Request, res: Response) =>
    sendSuccess(res, await vehiclesService.types(auth(req))),
  lookups: async (req: Request, res: Response) =>
    sendSuccess(res, await vehiclesService.lookups(auth(req), req.query)),
  details: async (req: Request, res: Response) =>
    sendSuccess(res, await vehiclesService.details(auth(req), req.params.vehicleId!)),
  create: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await vehiclesService.create(auth(req), req.body, context(req)),
      'Vehicle created.',
      201,
    ),
  update: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await vehiclesService.update(auth(req), req.params.vehicleId!, req.body, context(req)),
      'Vehicle updated.',
    ),
  status: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await vehiclesService.status(auth(req), req.params.vehicleId!, req.body.status, context(req)),
      'Vehicle status updated.',
    ),
  archive: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await vehiclesService.archive(auth(req), req.params.vehicleId!, context(req)),
      'Vehicle archived.',
    ),
  imageUpload: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await vehiclesService.createImageUpload(auth(req), req.params.vehicleId!, req.body),
      'Vehicle image upload authorized.',
      201,
    ),
  imageConfirm: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await vehiclesService.confirmImage(auth(req), req.params.vehicleId!, context(req)),
      'Vehicle image confirmed.',
    ),
  imageDownload: async (req: Request, res: Response) =>
    sendSuccess(res, await vehiclesService.imageDownload(auth(req), req.params.vehicleId!)),
  imageDelete: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await vehiclesService.deleteImage(auth(req), req.params.vehicleId!, context(req)),
      'Vehicle image deleted.',
    ),
};

export const sightseeingController = {
  list: async (req: Request, res: Response) =>
    sendSuccess(res, await sightseeingService.list(auth(req), req.query)),
  summary: async (req: Request, res: Response) =>
    sendSuccess(res, await sightseeingService.summary(auth(req))),
  lookups: async (req: Request, res: Response) =>
    sendSuccess(res, await sightseeingService.lookups(auth(req), req.query)),
  details: async (req: Request, res: Response) =>
    sendSuccess(res, await sightseeingService.details(auth(req), req.params.sightseeingId!)),
  create: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await sightseeingService.create(auth(req), req.body, context(req)),
      'Sightseeing created.',
      201,
    ),
  update: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await sightseeingService.update(auth(req), req.params.sightseeingId!, req.body, context(req)),
      'Sightseeing updated.',
    ),
  reorder: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await sightseeingService.reorder(
        auth(req),
        req.params.sightseeingId!,
        req.body.direction,
        context(req),
      ),
      'Sightseeing reordered.',
    ),
  status: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await sightseeingService.status(
        auth(req),
        req.params.sightseeingId!,
        req.body.status,
        context(req),
      ),
      'Sightseeing status updated.',
    ),
  archive: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await sightseeingService.archive(auth(req), req.params.sightseeingId!, context(req)),
      'Sightseeing archived.',
    ),
  imageUpload: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await sightseeingService.createImageUpload(auth(req), req.params.sightseeingId!, req.body),
      'Sightseeing image upload authorized.',
      201,
    ),
  imageConfirm: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await sightseeingService.confirmImage(auth(req), req.params.sightseeingId!, context(req)),
      'Sightseeing image confirmed.',
    ),
  imageDownload: async (req: Request, res: Response) =>
    sendSuccess(res, await sightseeingService.imageDownload(auth(req), req.params.sightseeingId!)),
  imageDelete: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await sightseeingService.deleteImage(auth(req), req.params.sightseeingId!, context(req)),
      'Sightseeing image deleted.',
    ),
};

export const addOnServicesController = {
  list: async (req: Request, res: Response) =>
    sendSuccess(res, await addOnServicesService.list(auth(req), req.query)),
  lookups: async (req: Request, res: Response) =>
    sendSuccess(res, await addOnServicesService.lookups(auth(req), req.query)),
  details: async (req: Request, res: Response) =>
    sendSuccess(res, await addOnServicesService.details(auth(req), req.params.addOnServiceId!)),
  create: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await addOnServicesService.create(auth(req), req.body, context(req)),
      'Add-on service created.',
      201,
    ),
  update: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await addOnServicesService.update(
        auth(req),
        req.params.addOnServiceId!,
        req.body,
        context(req),
      ),
      'Add-on service updated.',
    ),
  status: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await addOnServicesService.status(
        auth(req),
        req.params.addOnServiceId!,
        req.body.status,
        context(req),
      ),
      'Add-on service status updated.',
    ),
  archive: async (req: Request, res: Response) =>
    sendSuccess(
      res,
      await addOnServicesService.archive(auth(req), req.params.addOnServiceId!, context(req)),
      'Add-on service archived.',
    ),
};

import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { citiesService, destinationsService } from './masters.service.js';
import { hotelsService } from './hotels.service.js';
import { airlinesService } from './airlines.service.js';

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
    sendSuccess(res, await hotelsService.create(auth(req), req.body, context(req)), 'Hotel created.', 201),
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

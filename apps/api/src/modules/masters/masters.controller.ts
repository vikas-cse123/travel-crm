import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { citiesService, destinationsService } from './masters.service.js';

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

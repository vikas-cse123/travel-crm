import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError } from '../../utils/errors.js';
import { searchService } from './search.service.js';

const auth = (req: Request) => {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
};

export const searchController = {
  async flights(req: Request, res: Response) {
    auth(req);
    sendSuccess(
      res,
      await searchService.flights(req.query as never),
      'Flight search completed.',
    );
  },

  async hotels(req: Request, res: Response) {
    auth(req);
    sendSuccess(
      res,
      await searchService.hotels(req.query as never),
      'Hotel search completed.',
    );
  },

  async hotelsAutocomplete(req: Request, res: Response) {
    auth(req);
    sendSuccess(
      res,
      await searchService.hotelsAutocomplete(req.query as never),
      'Destination suggestions loaded.',
    );
  },
};

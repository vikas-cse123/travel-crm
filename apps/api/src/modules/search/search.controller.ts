import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError, ValidationError } from '../../utils/errors.js';
import { searchService } from './search.service.js';
import { bookmarksService } from './bookmarks.service.js';
import {
  hasServerFallbackKey,
  removeSearchApiKey,
  resolveSearchApiKey,
  saveSearchApiKey,
  searchApiKeyPreview,
} from './search-keys.service.js';

const auth = (req: Request) => {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
};

/** Resolve the key for the current user, or report that none is configured. */
async function requireSearchApiKey(req: Request): Promise<string> {
  const userKey = await resolveSearchApiKey(auth(req));
  if (!userKey) {
    throw new ValidationError('Add your SearchAPI key to use Live Search.');
  }
  return userKey;
}

export const searchController = {
  async flights(req: Request, res: Response) {
    const apiKey = await requireSearchApiKey(req);
    sendSuccess(
      res,
      await searchService.flights(apiKey, req.query as never),
      'Flight search completed.',
    );
  },

  async hotels(req: Request, res: Response) {
    const apiKey = await requireSearchApiKey(req);
    sendSuccess(
      res,
      await searchService.hotels(apiKey, req.query as never),
      'Hotel search completed.',
    );
  },

  async hotelsAutocomplete(req: Request, res: Response) {
    const apiKey = await requireSearchApiKey(req);
    sendSuccess(
      res,
      await searchService.hotelsAutocomplete(apiKey, req.query as never),
      'Destination suggestions loaded.',
    );
  },

  /** Current user's Live Search key status (masked preview only). */
  async keyStatus(req: Request, res: Response) {
    const actor = auth(req);
    const masked = await searchApiKeyPreview(actor);
    sendSuccess(res, {
      hasKey: Boolean(masked),
      maskedKey: masked,
      serverFallbackAvailable: hasServerFallbackKey(),
    });
  },

  /** Save (or replace) the current user's SearchAPI key. */
  async saveKey(req: Request, res: Response) {
    const actor = auth(req);
    const body = req.body as { apiKey?: unknown };
    if (typeof body.apiKey !== 'string' || !body.apiKey.trim()) {
      throw new ValidationError('A SearchAPI API key is required.');
    }
    const masked = await saveSearchApiKey(actor, body.apiKey);
    sendSuccess(res, { hasKey: true, maskedKey: masked });
  },

  /** Remove the current user's SearchAPI key. */
  async removeKey(req: Request, res: Response) {
    await removeSearchApiKey(auth(req));
    sendSuccess(res, { hasKey: false, maskedKey: null });
  },

  /**
   * Test the current user's saved key (or a key provided for this request only).
   * Never returns the secret itself.
   */
  async testKey(req: Request, res: Response) {
    const actor = auth(req);
    const body = req.body as { apiKey?: unknown };
    let candidate: string | null = null;
    if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
      candidate = body.apiKey.trim();
    } else {
      candidate = await resolveSearchApiKey(actor);
    }
    if (!candidate) {
      throw new ValidationError('Add your SearchAPI key to test the connection.');
    }

    const result = await searchService.testConnection(candidate);
    if (result.ok) {
      sendSuccess(res, { connected: true });
      return;
    }
    if (result.reason === 'quota') {
      sendSuccess(res, { connected: false, reason: 'quota' });
      return;
    }
    sendSuccess(res, { connected: false, reason: 'invalid' });
  },

  /** List the current user's bookmarks (DB only; never calls SearchAPI). */
  async listBookmarks(req: Request, res: Response) {
    const type = (req.query.type as 'FLIGHT' | 'HOTEL' | undefined) ?? undefined;
    sendSuccess(res, await bookmarksService.list(auth(req), type));
  },

  /** Create a bookmark from an already-cached result (no SearchAPI call). */
  async createBookmark(req: Request, res: Response) {
    const result = await bookmarksService.create(auth(req), req.body as never);
    sendSuccess(res, result, result.created ? 'Bookmark saved.' : 'Already bookmarked.');
  },

  /** Fetch one bookmark (DB only). */
  async getBookmark(req: Request, res: Response) {
    sendSuccess(res, await bookmarksService.get(auth(req), req.params.id as string));
  },

  /** Look up a bookmark by its public code (DB only; company-scoped). */
  async getBookmarkByCode(req: Request, res: Response) {
    sendSuccess(res, await bookmarksService.getByCode(auth(req), req.params.bookmarkCode as string));
  },

  /** Delete the current user's bookmark (DB only). */
  async deleteBookmark(req: Request, res: Response) {
    await bookmarksService.remove(auth(req), req.params.id as string);
    sendSuccess(res, { deleted: true });
  },
};

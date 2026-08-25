import type { Request, Response } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { UnauthorizedError, ValidationError } from '../../utils/errors.js';
import { searchService } from './search.service.js';
import { bookmarksService } from './bookmarks.service.js';
import {
  addSearchApiKey,
  hasServerFallbackKey,
  lastFour,
  listSearchApiKeys,
  removeSearchApiKey,
  resolveSearchApiKeys,
  updateSearchApiKey,
} from './search-keys.service.js';
import {
  recordSearchApiUsage,
  searchUsageSummary,
  searchUsageUserDetail,
} from './search-usage.service.js';
import type { SearchApiUsageStatus, SearchUsageRange } from '@interscale/shared';

const auth = (req: Request) => {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
};

export const searchController = {
  async flights(req: Request, res: Response) {
    sendSuccess(
      res,
      await searchService.flights(auth(req), req.query as never),
      'Flight search completed.',
    );
  },

  async hotels(req: Request, res: Response) {
    sendSuccess(
      res,
      await searchService.hotels(auth(req), req.query as never),
      'Hotel search completed.',
    );
  },

  async hotelsAutocomplete(req: Request, res: Response) {
    sendSuccess(
      res,
      await searchService.hotelsAutocomplete(auth(req), req.query as never),
      'Destination suggestions loaded.',
    );
  },

  /** Room/offer details for one hotel property (google_hotels_property). */
  async hotelsProperty(req: Request, res: Response) {
    sendSuccess(
      res,
      await searchService.hotelsProperty(auth(req), req.query as never),
      'Hotel room offers loaded.',
    );
  },

  /** The current user's saved SearchAPI keys (masked previews only). */
  async listKeys(req: Request, res: Response) {
    const actor = auth(req);
    sendSuccess(res, {
      keys: await listSearchApiKeys(actor),
      serverFallbackAvailable: hasServerFallbackKey(),
    });
  },

  /** Add another SearchAPI key for the current user. */
  async addKey(req: Request, res: Response) {
    const actor = auth(req);
    const body = req.body as { apiKey?: unknown };
    if (typeof body.apiKey !== 'string' || !body.apiKey.trim()) {
      throw new ValidationError('A SearchAPI API key is required.');
    }
    const key = await addSearchApiKey(actor, body.apiKey);
    sendSuccess(res, { key, keys: await listSearchApiKeys(actor) }, 'API key saved.');
  },

  /** Remove one of the current user's SearchAPI keys. */
  async removeKey(req: Request, res: Response) {
    const actor = auth(req);
    await removeSearchApiKey(actor, req.params.keyId as string);
    sendSuccess(res, { keys: await listSearchApiKeys(actor) }, 'API key removed.');
  },

  /** Enable/disable a key or change its priority (order). */
  async updateKey(req: Request, res: Response) {
    const actor = auth(req);
    const body = req.body as { status?: 'ACTIVE' | 'DISABLED'; priority?: number };
    const key = await updateSearchApiKey(actor, req.params.keyId as string, body);
    sendSuccess(res, { key, keys: await listSearchApiKeys(actor) }, 'API key updated.');
  },

  /**
   * Test the current user's saved key (or a key provided for this request only).
   * Never returns the secret itself. Records the actual provider request so the
   * Owner dashboard sees test-connection credit use too.
   */
  async testKey(req: Request, res: Response) {
    const actor = auth(req);
    const body = req.body as { apiKey?: unknown };
    let candidate: string | null = null;
    if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
      candidate = body.apiKey.trim();
    } else {
      const keys = await resolveSearchApiKeys(actor);
      candidate = keys[0]?.plaintext ?? null;
    }
    if (!candidate) {
      throw new ValidationError('Add your SearchAPI key to test the connection.');
    }

    const result = await searchService.testConnection(candidate);
    const status: SearchApiUsageStatus = result.ok
      ? 'SUCCESS'
      : result.reason === 'quota'
        ? 'QUOTA_EXHAUSTED'
        : result.reason === 'invalid'
          ? 'INVALID_KEY'
          : 'NETWORK_ERROR';
    await recordSearchApiUsage(actor, {
      type: 'AUTOCOMPLETE',
      engine: 'google_hotels_autocomplete',
      status,
      isFallbackAttempt: false,
      searchApiKeyId: null,
      maskedKeySuffix: lastFour(candidate),
    });

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
    sendSuccess(
      res,
      await bookmarksService.getByCode(auth(req), req.params.bookmarkCode as string),
    );
  },

  /** Delete the current user's bookmark (DB only). */
  async deleteBookmark(req: Request, res: Response) {
    await bookmarksService.remove(auth(req), req.params.id as string);
    sendSuccess(res, { deleted: true });
  },

  /** Owner-only aggregated SearchAPI usage. */
  async usageSummary(req: Request, res: Response) {
    const actor = auth(req);
    const range = req.query as SearchUsageRange;
    sendSuccess(res, await searchUsageSummary(actor, range));
  },

  /** Owner-only per-user SearchAPI usage detail. */
  async usageUserDetail(req: Request, res: Response) {
    const actor = auth(req);
    const range = req.query as SearchUsageRange;
    sendSuccess(res, await searchUsageUserDetail(actor, req.params.userId as string, range));
  },
};

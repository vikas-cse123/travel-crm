/** Product identity. */
export const APP_NAME = 'Interscale Travel CRM';

/** Default local development ports. */
export const DEFAULT_API_PORT = 4000;
export const DEFAULT_WEB_PORT = 5173;

/** Prefix every HTTP route is mounted under. */
export const API_PREFIX = '/api';

/**
 * Header carrying the per-request correlation id. The API always echoes it
 * back so a browser error can be traced to a single server log line.
 */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Server-side pagination defaults, used from Phase 4 onward. */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

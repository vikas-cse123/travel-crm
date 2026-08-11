import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { API_PREFIX } from '@interscale/shared';
import { env, isProduction, isTest } from './config/env.js';
import { logger } from './config/logger.js';
import { requestId } from './middleware/request-id.js';
import { globalLimiter } from './middleware/rate-limiters.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { verifyCsrfToken, verifyOrigin } from './middleware/csrf.js';
import { resolveCustomDomainMiddleware, validateRequestHost } from './middleware/custom-domain.js';
import { isTrustedOriginHostname } from './modules/custom-domains/custom-domain.service.js';
import { apiRoutes } from './routes.js';
import { publicQuotationsRoutes } from './modules/quotations/public-quotations.routes.js';

export function redactSensitiveRequestUrl(url: string | undefined): string | undefined {
  return url?.replace(/(\/public\/quotations\/)[^/?]+/, '$1[redacted]');
}

export function createApp(): Express {
  const app = express();

  // Behind a load balancer this is what makes req.ip (and rate limiting) honest.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestId);

  app.use(
    helmet({
      // The API serves JSON only; CSP is enforced by the web app's host.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  // Credentials are on, so the origin must be an explicit allow-list. The
  // platform's own hosts plus any ACTIVE custom domain (Phase 1 resolver) are
  // trusted; everything else gets no CORS headers. No wildcard origins.
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          callback(null, false);
          return;
        }
        let hostname: string | null = null;
        try {
          hostname = new URL(origin).hostname;
        } catch {
          hostname = null;
        }
        isTrustedOriginHostname(hostname ?? '')
          .then((allowed) => callback(null, allowed))
          .catch(() => callback(null, false));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Request-Id', 'X-CSRF-Token'],
      exposedHeaders: ['X-Request-Id'],
    }),
  );

  // Body-size caps blunt trivial memory-exhaustion attempts. The bulk lead CSV
  // import sends up to 2000 mapped rows in one request, so it gets its own
  // larger JSON cap; the default cap stays for every other endpoint.
  app.use(`${API_PREFIX}/queries/import`, express.json({ limit: '2mb' }));
  // Stylish quotation generation may include one transient cover image as a
  // data URL. Keep the larger allowance scoped to this exact endpoint shape.
  app.use(
    /^\/api\/quotations\/[^/]+\/versions\/[^/]+\/generate-pdf$/,
    express.json({ limit: '8mb' }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));
  app.use(cookieParser(env.SESSION_SECRET));

  if (!isTest) {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => req.id as string,
        serializers: {
          req: (request) => ({
            ...request,
            url: redactSensitiveRequestUrl(request.url),
          }),
        },
        autoLogging: { ignore: (req) => req.url === `${API_PREFIX}/health` },
        customLogLevel: (_req, res, err) => {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
      }),
    );
  }

  app.use(globalLimiter);

  // Custom-domain context: attach the ACTIVE hostname→company mapping for the
  // request host, if any. Reserved platform hostnames and unknown hosts attach
  // nothing. Runs before origin/CSRF/routes so authenticated routes can compare
  // the domain tenant against the session tenant.
  app.use(resolveCustomDomainMiddleware);

  // Host validation: only platform hosts and ACTIVE custom domains may reach
  // the application (dynamic ALB routing accepts any host). Unknown/PENDING/
  // DISABLED hosts are rejected; internal health-check paths are exempt.
  app.use(validateRequestHost);

  // Origin validation covers every state-changing request. Public quotation
  // decisions additionally require their unguessable customer token and are
  // deliberately session-independent, even when a staff session cookie is
  // present in the browser. Authenticated API routes retain full CSRF checks.
  app.use(verifyOrigin);
  app.use(`${API_PREFIX}/public/quotations`, publicQuotationsRoutes);
  app.use(verifyCsrfToken);
  app.use(API_PREFIX, apiRoutes);

  // Order matters: unmatched routes, then the terminal error handler.
  app.use(notFoundHandler);
  app.use(errorHandler);

  logger.debug({ environment: env.NODE_ENV, production: isProduction }, 'Express app created');

  return app;
}

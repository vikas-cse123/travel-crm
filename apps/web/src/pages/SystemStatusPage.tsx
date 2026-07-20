import { Plane } from 'lucide-react';
import { APP_NAME } from '@interscale/shared';
import { useApiHealth, useDatabaseHealth } from '@/api/health';
import { SystemStatusCard } from '@/components/feedback/SystemStatusCard';

/**
 * Phase 1 landing page.
 *
 * Its purpose is verification, not product: it exercises the full stack —
 * React → TanStack Query → typed fetch client → Vite proxy → Express →
 * Prisma → PostgreSQL — and renders loading/error/success states.
 *
 * Phase 3 replaces this route with the real /login and /dashboard flow.
 */
export function SystemStatusPage() {
  const api = useApiHealth();
  const db = useDatabaseHealth();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <header className="mb-8 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white">
          <Plane className="h-6 w-6" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{APP_NAME}</h1>
          <p className="text-sm text-slate-500">
            Phase 1 — foundation. Authentication and CRM modules are not built yet.
          </p>
        </div>
      </header>

      <div className="space-y-4">
        <SystemStatusCard
          title="API service"
          description="Express server liveness check — GET /api/health"
          isLoading={api.isPending}
          isError={api.isError}
          isHealthy={api.data?.status === 'ok'}
          errorMessage={api.error?.message}
          details={
            api.data
              ? [
                  { label: 'Service', value: api.data.service },
                  { label: 'Version', value: api.data.version },
                  { label: 'Environment', value: api.data.environment },
                  { label: 'Uptime', value: `${api.data.uptimeSeconds}s` },
                ]
              : undefined
          }
        />

        <SystemStatusCard
          title="PostgreSQL database"
          description="Live query round-trip via Prisma — GET /api/health/db"
          isLoading={db.isPending}
          isError={db.isError}
          isHealthy={db.data?.database === 'up'}
          errorMessage={db.error?.message ?? 'The database did not respond.'}
          details={
            db.data
              ? [
                  { label: 'Connection', value: db.data.database },
                  { label: 'Latency', value: `${db.data.latencyMs} ms` },
                ]
              : undefined
          }
        />
      </div>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <h2 className="text-sm font-semibold text-slate-900">Next phase</h2>
        <p className="mt-1 text-sm text-slate-600">
          Phase 2 defines the multi-tenant Prisma schema — companies, users, roles, permissions,
          permission templates, sessions, OTPs, password-reset tokens and activity logs.
        </p>
      </section>
    </main>
  );
}

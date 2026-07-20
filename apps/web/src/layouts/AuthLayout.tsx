import { Plane } from 'lucide-react';
import { APP_NAME } from '@interscale/shared';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Centred card shell for every unauthenticated screen.
 *
 * `main` is the single landmark and the heading is the page's only h1, so the
 * document outline stays correct across all five auth routes.
 */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:py-16">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
              <Plane className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-base font-semibold tracking-tight text-slate-900">
              {APP_NAME}
            </span>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-slate-600">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>

          {footer && <div className="mt-5 text-center text-sm text-slate-600">{footer}</div>}
        </div>
      </main>

      <footer className="pb-6 text-center text-xs text-slate-400">
        Built for travel agencies · {APP_NAME}
      </footer>
    </div>
  );
}

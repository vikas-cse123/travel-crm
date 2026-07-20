import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';

interface SystemStatusCardProps {
  title: string;
  description: string;
  isLoading: boolean;
  isError: boolean;
  isHealthy: boolean;
  errorMessage?: string | undefined;
  details?: Array<{ label: string; value: string }> | undefined;
}

/**
 * Renders the three states every data-backed surface in this app must handle:
 * loading, error and success. Used on the status page to prove the wiring.
 */
export function SystemStatusCard({
  title,
  description,
  isLoading,
  isError,
  isHealthy,
  errorMessage,
  details,
}: SystemStatusCardProps) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
        {isLoading ? (
          <StatusBadge tone="neutral">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            Checking
          </StatusBadge>
        ) : isError || !isHealthy ? (
          <StatusBadge tone="danger">
            <XCircle className="h-3 w-3" aria-hidden="true" />
            Unavailable
          </StatusBadge>
        ) : (
          <StatusBadge tone="success">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            Healthy
          </StatusBadge>
        )}
      </CardHeader>

      <CardBody>
        {isLoading && (
          <div className="space-y-2" aria-hidden="true">
            <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
          </div>
        )}

        {!isLoading && (isError || !isHealthy) && (
          <p role="alert" className="text-sm text-red-700">
            {errorMessage ?? 'The check did not succeed.'}
          </p>
        )}

        {!isLoading && !isError && isHealthy && details && (
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {details.map((item) => (
              <div key={item.label} className="flex justify-between gap-4 text-sm">
                <dt className="text-slate-500">{item.label}</dt>
                <dd className="font-medium text-slate-900">{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </CardBody>
    </Card>
  );
}

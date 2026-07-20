import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { QueryInput } from '@interscale/shared';
import { LeadForm } from '@/features/queries/LeadForm';
import { useLead, useSaveLead } from '@/features/queries/queries.api';
import { ApiError } from '@/api/client';

export function LeadFormPage() {
  const { queryId } = useParams();
  const navigate = useNavigate();
  const lead = useLead(queryId);
  const save = useSaveLead(queryId);
  if (queryId && lead.isLoading) return <div className="h-96 animate-pulse rounded-xl bg-white" />;
  if (queryId && lead.isError)
    return (
      <div className="rounded-xl bg-white p-10 text-center">
        <h1 className="text-xl font-semibold">Lead unavailable</h1>
        <p className="mt-2 text-slate-500">
          It may not exist or may be outside your visibility scope.
        </p>
      </div>
    );
  const submit = (value: QueryInput) =>
    save.mutate(value, { onSuccess: (result) => navigate(`/queries/${result.id}`) });
  const error =
    save.error instanceof ApiError
      ? save.error.message
      : save.isError
        ? 'The lead could not be saved.'
        : undefined;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          to={queryId ? `/queries/${queryId}` : '/queries'}
          className="rounded-lg p-2 hover:bg-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <p className="text-sm text-slate-500">
            Leads / {queryId ? lead.data?.queryNumber : 'New'}
          </p>
          <h1 className="text-2xl font-semibold">{queryId ? 'Edit lead' : 'Create lead'}</h1>
        </div>
      </div>
      <LeadForm
        {...(lead.data ? { lead: lead.data } : {})}
        onSave={submit}
        saving={save.isPending}
        {...(error ? { error } : {})}
      />
    </div>
  );
}

import { useState } from 'react';
import { ArrowLeft, FilePlus2 } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useLeads } from '@/features/queries/queries.api';
import { useCreateQuotation } from '@/features/quotations/quotations.api';

const field = 'w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm';
export function NewQuotationPage() {
  const { queryId: routeQueryId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const leads = useLeads(new URLSearchParams({ pageSize: '100' }));
  const create = useCreateQuotation();
  const [queryId, setQueryId] = useState(routeQueryId ?? params.get('queryId') ?? '');
  const [templateId] = useState(params.get('templateId') ?? '');
  const submit = () =>
    create.mutate(
      {
        queryId,
        templateId: templateId || null,
      },
      { onSuccess: (quotation) => navigate(`/quotations/${quotation.id}`) },
    );
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex items-center gap-3">
        <Link
          to={routeQueryId ? `/queries/${routeQueryId}` : '/quotations'}
          className="rounded-lg p-2 hover:bg-card"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <p className="text-sm text-slate-500">Customer quotations</p>
          <h1 className="text-2xl font-semibold">Create quotation</h1>
        </div>
      </header>
      <section className="rounded-xl border bg-card p-6 shadow-sm">
        <h2 className="font-semibold">Choose the lead and starting point</h2>
        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium">
            Lead
            <select
              aria-label="Lead"
              className={`${field} mt-1`}
              value={queryId}
              onChange={(event) => setQueryId(event.target.value)}
              disabled={Boolean(routeQueryId)}
            >
              <option value="">Select a visible lead…</option>
              {leads.data?.data.map((lead) => (
                <option key={lead.id} value={lead.id}>
                  {lead.queryNumber} · {lead.customerName} · {lead.phone}
                </option>
              ))}
            </select>
          </label>
          {create.isError && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{create.error.message}</p>
          )}
          <Button fullWidth disabled={!queryId} isLoading={create.isPending} onClick={submit}>
            <FilePlus2 className="h-4 w-4" />
            Create draft quotation
          </Button>
        </div>
      </section>
    </div>
  );
}

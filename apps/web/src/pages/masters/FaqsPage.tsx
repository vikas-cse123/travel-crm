import { Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useArchiveFaq, useFaqs } from '@/features/masters/masters.api';
import { formatMasterDate, MasterHeader, Pagination, StatusBadge } from './MasterUi';

export function FaqsPage() {
  const [params, setParams] = useSearchParams();
  const faqs = useFaqs(params);
  const archive = useArchiveFaq();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.MASTER_FAQS_CREATE);
  const canUpdate = hasPermission(PERMISSIONS.MASTER_FAQS_UPDATE);
  const canArchive = hasPermission(PERMISSIONS.MASTER_FAQS_DELETE);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };

  const archiveRow = (id: string) => {
    if (window.confirm('Are you sure you want to delete this FAQ?')) archive.mutate(id);
  };

  const data = faqs.data;
  const rows = data?.data ?? [];
  const pagination = data?.pagination ?? { page: 1, pageSize: 10, total: 0, totalPages: 0 };

  return (
    <div className="space-y-5">
      <MasterHeader
        title="FAQ Master"
        description="Reusable questions and answers, optionally tied to a destination, that can appear on quotation weblinks."
        current="FAQs"
        action={
          canCreate ? (
            <Link to="/masters/faqs/new">
              <Button>
                <Plus className="h-4 w-4" /> Add New FAQ
              </Button>
            </Link>
          ) : undefined
        }
      />

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(0,1fr)_200px]">
          <label className="relative">
            <span className="sr-only">Search FAQs</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Search FAQs"
              placeholder="Search question, answer or destination…"
              className="w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm"
              value={params.get('search') ?? ''}
              onChange={(event) => update('search', event.target.value)}
            />
          </label>
          {canUpdate ? (
            <select
              aria-label="FAQ status"
              className="rounded-lg border px-3 py-2.5 text-sm"
              value={params.get('status') ?? ''}
              onChange={(event) => update('status', event.target.value)}
            >
              <option value="">Current statuses</option>
              <option>ACTIVE</option>
              <option>INACTIVE</option>
              <option>ARCHIVED</option>
            </select>
          ) : (
            <div />
          )}
        </div>

        {faqs.isPending ? (
          <div className="h-64 animate-pulse bg-slate-100" />
        ) : faqs.isError ? (
          <div role="alert" className="p-8 text-center text-red-700">
            FAQs could not be loaded.
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <h2 className="font-semibold">No FAQs found</h2>
            <p className="text-sm text-slate-500">Adjust the filters or add the first FAQ.</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-muted text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <tr>
                    {['Question', 'Destination', 'Status', 'Created', 'Actions'].map((heading) => (
                      <th key={heading} className="px-4 py-3">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((faq) => (
                    <tr key={faq.id} className="hover:bg-slate-50">
                      <td className="max-w-[360px] px-4 py-3 font-semibold text-slate-900">
                        <span className="block truncate">{faq.question}</span>
                      </td>
                      <td className="px-4 py-3">
                        {faq.destinations?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {faq.destinations.slice(0, 2).map((d) => (
                              <span
                                key={d}
                                className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                              >
                                {d}
                              </span>
                            ))}
                            {faq.destinations.length > 2 && (
                              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                                +{faq.destinations.length - 2}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">All destinations</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={faq.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {formatMasterDate(faq.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Link
                            aria-label={`View ${faq.question}`}
                            to={`/masters/faqs/${faq.id}`}
                            className="rounded bg-cyan-600 p-2 text-white"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          {canUpdate && faq.status !== 'ARCHIVED' && (
                            <Link
                              aria-label={`Edit ${faq.question}`}
                              to={`/masters/faqs/${faq.id}/edit`}
                              className="rounded bg-brand-600 p-2 text-white"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                          )}
                          {canArchive && faq.status !== 'ARCHIVED' && (
                            <button
                              aria-label={`Archive ${faq.question}`}
                              onClick={() => archiveRow(faq.id)}
                              className="rounded bg-red-600 p-2 text-white"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y md:hidden">
              {rows.map((faq) => (
                <article key={faq.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold">{faq.question}</h2>
                    <StatusBadge value={faq.status} />
                  </div>
                  <p className="text-xs font-medium text-amber-700">
                    {faq.destinations?.length ? faq.destinations.join(', ') : 'All destinations'}
                  </p>
                  <div className="flex gap-2">
                    <Link to={`/masters/faqs/${faq.id}`}>
                      <Button variant="secondary">View</Button>
                    </Link>
                    {canUpdate && faq.status !== 'ARCHIVED' && (
                      <Link to={`/masters/faqs/${faq.id}/edit`}>
                        <Button variant="secondary">Edit</Button>
                      </Link>
                    )}
                    {canArchive && faq.status !== 'ARCHIVED' && (
                      <Button variant="danger" onClick={() => archiveRow(faq.id)}>
                        Archive
                      </Button>
                    )}
                  </div>
                </article>
              ))}
            </div>

            <Pagination
              page={pagination.page}
              pageSize={pagination.pageSize}
              totalPages={pagination.totalPages}
              total={pagination.total}
              onPage={(page) => update('page', String(page))}
            />
          </>
        )}
      </section>
    </div>
  );
}
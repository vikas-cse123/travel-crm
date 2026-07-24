import { Archive, Eye, MessageSquareQuote, Pencil, Plus, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useArchiveTestimonial, useTestimonials } from '@/features/masters/masters.api';
import { MasterHeader, Pagination, StatusBadge } from './MasterUi';

export function TestimonialsPage() {
  const [params, setParams] = useSearchParams();
  const testimonials = useTestimonials(params);
  const archive = useArchiveTestimonial();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission(PERMISSIONS.MASTER_TESTIMONIALS_CREATE);
  const canUpdate = hasPermission(PERMISSIONS.MASTER_TESTIMONIALS_UPDATE);
  const canArchive = hasPermission(PERMISSIONS.MASTER_TESTIMONIALS_DELETE);
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };
  const archiveRow = (id: string, name: string) => {
    if (window.confirm(`Archive testimonial from ${name}?`)) archive.mutate(id);
  };
  const label = (name: string | null) => name?.trim() || 'Anonymous';

  return (
    <div className="space-y-5">
      <MasterHeader
        title="Testimonials"
        description="Manage customer testimonials and reviews."
        current="Testimonials"
        action={
          canCreate ? (
            <Link to="/masters/testimonials/new">
              <Button>
                <Plus className="h-4 w-4" /> Add New Testimonial
              </Button>
            </Link>
          ) : undefined
        }
      />
      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(0,1fr)_160px]">
          <label className="relative">
            <span className="sr-only">Search testimonials</span>
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search testimonials"
              placeholder="Search client, destination or text…"
              className="w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm"
              value={params.get('search') ?? ''}
              onChange={(event) => update('search', event.target.value)}
            />
          </label>
          {canUpdate ? (
            <select
              aria-label="Testimonial status"
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
        {testimonials.isPending ? (
          <div className="h-72 animate-pulse bg-slate-100" />
        ) : testimonials.isError ? (
          <div role="alert" className="p-8 text-center text-red-700">
            Testimonials could not be loaded.
          </div>
        ) : !testimonials.data?.data.length ? (
          <div className="p-12 text-center">
            <MessageSquareQuote className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-3 font-semibold">No testimonials found</h2>
            <p className="text-sm text-slate-500">Start by adding your first testimonial.</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-900 text-xs uppercase tracking-wide text-white">
                  <tr>
                    {['Client', 'Destination', 'Testimonial', 'Visible', 'Status', 'Actions'].map(
                      (heading) => (
                        <th key={heading} className="px-4 py-3">
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {testimonials.data.data.map((testimonial) => (
                    <tr key={testimonial.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        {label(testimonial.clientName)}
                      </td>
                      <td className="px-4 py-3">{testimonial.destinationName}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-slate-600">
                        {testimonial.description}
                      </td>
                      <td className="px-4 py-3">
                        {testimonial.isVisible ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                            Visible
                          </span>
                        ) : (
                          <span className="text-slate-400">Hidden</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={testimonial.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Link
                            aria-label={`View testimonial from ${label(testimonial.clientName)}`}
                            to={`/masters/testimonials/${testimonial.id}`}
                            className="rounded bg-cyan-600 p-2 text-white"
                          >
                            <Eye className="h-4 w-4" />
                          </Link>
                          {canUpdate && (
                            <Link
                              aria-label={`Edit testimonial from ${label(testimonial.clientName)}`}
                              to={`/masters/testimonials/${testimonial.id}/edit`}
                              className="rounded bg-brand-600 p-2 text-white"
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                          )}
                          {canArchive && testimonial.status !== 'ARCHIVED' && (
                            <button
                              aria-label={`Archive testimonial from ${label(testimonial.clientName)}`}
                              onClick={() =>
                                archiveRow(testimonial.id, label(testimonial.clientName))
                              }
                              className="rounded bg-red-600 p-2 text-white"
                            >
                              <Archive className="h-4 w-4" />
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
              {testimonials.data.data.map((testimonial) => (
                <article key={testimonial.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="font-semibold">{label(testimonial.clientName)}</h2>
                      <p className="text-sm text-slate-500">{testimonial.destinationName}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                        {testimonial.description}
                      </p>
                    </div>
                    <StatusBadge value={testimonial.status} />
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/masters/testimonials/${testimonial.id}`}>
                      <Button variant="secondary">View</Button>
                    </Link>
                    {canUpdate && (
                      <Link to={`/masters/testimonials/${testimonial.id}/edit`}>
                        <Button variant="secondary">Edit</Button>
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
            <Pagination
              page={testimonials.data.pagination.page}
              totalPages={testimonials.data.pagination.totalPages}
              total={testimonials.data.pagination.total}
              onPage={(page) => update('page', String(page))}
            />
          </>
        )}
      </section>
    </div>
  );
}

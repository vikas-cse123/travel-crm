import { Copy, Eye, FilePlus2, Power, Search, Trash2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { labelForLookup, PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useQuotationTemplates, useTemplateAction } from '@/features/quotations/quotations.api';

const field = 'h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm';
export function QuotationTemplatesPage() {
  const { hasPermission } = useAuth();
  const [params, setParams] = useSearchParams();
  const list = useQuotationTemplates(params);
  const action = useTemplateAction();
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next);
  };
  const money = (value: string | null, currency: string) =>
    value
      ? new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(value))
      : '—';
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-brand-700">Reusable packages</p>
          <h1 className="text-2xl font-semibold">Quotation templates</h1>
          <p className="mt-1 text-sm text-slate-500">
            Build destination packages once, then tailor an immutable quotation for each lead.
          </p>
        </div>
        {hasPermission(PERMISSIONS.QUOTATION_TEMPLATES_CREATE) && (
          <Link to="/quotation-templates/new">
            <Button>
              <FilePlus2 className="h-4 w-4" />
              New template
            </Button>
          </Link>
        )}
      </header>
      <section className="rounded-xl border bg-white shadow-sm">
        <div className="grid gap-3 border-b p-4 md:grid-cols-4">
          <label className="relative md:col-span-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search templates"
              className={`${field} w-full pl-9`}
              placeholder="Code, package, destination, hotel or service…"
              value={params.get('search') ?? ''}
              onChange={(event) => update('search', event.target.value)}
            />
          </label>
          <input
            aria-label="Destination"
            className={field}
            placeholder="Destination"
            value={params.get('destination') ?? ''}
            onChange={(event) => update('destination', event.target.value)}
          />
          <select
            aria-label="Status"
            className={field}
            value={params.get('status') ?? ''}
            onChange={(event) => update('status', event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>
        {list.isLoading ? (
          <div className="h-72 animate-pulse bg-slate-50" />
        ) : list.isError ? (
          <div className="p-12 text-center text-red-700">
            Quotation templates could not be loaded.
          </div>
        ) : !list.data?.data.length ? (
          <div className="p-12 text-center">
            <h2 className="font-semibold">No templates yet</h2>
            <p className="mt-1 text-sm text-slate-500">
              Create a reusable package or adjust your filters.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    {[
                      'Template',
                      'Destination & cities',
                      'Duration',
                      'Base pricing',
                      'Usage',
                      'Created by',
                      'Status',
                      'Actions',
                    ].map((value) => (
                      <th key={value} className="px-4 py-3">
                        {value}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {list.data.data.map((template) => (
                    <tr key={template.id} className="align-top hover:bg-slate-50/60">
                      <td className="px-4 py-4">
                        <Link
                          className="font-semibold text-brand-700"
                          to={`/quotation-templates/${template.id}`}
                        >
                          {template.name}
                        </Link>
                        <p className="text-xs text-slate-500">{template.templateCode}</p>
                      </td>
                      <td className="px-4 py-4">
                        <strong>{template.destinationSummary}</strong>
                        <p className="mt-1 text-xs text-slate-500">
                          {template.cities?.join(' • ') || 'Cities defined in itinerary'}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        {template.durationNights} nights / {template.durationDays} days
                      </td>
                      <td className="px-4 py-4 text-xs">
                        <p>Adult: {money(template.adultBasePrice, template.baseCurrency)}</p>
                        <p>CWB: {money(template.childWithBedBasePrice, template.baseCurrency)}</p>
                        <p>
                          CWOB: {money(template.childWithoutBedBasePrice, template.baseCurrency)}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <span className="rounded-full bg-cyan-50 px-2 py-1 font-medium text-cyan-700">
                          {template.usageCount}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {template.createdBy.fullName}
                        <p className="text-xs text-slate-500">
                          {new Date(template.createdAt).toLocaleDateString()}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${template.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}
                        >
                          {labelForLookup(template.status)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex gap-1">
                          <Link title="Preview" to={`/quotation-templates/${template.id}`}>
                            <Button size="sm" variant="secondary">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          {template.actionPermissions?.canUpdate && (
                            <Button
                              title="Change status"
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                action.mutate({
                                  id: template.id,
                                  action: 'status',
                                  body: {
                                    status: template.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                                  },
                                })
                              }
                            >
                              <Power className="h-4 w-4" />
                            </Button>
                          )}
                          {hasPermission(PERMISSIONS.QUOTATION_TEMPLATES_CREATE) && (
                            <Button
                              title="Duplicate"
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                action.mutate({ id: template.id, action: 'duplicate' })
                              }
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          )}
                          {template.actionPermissions?.canDelete && (
                            <Button
                              title="Archive"
                              size="sm"
                              variant="danger"
                              onClick={() =>
                                window.confirm(`Archive ${template.name}?`) &&
                                action.mutate({ id: template.id, action: 'delete' })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-3 p-4 lg:hidden">
              {list.data.data.map((template) => (
                <article key={template.id} className="rounded-xl border p-4">
                  <div className="flex justify-between gap-3">
                    <div>
                      <Link
                        className="font-semibold text-brand-700"
                        to={`/quotation-templates/${template.id}`}
                      >
                        {template.name}
                      </Link>
                      <p className="text-xs text-slate-500">{template.templateCode}</p>
                    </div>
                    <span className="text-xs font-medium">{template.status}</span>
                  </div>
                  <p className="mt-3 text-sm">
                    {template.destinationSummary} · {template.durationNights}N/
                    {template.durationDays}D
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Used {template.usageCount} times · {template.createdBy.fullName}
                  </p>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

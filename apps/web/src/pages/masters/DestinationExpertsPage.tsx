import { Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useDeleteDestinationExpertPreset, useDestinationExpertPresets } from '@/features/destination-expert/destination-expert.api';
import { MasterHeader } from './MasterUi';

export function DestinationExpertsPage() {
  const [params, setParams] = useSearchParams();
  const presets = useDestinationExpertPresets();
  const remove = useDeleteDestinationExpertPreset();

  const search = (params.get('search') ?? '').toLowerCase();
  const filtered = (presets.data ?? []).filter((p) => {
    if (!search) return true;
    return (
      p.destination.toLowerCase().includes(search) ||
      (p.heading ?? '').toLowerCase().includes(search) ||
      (p.email ?? '').toLowerCase().includes(search)
    );
  });

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  const onDelete = (id: string, dest: string) => {
    if (window.confirm(`Delete destination expert for "${dest}"?`)) remove.mutate(id);
  };

  return (
    <div className="space-y-5">
      <MasterHeader
        title="Destination Experts"
        description="Save destination-based presets for yourself. Each user sees only their own presets. Import them in the Quotation Builder."
        current="Destination Experts"
        action={
          <Link to="/masters/destination-experts/new">
            <Button>
              <Plus className="h-4 w-4" />
              Add New Expert
            </Button>
          </Link>
        }
      />

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b p-4">
          <label className="relative block">
            <span className="sr-only">Search destination experts</span>
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              aria-label="Search destination experts"
              placeholder="Search destination, heading or email…"
              className="w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm"
              value={params.get('search') ?? ''}
              onChange={(e) => update('search', e.target.value)}
            />
          </label>
        </div>

        {presets.isPending ? (
          <div className="h-64 animate-pulse bg-slate-100" />
        ) : presets.isError ? (
          <div role="alert" className="p-8 text-center text-red-700">
            Could not load destination experts.
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <h2 className="font-semibold">No destination experts found</h2>
            <p className="text-sm text-slate-500">Create your first destination-based preset.</p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-muted text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <tr>
                    {['Destination', 'Heading', 'WhatsApp / Call', 'Email', 'Created', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-semibold text-slate-900">{p.destination}</td>
                      <td className="px-4 py-3 max-w-[220px] truncate">{p.heading || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="text-xs leading-tight">
                          <div>{p.whatsappNumber || '—'}</div>
                          <div className="text-slate-500">{p.callNumber || ''}</div>
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-[200px] truncate">{p.email || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">{new Date(p.createdAt).toLocaleDateString('en-GB')}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Link aria-label={`View ${p.destination}`} to={`/masters/destination-experts/${p.id}`} className="rounded bg-cyan-600 p-2 text-white">
                            <Eye className="h-4 w-4" />
                          </Link>
                          <Link aria-label={`Edit ${p.destination}`} to={`/masters/destination-experts/${p.id}/edit`} className="rounded bg-brand-600 p-2 text-white">
                            <Pencil className="h-4 w-4" />
                          </Link>
                          <button aria-label={`Delete ${p.destination}`} onClick={() => onDelete(p.id, p.destination)} className="rounded bg-red-600 p-2 text-white">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y md:hidden">
              {filtered.map((p) => (
                <article key={p.id} className="space-y-3 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="font-semibold">{p.destination}</h2>
                      <p className="text-sm text-slate-500">{p.heading || 'No heading'}</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600">{p.whatsappNumber || p.callNumber || 'No phone'} · {p.email || 'No email'}</p>
                  <div className="flex gap-2">
                    <Link to={`/masters/destination-experts/${p.id}`}>
                      <Button variant="secondary">View</Button>
                    </Link>
                    <Link to={`/masters/destination-experts/${p.id}/edit`}>
                      <Button variant="secondary">Edit</Button>
                    </Link>
                    <Button variant="danger" onClick={() => onDelete(p.id, p.destination)}>
                      Delete
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

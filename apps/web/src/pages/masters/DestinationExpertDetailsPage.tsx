import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useDeleteDestinationExpertPreset, useDestinationExpertPreset } from '@/features/destination-expert/destination-expert.api';
import { MasterHeader } from './MasterUi';

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 font-medium text-slate-800">{value || '—'}</p>
    </div>
  );
}

export function DestinationExpertDetailsPage() {
  const { expertId } = useParams();
  const navigate = useNavigate();
  const preset = useDestinationExpertPreset(expertId);
  const remove = useDeleteDestinationExpertPreset();

  if (preset.isError) return <Navigate to="/masters/destination-experts" replace />;
  if (preset.isPending) return <div className="h-64 animate-pulse rounded-xl bg-card" />;
  if (!preset.data) return null;

  const p = preset.data;

  const onDelete = () => {
    if (window.confirm(`Delete destination expert for "${p.destination}"?`)) {
      remove.mutate(p.id, { onSuccess: () => navigate('/masters/destination-experts') });
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <MasterHeader title={p.destination} current={p.destination} />

      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b bg-gradient-to-r from-brand-700 to-blue-600 px-5 py-4">
          <h2 className="text-lg font-semibold text-white">{p.destination}</h2>
          <p className="text-sm text-white/80">{p.heading || 'No heading'}</p>
        </div>

        <div className="space-y-6 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Info label="Heading" value={p.heading ?? ''} />
            <Info label="Destination" value={p.destination} />
            <Info label="WhatsApp Number" value={p.whatsappNumber ?? ''} />
            <Info label="Call Number" value={p.callNumber ?? ''} />
            <Info label="Email Address" value={p.email ?? ''} />
            <Info label="Job Title" value={(p as any).jobTitle ?? ''} />
            <Info label="Specialization" value={(p as any).specialization ?? ''} />
            <Info label="Years of Experience" value={(p as any).yearsOfExperience?.toString() ?? ''} />
            <Info label="Trips Planned" value={(p as any).tripsPlanned?.toString() ?? ''} />
            <Info label="Languages" value={(p as any).languages ?? ''} />
            <Info label="Gender" value={(p as any).gender ?? 'Not set (defaults to male)'} />
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Short Bio</p>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{(p as any).bio || '—'}</p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Custom introduction</p>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{p.customIntroduction || '—'}</p>
          </div>

          <div className="flex items-center gap-4 rounded-lg border bg-slate-50 p-4">
            {(p as any).gender === 'FEMALE' ? (
              <img src="/destination-expert/female.png" alt="Female avatar" className="h-20 w-20 rounded-lg border object-cover" />
            ) : (
              <img src="/destination-expert/male.png" alt="Male avatar" className="h-20 w-20 rounded-lg border object-cover" />
            )}
            <div className="text-xs text-slate-500">
              {(p as any).gender ? `Default avatar: ${(p as any).gender === 'MALE' ? 'male.png' : 'female.png'}` : 'Default avatar: male.png (image not required)'}
              <br />
              Custom photo overrides gender avatar when uploaded (optional).
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {(
              [
                ['Show WhatsApp', p.showWhatsapp],
                ['Show Call', p.showCall],
                ['Show Email', p.showEmail],
                ['Show Experience', p.showExperience],
                ['Show Trips Planned', p.showTripsPlanned],
                ['Show Languages', p.showLanguages],
              ] as const
            ).map(([label, val]) => (
              <div key={label} className={`rounded-md px-2.5 py-2 text-sm ${val ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-50 text-slate-500'}`}>
                {label}: {val ? 'Yes' : 'No'}
              </div>
            ))}
          </div>

          <div className="flex gap-2 border-t pt-4">
            <Link to={`/masters/destination-experts/${p.id}/edit`}>
              <Button>
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            </Link>
            <Button variant="danger" onClick={onDelete} isLoading={remove.isPending}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
            <Link to="/masters/destination-experts">
              <Button variant="secondary">Back to list</Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

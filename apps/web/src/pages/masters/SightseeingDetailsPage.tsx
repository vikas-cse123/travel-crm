import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Archive, ArrowLeft, MapPinned, Pencil, RotateCcw } from 'lucide-react';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  sightseeingImageUrl,
  useArchiveSightseeing,
  useRestoreSightseeing,
  useSightseeing,
} from '@/features/masters/masters.api';
import { Breadcrumbs, LoadingCard, SafeRichText, StatusBadge } from './MasterUi';

/** "14:30" → "2:30 PM". */
function formatTime(value: string | null): string {
  if (!value) return '—';
  const [hourText, minuteText] = value.split(':');
  const hour = Number(hourText);
  if (Number.isNaN(hour)) return value;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${minuteText ?? '00'} ${suffix}`;
}

export function SightseeingDetailsPage() {
  const { sightseeingId = '' } = useParams<{ sightseeingId: string }>();
  const record = useSightseeing(sightseeingId);
  const archive = useArchiveSightseeing();
  const restore = useRestoreSightseeing();
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission(PERMISSIONS.MASTER_SIGHTSEEING_UPDATE);
  const canArchive = hasPermission(PERMISSIONS.MASTER_SIGHTSEEING_DELETE);

  // Private storage: the browser only receives a short-lived signed URL.
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!record.data?.hasImage) {
      setImageSrc(null);
      return;
    }
    void sightseeingImageUrl(sightseeingId)
      .then((result) => {
        if (active) setImageSrc(result.url);
      })
      .catch(() => {
        if (active) setImageSrc(null);
      });
    return () => {
      active = false;
    };
  }, [record.data?.hasImage, sightseeingId]);

  if (record.isPending) return <LoadingCard />;
  if (record.isError)
    return (
      <div role="alert" className="rounded-xl border bg-white p-8 text-center text-red-700">
        This sightseeing could not be loaded.
      </div>
    );

  const value = record.data;
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Destination', value: value.destination.name },
    { label: 'City', value: value.city.name },
    { label: 'Sequence', value: String(value.sequence) },
    {
      label: 'Estimated Hours',
      value: value.estimatedHours != null ? `${value.estimatedHours.toFixed(1)}h` : '—',
    },
    { label: 'Suggested Start Time', value: formatTime(value.suggestedStartTime) },
    { label: 'Created', value: new Date(value.createdAt).toLocaleDateString() },
    { label: 'Created By', value: value.createdBy?.fullName ?? '—' },
    { label: 'Last Updated', value: new Date(value.updatedAt).toLocaleDateString() },
    { label: 'Updated By', value: value.updatedBy?.fullName ?? '—' },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Breadcrumbs current="Sightseeing" />
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">{value.title}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <StatusBadge value={value.status} />
            <span>
              {value.destination.name} · {value.city.name}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/masters/sightseeing">
            <Button variant="secondary">
              <ArrowLeft className="h-4 w-4" /> Back to List
            </Button>
          </Link>
          {canUpdate && (
            <Link to={`/masters/sightseeing/${sightseeingId}/edit`}>
              <Button>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            </Link>
          )}
          {canArchive && value.status !== 'ARCHIVED' && (
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm(`Archive ${value.title}?`)) archive.mutate(sightseeingId);
              }}
            >
              <Archive className="h-4 w-4" /> Archive
            </Button>
          )}
          {canUpdate && value.status === 'ARCHIVED' && (
            <Button variant="secondary" onClick={() => restore.mutate(sightseeingId)}>
              <RotateCcw className="h-4 w-4" /> Restore
            </Button>
          )}
        </div>
      </header>

      <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <h2 className="border-b bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800">
          Sightseeing Information
        </h2>
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row" className="w-52 bg-slate-50 px-4 py-2 font-medium text-slate-700">
                    {row.label}
                  </th>
                  <td className="px-4 py-2 text-slate-800">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex h-48 items-center justify-center overflow-hidden rounded-lg border bg-slate-50">
            {imageSrc ? (
              <img src={imageSrc} alt={value.title} className="h-full w-full object-cover" />
            ) : (
              <MapPinned className="h-10 w-10 text-slate-300" />
            )}
          </div>
        </div>
        <div className="grid gap-4 border-t p-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Description</h3>
            <SafeRichText html={value.description} empty="No description added." />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">Remarks</h3>
            <SafeRichText html={value.remarks} empty="No remarks added." />
          </div>
        </div>
      </section>
    </div>
  );
}

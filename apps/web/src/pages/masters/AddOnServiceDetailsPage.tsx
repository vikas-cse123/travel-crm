import { Link, useParams } from 'react-router-dom';
import { Archive, ArrowLeft, Pencil, RotateCcw } from 'lucide-react';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  useAddOnService,
  useArchiveAddOnService,
  useRestoreAddOnService,
} from '@/features/masters/masters.api';
import { Breadcrumbs, LoadingCard, SafeRichText, StatusBadge } from './MasterUi';

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function AddOnServiceDetailsPage() {
  const { addOnServiceId = '' } = useParams<{ addOnServiceId: string }>();
  const record = useAddOnService(addOnServiceId);
  const archive = useArchiveAddOnService();
  const restore = useRestoreAddOnService();
  const { hasPermission } = useAuth();
  const canUpdate = hasPermission(PERMISSIONS.MASTER_ADD_ON_SERVICES_UPDATE);
  const canArchive = hasPermission(PERMISSIONS.MASTER_ADD_ON_SERVICES_DELETE);

  if (record.isPending) return <LoadingCard />;
  if (record.isError)
    return (
      <div role="alert" className="rounded-xl border bg-white p-8 text-center text-red-700">
        This add-on service could not be loaded.
      </div>
    );

  const value = record.data;

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Breadcrumbs current="Add-On Services" />
          <h1 className="mt-2 text-2xl font-semibold text-slate-950">{value.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            <StatusBadge value={value.status} />
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/masters/add-on-services">
            <Button variant="secondary">
              <ArrowLeft className="h-4 w-4" /> Back to List
            </Button>
          </Link>
          {canUpdate && (
            <Link to={`/masters/add-on-services/${addOnServiceId}/edit`}>
              <Button>
                <Pencil className="h-4 w-4" /> Edit Service
              </Button>
            </Link>
          )}
          {canArchive && value.status !== 'ARCHIVED' && (
            <Button
              variant="danger"
              onClick={() => {
                if (window.confirm(`Archive ${value.name}?`)) archive.mutate(addOnServiceId);
              }}
            >
              <Archive className="h-4 w-4" /> Archive
            </Button>
          )}
          {canUpdate && value.status === 'ARCHIVED' && (
            <Button variant="secondary" onClick={() => restore.mutate(addOnServiceId)}>
              <RotateCcw className="h-4 w-4" /> Restore
            </Button>
          )}
        </div>
      </header>

      <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-xl border bg-white shadow-sm">
        <h2 className="border-b bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-800">
          Service Information
        </h2>
        <div className="border-b p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Description</h3>
          <SafeRichText html={value.description} empty="No description added." />
        </div>
        <table className="w-full text-left text-sm">
          <tbody className="divide-y">
            <tr>
              <th scope="row" className="w-52 bg-slate-50 px-4 py-2.5 font-medium text-slate-700">
                Price
              </th>
              <td className="px-4 py-2.5 font-medium text-slate-900">
                {money(value.price, value.currency)}
              </td>
            </tr>
            <tr>
              <th scope="row" className="bg-slate-50 px-4 py-2.5 font-medium text-slate-700">
                Status
              </th>
              <td className="px-4 py-2.5">
                <StatusBadge value={value.status} />
              </td>
            </tr>
            <tr>
              <th scope="row" className="bg-slate-50 px-4 py-2.5 font-medium text-slate-700">
                Created
              </th>
              <td className="px-4 py-2.5 text-slate-800">
                {new Date(value.createdAt).toLocaleDateString()}
              </td>
            </tr>
            <tr>
              <th scope="row" className="bg-slate-50 px-4 py-2.5 font-medium text-slate-700">
                Created By
              </th>
              <td className="px-4 py-2.5 text-slate-800">{value.createdBy?.fullName ?? '—'}</td>
            </tr>
            <tr>
              <th scope="row" className="bg-slate-50 px-4 py-2.5 font-medium text-slate-700">
                Last Updated
              </th>
              <td className="px-4 py-2.5 text-slate-800">
                {new Date(value.updatedAt).toLocaleDateString()}
              </td>
            </tr>
            <tr>
              <th scope="row" className="bg-slate-50 px-4 py-2.5 font-medium text-slate-700">
                Updated By
              </th>
              <td className="px-4 py-2.5 text-slate-800">{value.updatedBy?.fullName ?? '—'}</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}

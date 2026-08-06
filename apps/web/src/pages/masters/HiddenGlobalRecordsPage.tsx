import { useState } from 'react';
import { EyeOff, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  useHiddenGlobalMasters,
  useRestoreGlobalMaster,
  type GlobalMasterType,
} from '@/features/masters/masters.api';
import { formatMasterDate, MasterHeader, StatusBadge } from './MasterUi';

const MASTER_TYPE_OPTIONS: Array<{ value: GlobalMasterType | ''; label: string }> = [
  { value: '', label: 'All master types' },
  { value: 'CITY', label: 'Cities' },
  { value: 'DESTINATION', label: 'Destinations' },
  { value: 'HOTEL', label: 'Hotels' },
  { value: 'AIRLINE', label: 'Airlines' },
  { value: 'CRUISE', label: 'Cruises' },
  { value: 'VEHICLE', label: 'Vehicles' },
  { value: 'SIGHTSEEING', label: 'Sightseeing' },
  { value: 'ADD_ON_SERVICE', label: 'Add-On Services' },
  { value: 'VISA_TYPE', label: 'Visa Types' },
  { value: 'TESTIMONIAL', label: 'Testimonials' },
];

/**
 * Tenant-only restore screen for global master records hidden by this company.
 * The System Admin never sees this page.
 */
export function HiddenGlobalRecordsPage() {
  const [masterType, setMasterType] = useState<GlobalMasterType | ''>('');
  const hidden = useHiddenGlobalMasters(masterType || undefined);
  const restore = useRestoreGlobalMaster();

  const restoreRow = (type: GlobalMasterType, masterId: string) => {
    if (window.confirm('Restore this global record for your company?')) {
      restore.mutate({ masterType: type, masterId });
    }
  };

  return (
    <div className="space-y-5">
      <MasterHeader
        title="Hidden Global Records"
        description="Global records this company has hidden. Restoring one makes it visible again for your company only."
        current="Hidden Global"
      />
      <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="grid gap-3 border-b p-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <div />
          <select
            aria-label="Filter by master type"
            className="rounded-lg border px-3 py-2.5 text-sm"
            value={masterType}
            onChange={(event) => setMasterType(event.target.value as GlobalMasterType | '')}
          >
            {MASTER_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {hidden.isPending ? (
          <div className="h-64 animate-pulse bg-slate-100" />
        ) : hidden.isError ? (
          <div role="alert" className="p-8 text-center text-red-700">
            Hidden global records could not be loaded.
          </div>
        ) : !hidden.data?.data.length ? (
          <div className="p-12 text-center">
            <EyeOff className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-3 font-semibold">No hidden global records</h2>
            <p className="text-sm text-slate-500">
              Global records you hide from the Master lists will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {hidden.data.data.map((row) => (
              <div key={row.hideId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{row.name}</p>
                  <p className="text-sm text-slate-500">
                    <StatusBadge value={row.masterTypeLabel} /> · Hidden{' '}
                    {formatMasterDate(row.hiddenAt)}
                    {row.hiddenBy ? ` by ${row.hiddenBy.fullName}` : ''}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => restoreRow(row.masterType, row.masterId)}
                  title="Make this global record visible for your company again"
                >
                  <RotateCcw className="h-4 w-4" />
                  Restore
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

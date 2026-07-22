import { useEffect, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  AIRLINE_LOGO_MIME_TYPES,
  COUNTRIES,
  PERMISSIONS,
  type AirlineInput,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  approveAirlineLogo,
  confirmAirlineLogo,
  deleteAirlineLogo,
  useAirline,
  useCreateAirline,
  useUpdateAirline,
} from '@/features/masters/masters.api';
import { fieldClass, MasterHeader } from './MasterUi';

interface FormValues {
  name: string;
  iataCode: string;
  icaoCode: string;
  countryCode: string;
  website: string;
  internalNotes: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}

const empty: FormValues = {
  name: '',
  iataCode: '',
  icaoCode: '',
  countryCode: '',
  website: '',
  internalNotes: '',
  status: 'ACTIVE',
};

export function AirlineFormPage() {
  const { airlineId } = useParams();
  const navigate = useNavigate();
  const airline = useAirline(airlineId);
  const create = useCreateAirline();
  const update = useUpdateAirline(airlineId ?? '');
  const { hasPermission } = useAuth();
  const canManageMedia = hasPermission(PERMISSIONS.MASTER_AIRLINES_MANAGE_MEDIA);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoError, setLogoError] = useState('');
  const [uploading, setUploading] = useState(false);
  const form = useForm<FormValues>({ defaultValues: empty });

  useEffect(() => {
    if (!airline.data) return;
    form.reset({
      name: airline.data.name,
      iataCode: airline.data.iataCode ?? '',
      icaoCode: airline.data.icaoCode ?? '',
      countryCode: airline.data.countryCode ?? '',
      website: airline.data.website ?? '',
      internalNotes: airline.data.internalNotes ?? '',
      status: airline.data.status as FormValues['status'],
    });
  }, [airline.data, form]);

  if (airlineId && airline.isError) return <Navigate to="/masters/airlines" replace />;
  const mutation = airlineId ? update : create;

  const validateLogo = (file?: File) => {
    setLogoError('');
    if (!file) return setLogo(null);
    if (!AIRLINE_LOGO_MIME_TYPES.includes(file.type as (typeof AIRLINE_LOGO_MIME_TYPES)[number])) {
      setLogoError('Use a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError('Logo must be 2 MB or smaller.');
      return;
    }
    setLogo(file);
  };
  const uploadLogo = async (id: string, file: File) => {
    const approval = await approveAirlineLogo(id, {
      fileName: file.name,
      mimeType: file.type as (typeof AIRLINE_LOGO_MIME_TYPES)[number],
      fileSize: file.size,
    });
    if (!approval.uploadUrl.startsWith('http'))
      throw new Error(
        'Local memory storage has no browser upload transport. Configure S3 to upload logos.',
      );
    const response = await fetch(approval.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!response.ok) throw new Error('The logo upload failed. Please try again.');
    await confirmAirlineLogo(id);
  };

  const submit = form.handleSubmit(async (values) => {
    if (values.name.trim().length < 2) {
      form.setError('name', { message: 'Enter an airline name.' });
      return;
    }
    const payload: AirlineInput = {
      name: values.name.trim(),
      iataCode: values.iataCode.trim() || null,
      icaoCode: values.icaoCode.trim() || null,
      countryCode: values.countryCode || null,
      website: values.website.trim() || null,
      internalNotes: values.internalNotes.trim() || null,
      status: values.status,
    };
    try {
      const saved = airlineId
        ? await update.mutateAsync(payload)
        : await create.mutateAsync(payload);
      if (logo && canManageMedia) {
        setUploading(true);
        await uploadLogo(saved.id, logo);
      }
      navigate(`/masters/airlines/${saved.id}`);
    } catch (error) {
      if (error instanceof Error && !(error as { code?: string }).code) setLogoError(error.message);
    } finally {
      setUploading(false);
    }
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <MasterHeader
        title={airlineId ? 'Edit Airline' : 'Create Airline'}
        description="Airlines are referenced by flight services in quotations and bookings."
        current={airlineId ? 'Edit Airline' : 'Create Airline'}
      />
      <form onSubmit={submit} className="space-y-5">
        {(mutation.error || logoError) && (
          <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {logoError || mutation.error?.message}
          </div>
        )}
        <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="border-b bg-gradient-to-r from-brand-700 to-blue-600 px-5 py-4 text-lg font-semibold text-white">
            Airline Information
          </div>
          <div className="space-y-5 p-5">
            <label className="block text-sm font-medium">
              Airline Name *
              <input
                className={fieldClass}
                placeholder="Enter airline name"
                {...form.register('name')}
              />
              {form.formState.errors.name && (
                <span className="text-xs text-red-600">{form.formState.errors.name.message}</span>
              )}
            </label>
            {canManageMedia && (
              <div>
                <span className="text-sm font-medium">Airline Logo</span>
                <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600 hover:bg-slate-50">
                  <ImagePlus className="h-5 w-5" />
                  {logo?.name ??
                    (airline.data?.hasLogo
                      ? `Replace ${airline.data.logoFileName}`
                      : 'Choose JPEG, PNG or WebP')}
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => validateLogo(event.target.files?.[0])}
                  />
                </label>
                <p className="mt-1 text-xs text-slate-500">Recommended 200×100 px. Max 2 MB.</p>
                {airlineId && airline.data?.hasLogo && (
                  <Button
                    className="mt-2"
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      if (window.confirm('Delete this logo?')) {
                        await deleteAirlineLogo(airlineId);
                        await airline.refetch();
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" /> Delete logo
                  </Button>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="border-b bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700">
            Additional Details
          </div>
          <div className="grid gap-5 p-5 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              IATA Code
              <input
                className={fieldClass}
                maxLength={2}
                placeholder="e.g. AI"
                {...form.register('iataCode')}
              />
            </label>
            <label className="block text-sm font-medium">
              ICAO Code
              <input
                className={fieldClass}
                maxLength={3}
                placeholder="e.g. AIC"
                {...form.register('icaoCode')}
              />
            </label>
            <label className="block text-sm font-medium">
              Country
              <select className={fieldClass} {...form.register('countryCode')}>
                <option value="">Select country</option>
                {COUNTRIES.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-medium">
              Website
              <input className={fieldClass} placeholder="https://…" {...form.register('website')} />
            </label>
            {airlineId && (
              <label className="block text-sm font-medium">
                Status
                <select className={fieldClass} {...form.register('status')}>
                  <option>ACTIVE</option>
                  <option>INACTIVE</option>
                  <option>ARCHIVED</option>
                </select>
              </label>
            )}
            <label className="block text-sm font-medium sm:col-span-2">
              Internal Notes
              <textarea className={fieldClass} rows={3} {...form.register('internalNotes')} />
            </label>
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <Link to={airlineId ? `/masters/airlines/${airlineId}` : '/masters/airlines'}>
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button type="submit" isLoading={mutation.isPending || uploading}>
            {airlineId ? 'Update Airline' : 'Create Airline'}
          </Button>
        </div>
      </form>
    </div>
  );
}

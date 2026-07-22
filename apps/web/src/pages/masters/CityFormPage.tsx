import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import type { CityInput } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import {
  useCity,
  useCreateCity,
  useMasterLookups,
  useUpdateCity,
} from '@/features/masters/masters.api';
import { fieldClass, MasterHeader } from './MasterUi';

const schema = z.object({
  countryCode: z.string().length(2, 'Select a country.'),
  name: z.string().trim().min(2, 'Enter a city name.').max(160),
  airportCode: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => !value || /^[A-Z]{3}$/.test(value), 'Use a three-letter airport code.'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']),
});
type Values = z.infer<typeof schema>;
const initial: Values = { countryCode: '', name: '', airportCode: '', status: 'ACTIVE' };

export function CityFormPage() {
  const { cityId } = useParams();
  const navigate = useNavigate();
  const city = useCity(cityId);
  const lookups = useMasterLookups();
  const create = useCreateCity();
  const update = useUpdateCity(cityId ?? '');
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });
  useEffect(() => {
    if (city.data)
      form.reset({
        countryCode: city.data.countryCode,
        name: city.data.name,
        airportCode: city.data.airportCode ?? '',
        status: city.data.status as Values['status'],
      });
  }, [city.data, form]);
  useEffect(() => {
    const leave = (event: BeforeUnloadEvent) => {
      if (form.formState.isDirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [form.formState.isDirty]);
  if (cityId && city.isError) return <Navigate to="/masters/cities" replace />;
  const mutation = cityId ? update : create;
  const submit = (values: Values) => {
    const payload: CityInput = {
      countryCode: values.countryCode,
      name: values.name,
      airportCode: values.airportCode || null,
      status: values.status,
    };
    if (cityId) update.mutate(payload, { onSuccess: () => navigate(`/masters/cities/${cityId}`) });
    else create.mutate(payload, { onSuccess: (row) => navigate(`/masters/cities/${row.id}`) });
  };
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <MasterHeader
        title={cityId ? 'Edit City' : 'Create City'}
        description="Keep city names consistent and add the IATA airport code when available."
        current={cityId ? 'Edit City' : 'Create City'}
      />
      <form
        onSubmit={form.handleSubmit(submit)}
        className="overflow-hidden rounded-xl border bg-white shadow-sm"
      >
        <div className="border-b bg-gradient-to-r from-brand-700 to-blue-600 px-5 py-4 text-lg font-semibold text-white">
          City Information
        </div>
        <div className="space-y-5 p-5">
          {mutation.error && (
            <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {mutation.error.message}
            </div>
          )}
          <label className="block text-sm font-medium">
            Country *
            <select className={fieldClass} {...form.register('countryCode')}>
              <option value="">Select country</option>
              {lookups.data?.countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
            {form.formState.errors.countryCode && (
              <span className="text-xs text-red-600">
                {form.formState.errors.countryCode.message}
              </span>
            )}
          </label>
          <label className="block text-sm font-medium">
            City Name *
            <input
              className={fieldClass}
              placeholder="Enter city name"
              {...form.register('name')}
            />
            {form.formState.errors.name && (
              <span className="text-xs text-red-600">{form.formState.errors.name.message}</span>
            )}
          </label>
          <label className="block text-sm font-medium">
            Airport Code
            <input
              className={`${fieldClass} uppercase`}
              maxLength={3}
              placeholder="e.g. DEL"
              {...form.register('airportCode')}
            />
            {form.formState.errors.airportCode && (
              <span className="text-xs text-red-600">
                {form.formState.errors.airportCode.message}
              </span>
            )}
          </label>
          {cityId && (
            <label className="block text-sm font-medium">
              Status
              <select className={fieldClass} {...form.register('status')}>
                <option>ACTIVE</option>
                <option>INACTIVE</option>
                <option>ARCHIVED</option>
              </select>
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t bg-slate-50 p-4">
          <Link to={cityId ? `/masters/cities/${cityId}` : '/masters/cities'}>
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button type="submit" isLoading={mutation.isPending}>
            {cityId ? 'Update City' : 'Create City'}
          </Button>
        </div>
      </form>
    </div>
  );
}

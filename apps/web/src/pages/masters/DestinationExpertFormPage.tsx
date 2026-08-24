import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import {
  useCreateDestinationExpertPreset,
  useDestinationExpertPreset,
  useUpdateDestinationExpertPreset,
} from '@/features/destination-expert/destination-expert.api';
import { fieldClass, MasterHeader } from './MasterUi';

const schema = z.object({
  destination: z.string().trim().min(2, 'Enter a destination.').max(120),
  heading: z.string().trim().max(200).nullable().optional().or(z.literal('')),
  customIntroduction: z.string().trim().max(2000).nullable().optional().or(z.literal('')),
  whatsappNumber: z
    .string()
    .trim()
    .max(32)
    .nullable()
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || /^\+?[0-9\s()\-]{6,32}$/.test(v as string), 'Enter a valid WhatsApp number'),
  callNumber: z
    .string()
    .trim()
    .max(32)
    .nullable()
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || /^\+?[0-9\s()\-]{6,32}$/.test(v as string), 'Enter a valid phone number'),
  email: z
    .string()
    .trim()
    .max(255)
    .nullable()
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v as string), 'Enter a valid email address'),
  showWhatsapp: z.boolean().default(true),
  showCall: z.boolean().default(true),
  showEmail: z.boolean().default(true),
  showExperience: z.boolean().default(true),
  showTripsPlanned: z.boolean().default(true),
  showLanguages: z.boolean().default(true),
  jobTitle: z.string().trim().max(120).nullable().optional().or(z.literal('')),
  specialization: z.string().trim().max(200).nullable().optional().or(z.literal('')),
  yearsOfExperience: z.coerce.number().int().min(0).max(100).nullable().optional(),
  tripsPlanned: z.coerce.number().int().min(0).max(1000000).nullable().optional(),
  languages: z.string().trim().max(200).nullable().optional().or(z.literal('')),
  bio: z.string().trim().max(2000).nullable().optional().or(z.literal('')),
  gender: z.enum(['MALE', 'FEMALE']).nullable().optional(),
});

type Values = z.infer<typeof schema>;

const initial: Values = {
  destination: '',
  heading: '',
  customIntroduction: '',
  whatsappNumber: '',
  callNumber: '',
  email: '',
  showWhatsapp: true,
  showCall: true,
  showEmail: true,
  showExperience: true,
  showTripsPlanned: true,
  showLanguages: true,
  jobTitle: '',
  specialization: '',
  yearsOfExperience: null,
  tripsPlanned: null,
  languages: '',
  bio: '',
  gender: null,
};

export function DestinationExpertFormPage() {
  const { expertId } = useParams();
  const navigate = useNavigate();
  const alertRef = useRef<HTMLDivElement>(null);
  const preset = useDestinationExpertPreset(expertId);
  const create = useCreateDestinationExpertPreset();
  const update = useUpdateDestinationExpertPreset();

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });

  useEffect(() => {
    if (preset.data) {
      form.reset({
        destination: preset.data.destination,
        heading: preset.data.heading ?? '',
        customIntroduction: preset.data.customIntroduction ?? '',
        whatsappNumber: preset.data.whatsappNumber ?? '',
        callNumber: preset.data.callNumber ?? '',
        email: preset.data.email ?? '',
        showWhatsapp: preset.data.showWhatsapp,
        showCall: preset.data.showCall,
        showEmail: preset.data.showEmail,
        showExperience: preset.data.showExperience,
        showTripsPlanned: preset.data.showTripsPlanned,
        showLanguages: preset.data.showLanguages,
        jobTitle: (preset.data as any).jobTitle ?? '',
        specialization: (preset.data as any).specialization ?? '',
        yearsOfExperience: (preset.data as any).yearsOfExperience ?? null,
        tripsPlanned: (preset.data as any).tripsPlanned ?? null,
        languages: (preset.data as any).languages ?? '',
        bio: (preset.data as any).bio ?? '',
        gender: (preset.data as any).gender ?? null,
      });
    }
  }, [preset.data, form]);

  if (expertId && preset.isError) return <Navigate to="/masters/destination-experts" replace />;

  const mutation = expertId ? update : create;

  const scrollToAlert = () => {
    window.setTimeout(() => alertRef.current?.scrollIntoView({ block: 'center' }), 0);
  };

  const [filePreview, setFilePreview] = useState<string | null>(null);
  const genderWatch = form.watch('gender');

  const submit = (values: Values) => {
    const payload = {
      destination: values.destination.trim(),
      heading: values.heading?.trim() || null,
      customIntroduction: values.customIntroduction?.trim() || null,
      whatsappNumber: (values.whatsappNumber as string)?.trim() || null,
      callNumber: (values.callNumber as string)?.trim() || null,
      email: (values.email as string)?.trim() || null,
      showWhatsapp: values.showWhatsapp,
      showCall: values.showCall,
      showEmail: values.showEmail,
      showExperience: values.showExperience,
      showTripsPlanned: values.showTripsPlanned,
      showLanguages: values.showLanguages,
      jobTitle: (values.jobTitle as string)?.trim() || null,
      specialization: (values.specialization as string)?.trim() || null,
      yearsOfExperience: values.yearsOfExperience ?? null,
      tripsPlanned: values.tripsPlanned ?? null,
      languages: (values.languages as string)?.trim() || null,
      bio: (values.bio as string)?.trim() || null,
      gender: values.gender ?? null,
    };
    if (expertId) {
      update.mutate({ id: expertId, ...payload } as any, {
        onSuccess: () => navigate(`/masters/destination-experts/${expertId}`),
        onError: scrollToAlert,
      });
    } else {
      create.mutate(payload as any, {
        onSuccess: (row: any) => navigate(`/masters/destination-experts/${row.id}`),
        onError: scrollToAlert,
      });
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <MasterHeader title={expertId ? 'Edit Destination Expert' : 'Create Destination Expert'} current={expertId ? 'Edit' : 'Create'} />
      <form noValidate onSubmit={form.handleSubmit(submit, scrollToAlert)} className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b bg-gradient-to-r from-brand-700 to-blue-600 px-5 py-4 text-lg font-semibold text-white">
          Destination Expert Information
        </div>
        <div className="space-y-5 p-5">
          {mutation.error && (
            <div ref={alertRef} role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {(mutation.error as Error).message}
            </div>
          )}

          <label className="block text-sm font-medium">
            Destination *
            <input className={fieldClass} placeholder="e.g. Singapore" {...form.register('destination')} disabled={Boolean(expertId)} />
            {form.formState.errors.destination && <span className="text-xs text-red-600">{form.formState.errors.destination.message}</span>}
            {expertId && <span className="text-xs text-slate-500">Destination cannot be changed while editing.</span>}
          </label>

          <label className="block text-sm font-medium">
            Heading
            <input className={fieldClass} placeholder="e.g. Your Singapore Expert" {...form.register('heading')} />
          </label>

          <label className="block text-sm font-medium">
            Custom introduction
            <textarea className={fieldClass} rows={3} {...form.register('customIntroduction')} />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Job Title
              <input className={fieldClass} placeholder="e.g. Senior Travel Consultant" {...form.register('jobTitle')} />
            </label>
            <label className="block text-sm font-medium">
              Specialization
              <input className={fieldClass} placeholder="e.g. Singapore & Bali" {...form.register('specialization')} />
            </label>
            <label className="block text-sm font-medium">
              Years of Experience
              <input className={fieldClass} type="number" min={0} max={100} placeholder="e.g. 5" {...form.register('yearsOfExperience', { setValueAs: (v) => (v === '' || v == null ? null : Number(v)) })} />
            </label>
            <label className="block text-sm font-medium">
              Trips Planned
              <input className={fieldClass} type="number" min={0} placeholder="e.g. 500" {...form.register('tripsPlanned', { setValueAs: (v) => (v === '' || v == null ? null : Number(v)) })} />
            </label>
            <label className="block text-sm font-medium md:col-span-2">
              Languages
              <input className={fieldClass} placeholder="e.g. English • Hindi" {...form.register('languages')} />
            </label>
          </div>

          <label className="block text-sm font-medium">
            Short Bio
            <textarea className={fieldClass} rows={3} placeholder="I specialise in Singapore holidays and will personally assist you..." {...form.register('bio')} />
          </label>

          <div className="rounded-lg border bg-white p-4">
            <p className="text-sm font-semibold text-slate-800">Gender / Default Avatar</p>
            <p className="mt-1 text-xs text-slate-500">Explicit choice for default portrait. Custom photo overrides it. Optional – those 2 images by default.</p>
            <div className="mt-3 flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" value="MALE" {...form.register('gender')} /> Male
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" value="FEMALE" {...form.register('gender')} /> Female
              </label>
              <button type="button" className="text-xs text-slate-500 underline" onClick={() => form.setValue('gender', null)}>
                Clear
              </button>
            </div>
            <div className="mt-4 flex items-center gap-4">
              {filePreview ? (
                <img src={filePreview} alt="Preview" className="h-20 w-20 rounded-lg border object-cover object-top" />
              ) : genderWatch === 'MALE' ? (
                <img src="/destination-expert/male.png" alt="Male avatar" className="h-20 w-20 rounded-lg border object-cover object-top" />
              ) : genderWatch === 'FEMALE' ? (
                <img src="/destination-expert/female.png" alt="Female avatar" className="h-20 w-20 rounded-lg border object-cover object-top" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed bg-slate-50 text-xs text-slate-500">No avatar – defaults to male.png</div>
              )}
              <div className="text-xs text-slate-500">
                {filePreview ? <span>Custom photo preview (optional)</span> : genderWatch ? <span>Preview: {genderWatch === 'MALE' ? 'male.png' : 'female.png'}</span> : <span>Optional – defaults to male/female images in public view.</span>}
              </div>
            </div>
            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-700">Upload Custom Profile Photo (optional)</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="mt-1 block w-full text-sm"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const url = URL.createObjectURL(file);
                    setFilePreview(url);
                  } else {
                    setFilePreview(null);
                  }
                }}
              />
              <p className="mt-1 text-xs text-slate-400">JPEG/PNG/WebP, max 5 MB. Optional – overrides gender avatar. Those 2 images by default if left empty.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-sm font-medium">
              WhatsApp Number
              <input className={fieldClass} placeholder="+91XXXXXXXXXX" {...form.register('whatsappNumber')} />
              {form.formState.errors.whatsappNumber && <span className="text-xs text-red-600">{(form.formState.errors.whatsappNumber.message as string)}</span>}
            </label>
            <label className="block text-sm font-medium">
              Call Number
              <input className={fieldClass} {...form.register('callNumber')} />
              {form.formState.errors.callNumber && <span className="text-xs text-red-600">{(form.formState.errors.callNumber.message as string)}</span>}
            </label>
            <label className="block text-sm font-medium">
              Email Address
              <input className={fieldClass} {...form.register('email')} />
              {form.formState.errors.email && <span className="text-xs text-red-600">{(form.formState.errors.email.message as string)}</span>}
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            {(
              [
                ['showWhatsapp', 'Show WhatsApp'],
                ['showCall', 'Show Call'],
                ['showEmail', 'Show Email'],
                ['showExperience', 'Show Experience'],
                ['showTripsPlanned', 'Show Trips Planned'],
                ['showLanguages', 'Show Languages'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 rounded-md bg-slate-50 px-2.5 py-2 text-sm text-slate-700">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-brand-600" {...form.register(key as any)} />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t bg-slate-50 p-4">
          <Link to={expertId ? `/masters/destination-experts/${expertId}` : '/masters/destination-experts'}>
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button type="submit" isLoading={mutation.isPending}>
            {expertId ? 'Update' : 'Create'} Expert
          </Button>
        </div>
      </form>
    </div>
  );
}

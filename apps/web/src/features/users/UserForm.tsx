import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createUserSchema, updateUserSchema, type ManagedUser } from '@interscale/shared';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { FormField, inputClasses } from '@/components/ui/FormField';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PasswordRequirements } from '@/components/ui/PasswordRequirements';
import { useUserLookups, uploadUserProfileImage } from './users.api';

type Values = {
  fullName: string;
  username: string;
  email: string;
  phone?: string | null;
  roleId: string;
  permissionTemplateId?: string | null;
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  temporaryPassword?: string;
  confirmTemporaryPassword?: string;
  mustChangePassword: boolean;
  gender?: 'MALE' | 'FEMALE' | null;
  jobTitle?: string | null;
  bio?: string | null;
  specialization?: string | null;
  yearsOfExperience?: number | null;
  tripsPlanned?: number | null;
  languages?: string | null;
  whatsappNumber?: string | null;
};
export function UserForm({
  user,
  onSubmit,
  isLoading,
  error,
}: {
  user?: ManagedUser;
  onSubmit: (v: Values) => void;
  isLoading: boolean;
  error?: string | undefined;
}) {
  const editing = Boolean(user);
  const { data: lookups, isLoading: loadingLookups } = useUserLookups();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(editing ? updateUserSchema : createUserSchema),
    defaultValues: user
      ? {
          fullName: user.fullName,
          username: user.username,
          email: user.email,
          phone: user.phone,
          roleId: user.role.id,
          permissionTemplateId: user.permissionTemplate?.id ?? null,
          mustChangePassword: user.mustChangePassword ?? false,
          gender: (user.gender as 'MALE' | 'FEMALE' | null) ?? null,
          jobTitle: user.jobTitle ?? null,
          bio: user.bio ?? null,
          specialization: user.specialization ?? null,
          yearsOfExperience: user.yearsOfExperience ?? null,
          tripsPlanned: user.tripsPlanned ?? null,
          languages: user.languages ?? null,
          whatsappNumber: user.whatsappNumber ?? null,
        }
      : {
          fullName: '',
          username: '',
          email: '',
          phone: '',
          roleId: '',
          permissionTemplateId: null,
          status: 'ACTIVE',
          temporaryPassword: '',
          confirmTemporaryPassword: '',
          mustChangePassword: true,
          gender: null,
          jobTitle: null,
          bio: null,
          specialization: null,
          yearsOfExperience: null,
          tripsPlanned: null,
          languages: null,
          whatsappNumber: null,
        },
  });
  useEffect(() => {
    if (user)
      reset({
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        phone: user.phone,
        roleId: user.role.id,
        permissionTemplateId: user.permissionTemplate?.id ?? null,
        mustChangePassword: user.mustChangePassword ?? false,
        gender: (user.gender as 'MALE' | 'FEMALE' | null) ?? null,
        jobTitle: user.jobTitle ?? null,
        bio: user.bio ?? null,
        specialization: user.specialization ?? null,
        yearsOfExperience: user.yearsOfExperience ?? null,
        tripsPlanned: user.tripsPlanned ?? null,
        languages: user.languages ?? null,
        whatsappNumber: user.whatsappNumber ?? null,
      });
  }, [user, reset]);
  useEffect(() => {
    const fn = (e: BeforeUnloadEvent) => {
      if (isDirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, [isDirty]);
  const password = watch('temporaryPassword') ?? '';
  const gender = watch('gender');
  const profileUrl = user?.profileImageUrl ?? null;
  const avatarPreview = profileUrl
    ? profileUrl
    : gender === 'MALE'
      ? '/destination-expert/male.png'
      : gender === 'FEMALE'
        ? '/destination-expert/female.png'
        : null;
  const field = (name: keyof Values, label: string, type = 'text') => (
    <FormField
      label={label}
      required={['fullName', 'username', 'email'].includes(name)}
      error={errors[name]?.message as string | undefined}
    >
      {(a) => (
        <input
          {...a}
          {...register(name)}
          type={type}
          className={inputClasses(Boolean(errors[name]))}
        />
      )}
    </FormField>
  );
  return (
    <form className="space-y-6 p-5" onSubmit={handleSubmit((v) => onSubmit(v))}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-5 md:grid-cols-2">
        {field('fullName', 'Full name')}
        {field('username', 'Username')}
        {field('email', 'Email', 'email')}
        {field('phone', 'Phone', 'tel')}
        <FormField label="Role" required error={errors.roleId?.message}>
          {(a) => (
            <select
              {...a}
              {...register('roleId')}
              disabled={loadingLookups}
              className={inputClasses(Boolean(errors.roleId))}
            >
              <option value="">Select a role</option>
              {lookups?.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          )}
        </FormField>
        <FormField label="Permission template" error={errors.permissionTemplateId?.message}>
          {(a) => (
            <select
              {...a}
              {...register('permissionTemplateId', { setValueAs: (v) => v || null })}
              className={inputClasses(Boolean(errors.permissionTemplateId))}
            >
              <option value="">No template</option>
              {lookups?.permissionTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </FormField>
        {!editing && (
          <>
            <FormField label="Status" required error={errors.status?.message}>
              {(a) => (
                <select
                  {...a}
                  {...register('status')}
                  className={inputClasses(Boolean(errors.status))}
                >
                  {['ACTIVE', 'INACTIVE', 'SUSPENDED'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              )}
            </FormField>
            <div />
            <FormField label="Password" required error={errors.temporaryPassword?.message}>
              {(a) => <PasswordInput {...a} {...register('temporaryPassword')} />}
            </FormField>
            <FormField
              label="Confirm password"
              required
              error={errors.confirmTemporaryPassword?.message}
            >
              {(a) => <PasswordInput {...a} {...register('confirmTemporaryPassword')} />}
            </FormField>
            <PasswordRequirements value={password} />
          </>
        )}
      </div>

      <div className="rounded-xl border bg-slate-50 p-4">
        <h3 className="text-sm font-semibold text-slate-800">Destination Expert Profile</h3>
        <p className="mt-1 text-xs text-slate-500">
          Optional details for the public <span className="font-medium">Know Your Destination Expert</span> section.
        </p>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <FormField label="Job Title" error={errors.jobTitle?.message as string | undefined}>
            {(a) => (
              <input
                {...a}
                {...register('jobTitle')}
                placeholder="e.g. Senior Travel Consultant"
                className={inputClasses(Boolean(errors.jobTitle))}
              />
            )}
          </FormField>
          <FormField label="Specialization" error={errors.specialization?.message as string | undefined}>
            {(a) => (
              <input
                {...a}
                {...register('specialization')}
                placeholder="e.g. Singapore & Bali"
                className={inputClasses(Boolean(errors.specialization))}
              />
            )}
          </FormField>
          <FormField label="Years of Experience" error={errors.yearsOfExperience?.message as string | undefined}>
            {(a) => (
              <input
                {...a}
                {...register('yearsOfExperience', {
                  setValueAs: (v) => (v === '' || v == null ? null : Number(v)),
                })}
                type="number"
                min={0}
                max={100}
                placeholder="e.g. 5"
                className={inputClasses(Boolean(errors.yearsOfExperience))}
              />
            )}
          </FormField>
          <FormField label="Trips Planned" error={errors.tripsPlanned?.message as string | undefined}>
            {(a) => (
              <input
                {...a}
                {...register('tripsPlanned', {
                  setValueAs: (v) => (v === '' || v == null ? null : Number(v)),
                })}
                type="number"
                min={0}
                placeholder="e.g. 500"
                className={inputClasses(Boolean(errors.tripsPlanned))}
              />
            )}
          </FormField>
          <FormField label="Languages" error={errors.languages?.message as string | undefined}>
            {(a) => (
              <input
                {...a}
                {...register('languages')}
                placeholder="e.g. English • Hindi"
                className={inputClasses(Boolean(errors.languages))}
              />
            )}
          </FormField>
          <FormField label="WhatsApp Number" error={errors.whatsappNumber?.message as string | undefined}>
            {(a) => (
              <input
                {...a}
                {...register('whatsappNumber')}
                placeholder="e.g. +91 98765 43210"
                className={inputClasses(Boolean(errors.whatsappNumber))}
              />
            )}
          </FormField>
          <div className="md:col-span-2">
            <FormField label="Short Bio" error={errors.bio?.message as string | undefined}>
              {(a) => (
                <textarea
                  {...a}
                  {...register('bio')}
                  rows={3}
                  placeholder="I specialise in Singapore holidays and will personally assist you..."
                  className={inputClasses(Boolean(errors.bio))}
                />
              )}
            </FormField>
          </div>
        </div>

        <div className="mt-5 rounded-lg border bg-white p-4">
          <p className="text-sm font-semibold text-slate-800">Gender / Default Avatar</p>
          <p className="mt-1 text-xs text-slate-500">Explicit choice for the default portrait. Custom photo overrides it.</p>
          <div className="mt-3 flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" value="MALE" {...register('gender')} />
              Male
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" value="FEMALE" {...register('gender')} />
              Female
            </label>
            <button
              type="button"
              className="text-xs text-slate-500 underline"
              onClick={() => reset({ ...watch(), gender: null } as Values)}
            >
              Clear
            </button>
          </div>
          {errors.gender && <p className="mt-2 text-xs text-red-600">{errors.gender.message as string}</p>}
          <div className="mt-4 flex items-center gap-4">
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt={gender === 'MALE' ? 'Male avatar' : gender === 'FEMALE' ? 'Female avatar' : 'Profile photo'}
                className="h-20 w-20 rounded-lg border object-cover object-top"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed bg-slate-50 text-xs text-slate-500">
                No avatar
              </div>
            )}
            <div className="text-xs text-slate-500">
              {profileUrl ? (
                <span>Custom photo is active.</span>
              ) : gender ? (
                <span>Preview: {gender === 'MALE' ? 'male.png' : 'female.png'}</span>
              ) : (
                <span className="text-amber-600">Please select Male or Female for this employee to use the default Destination Expert avatar.</span>
              )}
            </div>
          </div>
          {editing && user?.id && (
            <div className="mt-4">
              <label className="text-xs font-semibold text-slate-700">Upload Custom Profile Photo</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="mt-1 block w-full text-sm"
                disabled={uploading}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !user?.id) return;
                  setUploadError(null);
                  setUploadSuccess(null);
                  setUploading(true);
                  try {
                    await uploadUserProfileImage(user.id, file);
                    setUploadSuccess('Photo uploaded. Refreshing...');
                    window.location.reload();
                  } catch (err) {
                    setUploadError(err instanceof Error ? err.message : 'Upload failed');
                  } finally {
                    setUploading(false);
                    e.target.value = '';
                  }
                }}
              />
              {uploading && <p className="mt-1 text-xs text-slate-500">Uploading...</p>}
              {uploadError && <p className="mt-1 text-xs text-red-600">{uploadError}</p>}
              {uploadSuccess && <p className="mt-1 text-xs text-emerald-600">{uploadSuccess}</p>}
              <p className="mt-1 text-xs text-slate-400">JPEG/PNG/WebP, max 5 MB. Overrides gender avatar.</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" isLoading={isLoading}>
          {editing ? 'Save changes' : 'Create user'}
        </Button>
      </div>
    </form>
  );
}

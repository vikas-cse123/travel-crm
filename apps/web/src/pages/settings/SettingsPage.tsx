import { useEffect, useRef, useState } from 'react';
import { SETTINGS_CURRENCIES, SETTINGS_TIMEZONES } from '@interscale/shared';
import { ApiError } from '@/api/client';
import { Button } from '@/components/ui/Button';
import {
  useRemoveLogo,
  useSaveBankAccount,
  useSettings,
  useUpdateBranding,
  useUpdateDefaultTerms,
  useUpdatePreferences,
  useUpdateProfile,
  useUpdateTax,
  useUploadLogo,
  type CompanySettings,
} from '@/features/settings/settings.api';

const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm';
const card = 'rounded-xl border bg-card p-5 shadow-sm space-y-4';

const TABS = [
  ['profile', 'Company Profile'],
  ['branding', 'Branding'],
  ['tax', 'Tax'],
  ['preferences', 'Preferences'],
  ['terms', 'Default Terms'],
  ['bank', 'Bank Account'],
] as const;
type TabKey = (typeof TABS)[number][0];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function Feedback({
  error,
  success,
}: {
  error?: string | undefined;
  success?: boolean | undefined;
}) {
  if (error)
    return (
      <p className="text-sm text-red-700" role="alert">
        {error}
      </p>
    );
  if (success) return <p className="text-sm text-emerald-700">Saved.</p>;
  return null;
}

function ProfileTab({ data, canUpdate }: { data: CompanySettings; canUpdate: boolean }) {
  const mutation = useUpdateProfile();
  const [form, setForm] = useState(data.profile);
  useEffect(() => setForm(data.profile), [data.profile]);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const [operatingSince, setOperatingSince] = useState(data.profile.operatingSince?.toString() ?? '');
  const [totalReviews, setTotalReviews] = useState(data.profile.totalReviews?.toString() ?? '');
  const [tripsSold, setTripsSold] = useState(data.profile.tripsSold?.toString() ?? '');
  useEffect(() => {
    setOperatingSince(data.profile.operatingSince?.toString() ?? '');
    setTotalReviews(data.profile.totalReviews?.toString() ?? '');
    setTripsSold(data.profile.tripsSold?.toString() ?? '');
  }, [data.profile.operatingSince, data.profile.totalReviews, data.profile.tripsSold]);
  const intOrNull = (value: string) => (value.trim() === '' ? null : Number(value));
  return (
    <section className={card}>
      <h2 className="font-semibold">Company Profile</h2>
      <Field label="Company name">
        <input
          aria-label="Company name"
          className={input}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
        />
      </Field>
      <Field label="Email">
        <input
          aria-label="Company email"
          className={input}
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
        />
      </Field>
      <Field label="Phone">
        <input
          aria-label="Company phone"
          className={input}
          value={form.phone ?? ''}
          onChange={(e) => set('phone', e.target.value)}
        />
      </Field>
      <Field label="Website">
        <input
          aria-label="Company website"
          className={input}
          value={form.website ?? ''}
          onChange={(e) => set('website', e.target.value)}
        />
      </Field>
      <Field label="Address">
        <textarea
          aria-label="Company address"
          className={input}
          rows={2}
          value={form.address ?? ''}
          onChange={(e) => set('address', e.target.value)}
        />
      </Field>
      <Field label="Operating Since">
        <input
          aria-label="Operating Since"
          type="number"
          min={1900}
          max={2100}
          placeholder="e.g. 2015"
          className={input}
          value={operatingSince}
          onChange={(e) => setOperatingSince(e.target.value)}
        />
      </Field>
      <Field label="Total Reviews">
        <input
          aria-label="Total Reviews"
          type="number"
          min={0}
          className={input}
          value={totalReviews}
          onChange={(e) => setTotalReviews(e.target.value)}
        />
      </Field>
      <Field label="Trips Sold">
        <input
          aria-label="Trips Sold"
          type="number"
          min={0}
          className={input}
          value={tripsSold}
          onChange={(e) => setTripsSold(e.target.value)}
        />
      </Field>
      {canUpdate && (
        <Button
          isLoading={mutation.isPending}
          onClick={() =>
            mutation.mutate({
              name: form.name,
              email: form.email,
              phone: form.phone || null,
              website: form.website || null,
              address: form.address || null,
              operatingSince: intOrNull(operatingSince),
              totalReviews: intOrNull(totalReviews),
              tripsSold: intOrNull(tripsSold),
            })
          }
        >
          Save profile
        </Button>
      )}
      <Feedback error={mutation.error?.message} success={mutation.isSuccess} />
    </section>
  );
}

function BrandingTab({ data, canUpdate }: { data: CompanySettings; canUpdate: boolean }) {
  const branding = useUpdateBranding();
  const upload = useUploadLogo();
  const remove = useRemoveLogo();
  const [color, setColor] = useState(data.branding.primaryColor);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setColor(data.branding.primaryColor), [data.branding.primaryColor]);
  return (
    <section className={card}>
      <h2 className="font-semibold">Branding</h2>
      <Field label="Primary colour">
        <div className="flex items-center gap-2">
          <input
            aria-label="Primary colour picker"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-12 rounded border"
          />
          <input
            aria-label="Primary colour hex"
            className={`${input} max-w-40`}
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </div>
      </Field>
      {canUpdate && (
        <Button
          isLoading={branding.isPending}
          onClick={() => branding.mutate({ primaryColor: color })}
        >
          Save colour
        </Button>
      )}
      <Feedback error={branding.error?.message} success={branding.isSuccess} />

      <div className="border-t pt-4">
        <p className="text-sm font-medium text-slate-700">Company logo</p>
        <div className="mt-2 flex h-24 w-40 items-center justify-center overflow-hidden rounded-lg border bg-slate-50">
          {data.branding.hasLogo && data.branding.logoUrl ? (
            <img
              src={data.branding.logoUrl}
              alt="Company logo"
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-xs text-slate-400">No logo</span>
          )}
        </div>
        {canUpdate && (
          <div className="mt-3 flex items-center gap-2">
            <input
              ref={fileRef}
              aria-label="Logo file"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="text-sm"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload.mutate(file);
              }}
            />
            {data.branding.hasLogo && (
              <Button
                variant="secondary"
                isLoading={remove.isPending}
                onClick={() => remove.mutate()}
              >
                Remove logo
              </Button>
            )}
          </div>
        )}
        {upload.isPending && <p className="mt-1 text-sm text-slate-500">Uploading…</p>}
        <Feedback error={upload.error?.message || remove.error?.message} />
      </div>
    </section>
  );
}

function TaxTab({ data, canUpdate }: { data: CompanySettings; canUpdate: boolean }) {
  const mutation = useUpdateTax();
  const [gstin, setGstin] = useState(data.tax.taxRegistrationNumber ?? '');
  const [tan, setTan] = useState(data.tax.tan ?? '');
  useEffect(() => {
    setGstin(data.tax.taxRegistrationNumber ?? '');
    setTan(data.tax.tan ?? '');
  }, [data.tax.taxRegistrationNumber, data.tax.tan]);
  const errorFields = mutation.error instanceof ApiError ? mutation.error.fields : undefined;
  const fieldError = (key: string) =>
    errorFields?.[key]?.map((message) => (
      <p key={message} role="alert" className="text-sm text-red-700">
        {message}
      </p>
    ));
  return (
    <section className={card}>
      <h2 className="font-semibold">Tax</h2>
      <Field label="GSTIN">
        <input
          aria-label="GSTIN"
          className={input}
          value={gstin}
          onChange={(e) => setGstin(e.target.value)}
        />
        {fieldError('taxRegistrationNumber')}
      </Field>
      <Field label="TAN">
        <input
          aria-label="TAN"
          className={input}
          value={tan}
          onChange={(e) => setTan(e.target.value)}
        />
        {fieldError('tan')}
      </Field>
      <p className="text-xs text-slate-500">
        Printed on Tax Invoices when configured. GST and TCS amounts are still entered per booking —
        this does not enable automatic tax calculation.
      </p>
      {canUpdate && (
        <Button
          isLoading={mutation.isPending}
          onClick={() =>
            mutation.mutate({
              taxRegistrationNumber: gstin || null,
              tan: tan || null,
            })
          }
        >
          Save tax settings
        </Button>
      )}
      <Feedback error={mutation.error?.message} success={mutation.isSuccess} />
    </section>
  );
}

function PreferencesTab({ data, canUpdate }: { data: CompanySettings; canUpdate: boolean }) {
  const mutation = useUpdatePreferences();
  const [timezone, setTimezone] = useState(data.preferences.timezone);
  const [currency, setCurrency] = useState(data.preferences.defaultCurrency);
  useEffect(() => {
    setTimezone(data.preferences.timezone);
    setCurrency(data.preferences.defaultCurrency);
  }, [data.preferences]);
  // Preserve a stored value even if outside the curated list.
  const zones = SETTINGS_TIMEZONES.includes(timezone as (typeof SETTINGS_TIMEZONES)[number])
    ? SETTINGS_TIMEZONES
    : [timezone, ...SETTINGS_TIMEZONES];
  const currencies = SETTINGS_CURRENCIES.includes(currency as (typeof SETTINGS_CURRENCIES)[number])
    ? SETTINGS_CURRENCIES
    : [currency, ...SETTINGS_CURRENCIES];
  return (
    <section className={card}>
      <h2 className="font-semibold">Preferences</h2>
      <Field label="Timezone">
        <select
          aria-label="Timezone"
          className={input}
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </Field>
      <p className="text-xs text-amber-700">
        Changing the timezone affects how future dates are interpreted. Existing timestamps are not
        rewritten.
      </p>
      <Field label="Default currency">
        <select
          aria-label="Default currency"
          className={input}
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        >
          {currencies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <p className="text-xs text-slate-500">Applies to newly created records only.</p>
      {canUpdate && (
        <Button
          isLoading={mutation.isPending}
          onClick={() => mutation.mutate({ timezone, defaultCurrency: currency })}
        >
          Save preferences
        </Button>
      )}
      <Feedback error={mutation.error?.message} success={mutation.isSuccess} />
    </section>
  );
}

function TermsTab({ data, canUpdate }: { data: CompanySettings; canUpdate: boolean }) {
  const mutation = useUpdateDefaultTerms();
  const [quotationTerms, setQuotationTerms] = useState(data.defaultTerms.quotationTerms ?? '');
  const [bookingTerms, setBookingTerms] = useState(data.defaultTerms.bookingTerms ?? '');
  useEffect(() => {
    setQuotationTerms(data.defaultTerms.quotationTerms ?? '');
    setBookingTerms(data.defaultTerms.bookingTerms ?? '');
  }, [data.defaultTerms]);
  return (
    <section className={card}>
      <h2 className="font-semibold">Default Terms</h2>
      <p className="text-xs text-slate-500">
        Used only for new records. Existing quotations and bookings are unchanged;
        quotation-converted bookings keep the quotation terms.
      </p>
      <Field label="Default quotation terms">
        <textarea
          aria-label="Default quotation terms"
          className={input}
          rows={4}
          value={quotationTerms}
          onChange={(e) => setQuotationTerms(e.target.value)}
        />
      </Field>
      <Field label="Default booking terms">
        <textarea
          aria-label="Default booking terms"
          className={input}
          rows={4}
          value={bookingTerms}
          onChange={(e) => setBookingTerms(e.target.value)}
        />
      </Field>
      {canUpdate && (
        <Button
          isLoading={mutation.isPending}
          onClick={() =>
            mutation.mutate({
              quotationTerms: quotationTerms || null,
              bookingTerms: bookingTerms || null,
            })
          }
        >
          Save default terms
        </Button>
      )}
      <Feedback error={mutation.error?.message} success={mutation.isSuccess} />
    </section>
  );
}

const emptyBank = {
  accountHolderName: '',
  bankName: '',
  branchName: '',
  accountNumber: '',
  confirmAccountNumber: '',
  ifscCode: '',
  swiftCode: '',
  accountType: '',
};

function BankTab({ data, canUpdate }: { data: CompanySettings; canUpdate: boolean }) {
  const mutation = useSaveBankAccount();
  const [form, setForm] = useState(emptyBank);
  const [mismatch, setMismatch] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const bank = data.bankAccount;
  return (
    <section className={card}>
      <h2 className="font-semibold">Bank Account</h2>
      {bank.exists && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-medium">{bank.accountHolderName}</p>
          <p className="text-slate-600">
            {bank.bankName}
            {bank.branchName ? ` • ${bank.branchName}` : ''}
          </p>
          <p className="text-slate-600">Account {bank.accountNumberMasked}</p>
          {bank.ifscCode && <p className="text-slate-600">IFSC {bank.ifscCode}</p>}
        </div>
      )}
      {canUpdate && (
        <div className="space-y-3 border-t pt-4">
          <p className="text-sm font-medium">{bank.exists ? 'Replace account' : 'Add account'}</p>
          <Field label="Account holder">
            <input
              aria-label="Account holder"
              className={input}
              value={form.accountHolderName}
              onChange={(e) => set('accountHolderName', e.target.value)}
            />
          </Field>
          <Field label="Bank name">
            <input
              aria-label="Bank name"
              className={input}
              value={form.bankName}
              onChange={(e) => set('bankName', e.target.value)}
            />
          </Field>
          <Field label="Branch name">
            <input
              aria-label="Branch name"
              className={input}
              value={form.branchName}
              onChange={(e) => set('branchName', e.target.value)}
            />
          </Field>
          <Field label="Account number">
            <input
              aria-label="Account number"
              className={input}
              autoComplete="off"
              value={form.accountNumber}
              onChange={(e) => set('accountNumber', e.target.value)}
            />
          </Field>
          <Field label="Confirm account number">
            <input
              aria-label="Confirm account number"
              className={input}
              autoComplete="off"
              value={form.confirmAccountNumber}
              onChange={(e) => set('confirmAccountNumber', e.target.value)}
            />
          </Field>
          <Field label="IFSC code">
            <input
              aria-label="IFSC code"
              className={input}
              value={form.ifscCode}
              onChange={(e) => set('ifscCode', e.target.value)}
            />
          </Field>
          <Field label="SWIFT code">
            <input
              aria-label="SWIFT code"
              className={input}
              value={form.swiftCode}
              onChange={(e) => set('swiftCode', e.target.value)}
            />
          </Field>
          <Field label="Account type">
            <input
              aria-label="Account type"
              className={input}
              value={form.accountType}
              onChange={(e) => set('accountType', e.target.value)}
            />
          </Field>
          {mismatch && (
            <p className="text-sm text-red-700" role="alert">
              Account numbers do not match.
            </p>
          )}
          <Button
            isLoading={mutation.isPending}
            onClick={() => {
              if (form.accountNumber !== form.confirmAccountNumber) {
                setMismatch(true);
                return;
              }
              setMismatch(false);
              mutation.mutate(
                {
                  accountHolderName: form.accountHolderName,
                  bankName: form.bankName,
                  branchName: form.branchName || null,
                  accountNumber: form.accountNumber,
                  confirmAccountNumber: form.confirmAccountNumber,
                  ifscCode: form.ifscCode || null,
                  swiftCode: form.swiftCode || null,
                  accountType: form.accountType || null,
                },
                { onSuccess: () => setForm(emptyBank) },
              );
            }}
          >
            Save bank account
          </Button>
          <Feedback error={mutation.error?.message} success={mutation.isSuccess} />
        </div>
      )}
    </section>
  );
}

export function SettingsPage() {
  const settings = useSettings();
  const [tab, setTab] = useState<TabKey>('profile');

  if (settings.isLoading) return <div className="h-96 animate-pulse rounded-xl bg-card" />;
  if (settings.isError || !settings.data)
    return (
      <div role="alert" className="rounded-xl bg-card p-12 text-center text-red-700">
        Settings could not be loaded.
      </div>
    );
  const data = settings.data;
  const canUpdate = data.capabilities.canUpdate;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-slate-500">Home / Settings</p>
        <h1 className="text-2xl font-semibold">Company Settings</h1>
      </div>
      <nav
        className="flex gap-1 overflow-x-auto rounded-xl border bg-card p-1"
        aria-label="Settings sections"
      >
        {TABS.map(([key, label]) => (
          <button
            key={key}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
              tab === key ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'
            }`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === 'profile' && <ProfileTab data={data} canUpdate={canUpdate} />}
      {tab === 'branding' && <BrandingTab data={data} canUpdate={canUpdate} />}
      {tab === 'tax' && <TaxTab data={data} canUpdate={canUpdate} />}
      {tab === 'preferences' && <PreferencesTab data={data} canUpdate={canUpdate} />}
      {tab === 'terms' && <TermsTab data={data} canUpdate={canUpdate} />}
      {tab === 'bank' && <BankTab data={data} canUpdate={canUpdate} />}
    </div>
  );
}

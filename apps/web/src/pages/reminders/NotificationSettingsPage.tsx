import { BellRing, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { NotificationPreferenceInput } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import {
  useNotificationPreferences,
  useSaveNotificationPreferences,
} from '@/features/reminders/reminders.api';
import { PageHeader } from './ReminderUi';

const preferenceDefaults: NotificationPreferenceInput = {
  inAppEnabled: true,
  emailEnabled: true,
  reminderAlerts: true,
  overdueAlerts: true,
  escalationAlerts: true,
  bookingAlerts: true,
  paymentAlerts: true,
  quotationAlerts: true,
  documentAlerts: true,
  vendorAlerts: true,
  digestMode: 'IMMEDIATE',
  quietHoursStart: null,
  quietHoursEnd: null,
};

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <span className="sr-only">{label}</span>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="relative h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-brand-600 after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-card after:transition peer-checked:after:translate-x-5" />
    </label>
  );
}

export function NotificationSettingsPage() {
  const query = useNotificationPreferences();
  const save = useSaveNotificationPreferences();
  const [form, setForm] = useState<NotificationPreferenceInput>(preferenceDefaults);
  useEffect(() => {
    if (query.data) setForm({ ...preferenceDefaults, ...query.data });
  }, [query.data]);
  const alerts = [
    ['reminderAlerts', 'Reminder alerts', 'Due and newly assigned reminders'],
    ['overdueAlerts', 'Overdue reminder alerts', 'Reminders that pass their due time'],
  ] as const;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reminder notifications"
        title="Notification Settings"
        description="Configure reminder notifications delivered in the CRM notification inbox."
      />
      <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <BellRing className="mt-0.5 h-5 w-5 shrink-0" />
        <p>
          Reminders are manual only. When a reminder becomes due it appears in the CRM
          notification inbox, and it shows as overdue if it passes its due time.
        </p>
      </div>
      <section className="rounded-xl border bg-card shadow-sm">
        <div className="border-b p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <BellRing className="h-5 w-5 text-brand-600" />
            My reminder notifications
          </h2>
          <p className="mt-1 text-sm text-slate-500">These settings apply only to your account.</p>
        </div>
        <div className="space-y-3 p-5">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="font-medium">In-app notifications</p>
              <p className="text-xs text-slate-500">Show notifications inside the CRM</p>
            </div>
            <Toggle
              label="In-app notifications"
              checked={form.inAppEnabled}
              onChange={(value) => setForm({ ...form, inAppEnabled: value })}
            />
          </div>
          {alerts.map(([key, label, description]) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-slate-500">{description}</p>
              </div>
              <Toggle
                label={label}
                checked={form[key]}
                onChange={(value) => setForm({ ...form, [key]: value })}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end border-t p-4">
          <Button isLoading={save.isPending} onClick={() => save.mutate(form)}>
            <Save className="h-4 w-4" />
            Save preferences
          </Button>
        </div>
      </section>
    </div>
  );
}

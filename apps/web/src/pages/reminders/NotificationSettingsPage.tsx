import { BellRing, Mail, RefreshCw, Save, Settings2, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { NotificationPreferenceInput } from '@interscale/shared';
import { PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  useNotificationPreferences,
  useReminderRules,
  useRuleAction,
  useSaveNotificationPreferences,
} from '@/features/reminders/reminders.api';
import { fieldClass, PageHeader } from './ReminderUi';

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
      <span className="relative h-6 w-11 rounded-full bg-slate-300 transition peer-checked:bg-brand-600 after:absolute after:left-1 after:top-1 after:h-4 after:w-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
    </label>
  );
}

function RulesPanel() {
  const rules = useReminderRules();
  const action = useRuleAction();
  const groups = [
    ['Lead stage rules', ['LEAD_STAGE']],
    [
      'Booking & customer rules',
      ['BOOKING_TRAVEL', 'CUSTOMER_PAYMENT', 'BOOKING_DOCUMENT', 'VISA', 'SERVICE_CONFIRMATION'],
    ],
    ['Quotation rules', ['QUOTATION_EXPIRY']],
    ['Vendor rules', ['VENDOR_PAYABLE', 'VENDOR_CONTRACT']],
  ] as const;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Automation rules</h2>
          <p className="text-sm text-slate-500">
            Tenant-specific timing, assignment, templates, delivery and escalation.
          </p>
        </div>
        <Button
          variant="secondary"
          isLoading={action.isPending}
          onClick={() => action.mutate({ action: 'reset' })}
        >
          <RefreshCw className="h-4 w-4" />
          Reset defaults
        </Button>
      </div>
      {rules.isPending ? (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500">
          Loading automation rules…
        </div>
      ) : rules.isError ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          Could not load reminder rules.
        </div>
      ) : (
        groups.map(([label, types]) => {
          const rows =
            rules.data?.rules.filter((rule) =>
              (types as readonly string[]).includes(rule.ruleType),
            ) ?? [];
          if (!rows.length) return null;
          return (
            <div key={label}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {label}
              </h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {rows.map((rule) => (
                  <article key={rule.id} className="rounded-xl border bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-semibold text-slate-900">{rule.name}</h4>
                        <p className="mt-1 text-sm text-slate-500">{rule.description}</p>
                      </div>
                      <Toggle
                        label={`Enable ${rule.name}`}
                        checked={rule.isEnabled}
                        onChange={(isEnabled) =>
                          action.mutate({ action: 'update', id: rule.id, body: { isEnabled } })
                        }
                      />
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-xs">
                      <div>
                        <span className="block text-slate-500">Timing</span>
                        <strong>
                          {rule.delayValue} {rule.delayUnit.toLowerCase()}
                        </strong>
                      </div>
                      <div>
                        <span className="block text-slate-500">Due time</span>
                        <strong>{rule.dueTime}</strong>
                      </div>
                      <div>
                        <span className="block text-slate-500">Assignment</span>
                        <strong>{rule.assignToMode.replaceAll('_', ' ').toLowerCase()}</strong>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span>
                        {rule.channels.join(' + ')} ·{' '}
                        {rule.escalationEnabled ? 'Escalates' : 'No escalation'}
                      </span>
                      <span>
                        {rule._count.reminders} reminders · {rule._count.executions} runs
                      </span>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          action.mutate(
                            { action: 'preview', id: rule.id },
                            {
                              onSuccess: (result) =>
                                alert(`Rule preview: ${JSON.stringify(result)}`),
                            },
                          )
                        }
                      >
                        Preview
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => action.mutate({ action: 'run', id: rule.id })}
                      >
                        Run now
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}

export function NotificationSettingsPage() {
  const { hasPermission } = useAuth();
  const query = useNotificationPreferences();
  const save = useSaveNotificationPreferences();
  const [form, setForm] = useState<NotificationPreferenceInput>(preferenceDefaults);
  useEffect(() => {
    if (query.data) setForm({ ...preferenceDefaults, ...query.data });
  }, [query.data]);
  const preferences = [
    ['reminderAlerts', 'Reminder alerts', 'Due and newly assigned reminders'],
    ['overdueAlerts', 'Overdue alerts', 'Reminders that pass their due time'],
    ['escalationAlerts', 'Escalations', 'Team reminders requiring manager attention'],
    ['bookingAlerts', 'Booking events', 'Travel and operational booking changes'],
    ['paymentAlerts', 'Payment events', 'Customer instalments and overdue payments'],
    ['quotationAlerts', 'Quotation events', 'Quotation follow-up and expiry'],
    ['documentAlerts', 'Document events', 'Passport, visa and document gaps'],
    ['vendorAlerts', 'Vendor events', 'Supplier confirmation, payables and contracts'],
  ] as const;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Automation control centre"
        title="Notification Settings"
        description="Configure your delivery preferences and company reminder automation."
      />
      <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        <p>
          Rules run per company timezone and use deduplication keys. In-app and email delivery are
          recorded separately, and email failure never rolls back reminder creation.
        </p>
      </div>
      <section className="rounded-xl border bg-white shadow-sm">
        <div className="border-b p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <BellRing className="h-5 w-5 text-brand-600" />
            My notification preferences
          </h2>
          <p className="mt-1 text-sm text-slate-500">These settings apply only to your account.</p>
        </div>
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <div className="space-y-3">
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
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="flex items-center gap-1 font-medium">
                  <Mail className="h-4 w-4" />
                  Email notifications
                </p>
                <p className="text-xs text-slate-500">Send immediate email alerts when allowed</p>
              </div>
              <Toggle
                label="Email notifications"
                checked={form.emailEnabled}
                onChange={(value) => setForm({ ...form, emailEnabled: value })}
              />
            </div>
            <label className="block text-sm font-medium text-slate-700">
              Digest mode
              <select
                className={`${fieldClass} mt-1 w-full`}
                value={form.digestMode}
                onChange={(event) =>
                  setForm({
                    ...form,
                    digestMode: event.target.value as NotificationPreferenceInput['digestMode'],
                  })
                }
              >
                <option value="IMMEDIATE">Immediate</option>
                <option value="DAILY">Daily digest</option>
                <option value="NONE">No email digest</option>
              </select>
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {preferences.map(([key, label, description]) => (
              <div
                key={key}
                className="flex items-start justify-between gap-2 rounded-lg border p-3"
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
        </div>
        <div className="flex justify-end border-t p-4">
          <Button isLoading={save.isPending} onClick={() => save.mutate(form)}>
            <Save className="h-4 w-4" />
            Save preferences
          </Button>
        </div>
      </section>
      {hasPermission(PERMISSIONS.REMINDERS_MANAGE_RULES) ? (
        <RulesPanel />
      ) : (
        <div className="rounded-xl border bg-white p-5">
          <div className="flex items-center gap-2 font-semibold">
            <Settings2 className="h-5 w-5" />
            Automation rules
          </div>
          <p className="mt-1 text-sm text-slate-500">
            An Owner or Manager can configure company-wide reminder rules.
          </p>
        </div>
      )}
    </div>
  );
}

import { ArrowLeft, Lightbulb, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { REMINDER_PRIORITIES, REMINDER_TYPES } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { FormField, inputClasses } from '@/components/ui/FormField';
import {
  useReminder,
  useReminderLookups,
  useSaveReminder,
} from '@/features/reminders/reminders.api';
import { PageHeader, Pill } from './ReminderUi';

type EntityType = '' | 'query' | 'customer' | 'quotation' | 'booking' | 'vendor';
interface State {
  title: string;
  description: string;
  dueAt: string;
  assignedToId: string;
  reminderType: string;
  priority: string;
  entityType: EntityType;
  entityId: string;
}
const initial: State = {
  title: '',
  description: '',
  dueAt: '',
  assignedToId: '',
  reminderType: 'CUSTOM',
  priority: 'MEDIUM',
  entityType: '',
  entityId: '',
};
const localDateTime = (value: string) => {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export function ReminderFormPage() {
  const { reminderId } = useParams();
  const navigate = useNavigate();
  const reminder = useReminder(reminderId);
  const lookups = useReminderLookups();
  const save = useSaveReminder(reminderId);
  const [form, setForm] = useState<State>(initial);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!reminder.data) return;
    const row = reminder.data;
    const entityType: EntityType = row.queryId
      ? 'query'
      : row.customerId
        ? 'customer'
        : row.quotationId
          ? 'quotation'
          : row.bookingId
            ? 'booking'
            : row.vendorId
              ? 'vendor'
              : '';
    const entityId =
      row.queryId ?? row.customerId ?? row.quotationId ?? row.bookingId ?? row.vendorId ?? '';
    setForm({
      title: row.title,
      description: row.description ?? '',
      dueAt: localDateTime(row.dueAt),
      assignedToId: row.assignedTo.id,
      reminderType: row.reminderType,
      priority: row.priority,
      entityType,
      entityId,
    });
  }, [reminder.data]);
  const options =
    form.entityType === 'query'
      ? lookups.data?.queries.map((row) => ({
          id: row.id,
          label: `${row.queryNumber} · ${row.customerName}`,
        }))
      : form.entityType === 'customer'
        ? lookups.data?.customers.map((row) => ({
            id: row.id,
            label: `${row.customerNumber} · ${row.displayName}`,
          }))
        : form.entityType === 'quotation'
          ? lookups.data?.quotations.map((row) => ({
              id: row.id,
              label: `${row.quotationNumber} · ${row.customerName}`,
            }))
          : form.entityType === 'booking'
            ? lookups.data?.bookings.map((row) => ({
                id: row.id,
                label: `${row.bookingNumber} · ${row.customerName}`,
              }))
            : form.entityType === 'vendor'
              ? lookups.data?.vendors.map((row) => ({
                  id: row.id,
                  label: `${row.vendorCode} · ${row.name}`,
                }))
              : [];
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!form.title.trim() || !form.dueAt || !form.assignedToId) {
      setError('Title, due date and assignee are required.');
      return;
    }
    const link =
      form.entityType && form.entityId ? { [`${form.entityType}Id`]: form.entityId } : {};
    save.mutate(
      {
        title: form.title,
        description: form.description || null,
        dueAt: new Date(form.dueAt),
        assignedToId: form.assignedToId,
        reminderType: form.reminderType as never,
        priority: form.priority as never,
        ...link,
      },
      {
        onSuccess: (row) => navigate(`/reminders/${row.id}`),
        onError: (reason) =>
          setError(reason instanceof Error ? reason.message : 'Could not save reminder.'),
      },
    );
  };
  if (reminderId && reminder.isPending)
    return <div className="p-8 text-sm text-slate-500">Loading reminder…</div>;
  return (
    <div className="space-y-5">
      <Link
        to="/reminders"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-brand-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to reminders
      </Link>
      <PageHeader
        eyebrow={reminderId ? 'Reminder details' : 'Plan the next action'}
        title={reminderId ? 'Edit Reminder' : 'Create Reminder'}
        description="Set a clear owner and due time. You can link the reminder to a CRM record."
        action={
          reminder.data ? (
            <div className="flex gap-2">
              <Pill>{reminder.data.status}</Pill>
              <Pill kind="priority">{reminder.data.priority}</Pill>
            </div>
          ) : undefined
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <form onSubmit={submit} className="space-y-5 rounded-xl border bg-white p-5 shadow-sm">
          {error && (
            <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <FormField label="Reminder title" required>
                {(props) => (
                  <input
                    {...props}
                    className={inputClasses(props['aria-invalid'])}
                    value={form.title}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, title: event.target.value }))
                    }
                    placeholder="Call customer about quotation"
                  />
                )}
              </FormField>
            </div>
            <FormField label="Reminder type" required>
              {(props) => (
                <select
                  {...props}
                  className={inputClasses(false)}
                  value={form.reminderType}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, reminderType: event.target.value }))
                  }
                >
                  {REMINDER_TYPES.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              )}
            </FormField>
            <FormField label="Priority" required>
              {(props) => (
                <select
                  {...props}
                  className={inputClasses(false)}
                  value={form.priority}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, priority: event.target.value }))
                  }
                >
                  {REMINDER_PRIORITIES.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              )}
            </FormField>
            <FormField label="Due date and time" required>
              {(props) => (
                <input
                  {...props}
                  type="datetime-local"
                  className={inputClasses(false)}
                  value={form.dueAt}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, dueAt: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField label="Assigned to" required>
              {(props) => (
                <select
                  {...props}
                  className={inputClasses(false)}
                  value={form.assignedToId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, assignedToId: event.target.value }))
                  }
                >
                  <option value="">Select owner</option>
                  {lookups.data?.users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.fullName}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            <FormField label="Linked record type">
              {(props) => (
                <select
                  {...props}
                  className={inputClasses(false)}
                  value={form.entityType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      entityType: event.target.value as EntityType,
                      entityId: '',
                    }))
                  }
                >
                  <option value="">No linked record</option>
                  <option value="query">Lead</option>
                  <option value="customer">Customer</option>
                  <option value="quotation">Quotation</option>
                  <option value="booking">Booking</option>
                  <option value="vendor">Vendor</option>
                </select>
              )}
            </FormField>
            <FormField label="Linked record">
              {(props) => (
                <select
                  {...props}
                  disabled={!form.entityType}
                  className={inputClasses(false)}
                  value={form.entityId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, entityId: event.target.value }))
                  }
                >
                  <option value="">Select record</option>
                  {options?.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
            <div className="md:col-span-2">
              <FormField
                label="Description"
                hint="Include the outcome you need or context for the assignee."
              >
                {(props) => (
                  <textarea
                    {...props}
                    rows={5}
                    className={`${inputClasses(false)} h-auto`}
                    value={form.description}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, description: event.target.value }))
                    }
                  />
                )}
              </FormField>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Link to="/reminders">
              <Button variant="secondary">Cancel</Button>
            </Link>
            <Button type="submit" isLoading={save.isPending}>
              <Save className="h-4 w-4" />
              {reminderId ? 'Save changes' : 'Create reminder'}
            </Button>
          </div>
        </form>
        <aside className="h-fit rounded-xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-center gap-2 font-semibold text-blue-900">
            <Lightbulb className="h-5 w-5" />
            Reminder tips
          </div>
          <ul className="mt-3 space-y-3 text-sm text-blue-800">
            <li>Use an action-oriented title.</li>
            <li>Choose the person responsible for the next step.</li>
            <li>Link a CRM record so the reminder opens in context.</li>
            <li>Snooze only when the next action genuinely moves.</li>
          </ul>
          {reminder.data?.reminderRule && (
            <p className="mt-4 rounded-lg bg-white/70 p-3 text-xs text-blue-700">
              Automated by {reminder.data.reminderRule.name}
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

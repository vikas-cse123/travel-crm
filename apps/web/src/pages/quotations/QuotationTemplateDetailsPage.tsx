import { ArrowLeft, Edit3, Play, Printer, Route, Sparkles } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PERMISSIONS, labelForLookup } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useQuotationTemplate } from '@/features/quotations/quotations.api';

export function QuotationTemplateDetailsPage() {
  const { templateId = '' } = useParams();
  const { hasPermission } = useAuth();
  const template = useQuotationTemplate(templateId, true);
  if (template.isLoading) return <div className="h-96 animate-pulse rounded-xl bg-white" />;
  if (!template.data)
    return <div className="rounded-xl bg-white p-12 text-center">Template unavailable.</div>;
  const t = template.data;
  const money = (value: string | null | undefined) =>
    value
      ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: t.baseCurrency }).format(
          Number(value),
        )
      : '—';
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/quotation-templates" className="rounded-lg p-2 hover:bg-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-sm text-slate-500">Quotation templates / {t.templateCode}</p>
            <h1 className="text-2xl font-semibold">{t.name}</h1>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
          {hasPermission(PERMISSIONS.QUOTATION_TEMPLATES_UPDATE) && (
            <Link to={`/quotation-templates/${t.id}/edit`}>
              <Button>
                <Edit3 className="h-4 w-4" />
                Edit
              </Button>
            </Link>
          )}
        </div>
      </header>
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 to-brand-900 p-6 text-white shadow-lg">
        <p className="text-sm text-blue-200">{t.destinationSummary}</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-semibold">{t.name}</h2>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {[
                `${t.durationNights} nights`,
                `${t.durationDays} days`,
                `${t.counts?.cities ?? 0} cities`,
                `${t.counts?.services ?? t.services.length} services`,
              ].map((v) => (
                <span key={v} className="rounded-full bg-white/10 px-3 py-1.5">
                  {v}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-5 text-center text-sm">
            <div>
              <strong className="block text-xl">{t.usageCount}</strong>uses
            </div>
            <div>
              <strong className="block text-emerald-300">{labelForLookup(t.status)}</strong>status
            </div>
            <div>
              <strong className="block">{t.createdBy.fullName}</strong>creator
            </div>
          </div>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-4">
        {[
          ['Adult', t.adultBasePrice],
          ['Child with bed', t.childWithBedBasePrice],
          ['Child without bed', t.childWithoutBedBasePrice],
          ['Infant', t.infantBasePrice],
        ].map(([label, value]) => (
          <article key={label} className="rounded-xl border bg-white p-4 text-center">
            <p className="text-xs uppercase text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-semibold text-brand-700">{money(value)}</p>
          </article>
        ))}
      </section>
      <section className="rounded-xl border bg-white p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Route className="h-5 w-5 text-brand-600" />
          Itinerary route
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {t.itinerary.map((day) => (
            <span
              key={day.id}
              className="rounded-full bg-brand-50 px-3 py-2 text-sm text-brand-800"
            >
              Day {day.dayNumber} · {day.destination}
            </span>
          ))}
        </div>
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Accommodation options</h2>
          <div className="mt-4 divide-y">
            {t.hotels.map((hotel) => (
              <article key={hotel.id} className="py-3">
                <strong>{hotel.hotelName}</strong>
                <p className="text-sm text-slate-600">
                  {hotel.city} · {hotel.category || 'Category open'} ·{' '}
                  {hotel.roomType || 'Room open'} · {hotel.mealPlan || 'Meal plan open'} ·{' '}
                  {hotel.nights} nights
                </p>
              </article>
            ))}
          </div>
        </section>
        <section className="rounded-xl border bg-white p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-5 w-5 text-violet-600" />
            Sightseeing and services
          </h2>
          <div className="mt-4 divide-y">
            {t.services.map((service) => (
              <article key={service.id} className="py-3">
                <strong>{service.name}</strong>
                <p className="text-sm text-slate-600">
                  {labelForLookup(service.serviceType)}
                  {service.city ? ` · ${service.city}` : ''}
                  {service.dayNumber ? ` · Day ${service.dayNumber}` : ''}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {[
          ['Inclusions', t.inclusions],
          ['Exclusions', t.exclusions],
          ['Terms', t.terms],
        ].map(([label, rows]) => (
          <section key={label as string} className="rounded-xl border bg-white p-5">
            <h2 className="font-semibold">{label as string}</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {(rows as typeof t.inclusions).map((row) => (
                <li key={row.id}>• {row.content}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {hasPermission(PERMISSIONS.QUOTATIONS_CREATE) && (
        <section className="rounded-xl border border-brand-200 bg-brand-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Ready to use this package?</h2>
              <p className="text-sm text-slate-600">
                Open a lead and create a customer-specific quotation from this immutable snapshot.
              </p>
            </div>
            <Link to={`/quotations/new?templateId=${t.id}`}>
              <Button>
                <Play className="h-4 w-4" />
                Use template
              </Button>
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

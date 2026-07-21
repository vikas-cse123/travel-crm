import { useEffect, useState } from 'react';
import { CheckCircle2, Download, XCircle } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import type { QuotationVersion } from '@/features/quotations/quotations.api';

interface PublicQuotation {
  company: {
    name: string;
    email: string;
    phone: string | null;
    website: string | null;
    address: string | null;
    primaryColor: string;
  };
  quotation: {
    quotationNumber: string;
    customerName: string;
    destinationSummary: string;
    travelStartDate: string | null;
    travelEndDate: string | null;
    adults: number;
    childrenWithBed: number;
    childrenWithoutBed: number;
    infants: number;
    rooms: number;
    validUntil: string | null;
    status: string;
  };
  version: QuotationVersion;
  downloadUrl: string | null;
}
interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { message: string };
}
async function publicRequest<T>(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = (await response.json()) as Envelope<T>;
  if (!response.ok || !payload.success || !payload.data)
    throw new Error(payload.error?.message || 'Request failed.');
  return payload.data;
}
export function PublicQuotationPage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<PublicQuotation | null>(null);
  const [error, setError] = useState('');
  const [decision, setDecision] = useState<'accept' | 'reject' | null>(null);
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  useEffect(() => {
    void publicRequest<PublicQuotation>(`/public/quotations/${encodeURIComponent(token)}`)
      .then((value) => {
        setData(value);
        setName(value.quotation.customerName);
      })
      .catch((value: unknown) =>
        setError(value instanceof Error ? value.message : 'Quotation unavailable.'),
      );
  }, [token]);
  if (error)
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="max-w-md rounded-xl bg-white p-8 text-center shadow">
          <XCircle className="mx-auto h-10 w-10 text-red-600" />
          <h1 className="mt-3 text-xl font-semibold">Quotation unavailable</h1>
          <p className="mt-2 text-slate-500">{error}</p>
        </div>
      </main>
    );
  if (!data) return <div className="min-h-screen animate-pulse bg-slate-100" />;
  const q = data.quotation,
    v = data.version;
  const color = /^#[0-9a-f]{6}$/i.test(data.company.primaryColor)
    ? data.company.primaryColor
    : '#2563eb';
  const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: v.currency }).format(
    Number(v.finalAmount),
  );
  const decide = async () => {
    if (!decision) return;
    setBusy(true);
    try {
      await publicRequest(
        `/public/quotations/${encodeURIComponent(token)}/${decision}`,
        'POST',
        decision === 'accept'
          ? { customerName: name, confirmed: true, note: note || null }
          : { reason, note: note || null },
      );
      setResult(
        decision === 'accept'
          ? 'Your acceptance has been recorded. The travel team will contact you next.'
          : 'Your response has been recorded. The travel team may contact you to discuss alternatives.',
      );
      setDecision(null);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Unable to record response.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="min-h-screen bg-slate-100 pb-12">
      <header className="px-6 py-8 text-white" style={{ backgroundColor: color }}>
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-5">
          <div>
            <p className="text-sm text-white/75">Prepared by</p>
            <h1 className="text-2xl font-semibold">{data.company.name}</h1>
            <p className="mt-1 text-sm text-white/80">
              {[data.company.email, data.company.phone, data.company.website]
                .filter(Boolean)
                .join(' • ')}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-white/75">Quotation</p>
            <strong className="text-xl">
              {q.quotationNumber} · v{v.versionNumber}
            </strong>
          </div>
        </div>
      </header>
      <div className="mx-auto -mt-3 max-w-5xl space-y-5 px-4">
        <section className="rounded-2xl bg-white p-6 shadow-lg">
          <p className="text-sm font-medium" style={{ color }}>
            Travel proposal for {q.customerName}
          </p>
          <h2 className="mt-1 text-3xl font-semibold">{v.title}</h2>
          <p className="mt-2 text-slate-600">{v.introduction}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500">Destination</p>
              <strong>{q.destinationSummary}</strong>
            </div>
            <div>
              <p className="text-xs text-slate-500">Travel</p>
              <strong>
                {q.travelStartDate ? new Date(q.travelStartDate).toLocaleDateString() : 'Flexible'}{' '}
                – {q.travelEndDate ? new Date(q.travelEndDate).toLocaleDateString() : 'Open'}
              </strong>
            </div>
            <div>
              <p className="text-xs text-slate-500">Travellers</p>
              <strong>
                {q.adults} adults · {q.childrenWithBed + q.childrenWithoutBed} children ·{' '}
                {q.infants} infants
              </strong>
            </div>
            <div>
              <p className="text-xs text-slate-500">Rooms</p>
              <strong>{q.rooms}</strong>
            </div>
          </div>
        </section>
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Hotels</h2>
            <div className="mt-3 space-y-3">
              {v.hotels.map((hotel) => (
                <article key={hotel.id} className="rounded-lg border p-3">
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
          <section className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Services and experiences</h2>
            <div className="mt-3 space-y-3">
              {v.services.map((service) => (
                <article key={service.id} className="border-b pb-2">
                  <strong>{service.name}</strong>
                  <p className="text-sm text-slate-600">{service.description}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="font-semibold">Day-wise itinerary</h2>
          <div className="mt-4 space-y-5">
            {v.itinerary.map((day) => (
              <article key={day.id} className="border-l-2 pl-4" style={{ borderColor: color }}>
                <p className="text-sm font-medium" style={{ color }}>
                  Day {day.dayNumber} · {day.destination}
                </p>
                <h3 className="font-semibold">{day.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{day.description}</p>
                {(day.meals || day.overnightLocation) && (
                  <p className="mt-1 text-xs text-slate-500">
                    {day.meals && `Meals: ${day.meals}`}
                    {day.meals && day.overnightLocation ? ' • ' : ''}
                    {day.overnightLocation && `Overnight: ${day.overnightLocation}`}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
        <div className="grid gap-5 md:grid-cols-3">
          {[
            ['Inclusions', v.inclusions],
            ['Exclusions', v.exclusions],
            ['Terms', v.terms],
          ].map(([label, rows]) => (
            <section key={label as string} className="rounded-xl bg-white p-5 shadow-sm">
              <h2 className="font-semibold">{label as string}</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {(rows as typeof v.inclusions).map((row) => (
                  <li key={row.id}>• {row.content}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <section className="rounded-2xl bg-slate-950 p-6 text-white shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="text-sm text-slate-300">Final quotation amount</p>
              <p className="mt-1 text-4xl font-semibold">{money}</p>
              <p className="mt-2 text-sm text-slate-400">
                Valid until{' '}
                {q.validUntil ? new Date(q.validUntil).toLocaleDateString() : 'as advised'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.downloadUrl && (
                <a href={data.downloadUrl}>
                  <Button variant="secondary">
                    <Download className="h-4 w-4" />
                    Download PDF
                  </Button>
                </a>
              )}
              {!['ACCEPTED', 'REJECTED', 'EXPIRED'].includes(q.status) && !result && (
                <>
                  <Button onClick={() => setDecision('accept')}>
                    <CheckCircle2 className="h-4 w-4" />
                    Accept
                  </Button>
                  <Button variant="danger" onClick={() => setDecision('reject')}>
                    <XCircle className="h-4 w-4" />
                    Reject
                  </Button>
                </>
              )}
            </div>
          </div>
          {result && (
            <p className="mt-5 rounded-lg bg-emerald-900/50 p-4 text-emerald-100">{result}</p>
          )}
        </section>
      </div>
      {decision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-xl bg-white p-6">
            <h2 className="text-lg font-semibold">
              {decision === 'accept' ? 'Accept quotation' : 'Reject quotation'}
            </h2>
            <div className="mt-4 space-y-3">
              {decision === 'accept' ? (
                <label className="block text-sm font-medium">
                  Your name
                  <input
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
              ) : (
                <label className="block text-sm font-medium">
                  Reason
                  <textarea
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
              )}
              <label className="block text-sm font-medium">
                Optional note
                <textarea
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDecision(null)}>
                Cancel
              </Button>
              <Button
                variant={decision === 'reject' ? 'danger' : 'primary'}
                disabled={decision === 'accept' ? !name : !reason}
                isLoading={busy}
                onClick={decide}
              >
                Confirm {decision}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

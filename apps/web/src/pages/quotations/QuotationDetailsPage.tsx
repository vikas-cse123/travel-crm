import { useState } from 'react';
import {
  ArrowLeft,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Mail,
  Plus,
  Send,
  TicketCheck,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { labelForLookup, PERMISSIONS } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  uploadQuotationAttachment,
  useQuotation,
  useQuotationAction,
  useSendQuotation,
} from '@/features/quotations/quotations.api';

const field = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
export function QuotationDetailsPage() {
  const { quotationId = '' } = useParams();
  const { hasPermission } = useAuth();
  const query = useQuotation(quotationId);
  const action = useQuotationAction(quotationId);
  const send = useSendQuotation(quotationId);
  const [sendOpen, setSendOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [includePdf, setIncludePdf] = useState(true);
  const [includePublicLink, setIncludePublicLink] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  if (query.isLoading) return <div className="h-96 animate-pulse rounded-xl bg-white" />;
  if (!query.data)
    return <div className="rounded-xl bg-white p-12 text-center">Quotation unavailable.</div>;
  const q = query.data;
  const current = q.versions.find((version) => version.id === q.currentVersionId) ?? q.versions[0];
  const money = (value: string, currency: string) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(value));
  const createRevision = () =>
    current && action.mutate({ path: 'versions', body: { sourceVersionId: current.id } });
  const createLink = () =>
    current &&
    action.mutate(
      { path: 'public-link', body: { quotationVersionId: current.id } },
      {
        onSuccess: (result) => {
          const url = (result as { url?: string }).url;
          if (url) void navigator.clipboard.writeText(url);
        },
      },
    );
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/quotations" className="rounded-lg p-2 hover:bg-white">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-sm text-slate-500">Customer quotations / {q.quotationNumber}</p>
            <h1 className="text-2xl font-semibold">
              {q.customerName} · {q.destinationSummary}
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {q.booking ? (
            <Link to={`/bookings/${q.booking.id}`}>
              <Button variant="secondary">
                <TicketCheck className="h-4 w-4" />
                View {q.booking.bookingNumber}
              </Button>
            </Link>
          ) : (
            q.status === 'ACCEPTED' &&
            hasPermission(PERMISSIONS.BOOKINGS_CONVERT_FROM_QUOTATION) && (
              <Link to={`/quotations/${q.id}/convert-to-booking`}>
                <Button>
                  <TicketCheck className="h-4 w-4" />
                  Convert to booking
                </Button>
              </Link>
            )
          )}
          {current?.status === 'DRAFT' && hasPermission(PERMISSIONS.QUOTATIONS_UPDATE) && (
            <Link to={`/quotations/${q.id}/versions/${current.id}/edit`}>
              <Button variant="secondary">
                <Edit3 className="h-4 w-4" />
                Edit draft
              </Button>
            </Link>
          )}
          {current?.status !== 'DRAFT' &&
            q.status !== 'ACCEPTED' &&
            hasPermission(PERMISSIONS.QUOTATIONS_UPDATE) && (
              <Button variant="secondary" onClick={createRevision}>
                <Plus className="h-4 w-4" />
                Create revision
              </Button>
            )}
          {current?.status === 'FINALIZED' && hasPermission(PERMISSIONS.QUOTATIONS_SEND) && (
            <Button
              onClick={() => {
                setEmail(q.customerEmail ?? '');
                setSendOpen(true);
              }}
            >
              <Send className="h-4 w-4" />
              Send
            </Button>
          )}
        </div>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Status', labelForLookup(q.status)],
          [
            'Current version',
            current ? `v${current.versionNumber} · ${labelForLookup(current.status)}` : '—',
          ],
          ['Final amount', current ? money(current.finalAmount, current.currency) : '—'],
          ['Last sent', q.lastSentAt ? new Date(q.lastSentAt).toLocaleString() : 'Never'],
          ['Last viewed', q.lastViewedAt ? new Date(q.lastViewedAt).toLocaleString() : 'Never'],
        ].map(([label, value]) => (
          <article key={label} className="rounded-xl border bg-white p-4">
            <p className="text-xs uppercase text-slate-500">{label}</p>
            <p className="mt-2 font-semibold">{value}</p>
          </article>
        ))}
      </section>
      <section className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h2 className="font-semibold">Customer and travel</h2>
            <p className="mt-1 text-sm text-slate-500">
              Linked lead{' '}
              <Link className="text-brand-700" to={`/queries/${q.query.id}`}>
                {q.query.queryNumber}
              </Link>
            </p>
          </div>
          <div className="flex gap-2">
            {current?.status === 'DRAFT' && hasPermission(PERMISSIONS.QUOTATIONS_UPDATE) && (
              <Button onClick={() => action.mutate({ path: `versions/${current.id}/finalize` })}>
                Finalize v{current.versionNumber}
              </Button>
            )}
            {current &&
              current.status !== 'DRAFT' &&
              hasPermission(PERMISSIONS.QUOTATIONS_GENERATE_PDF) && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    action.mutate({ path: `versions/${current.id}/generate-pdf`, body: {} })
                  }
                >
                  <FileText className="h-4 w-4" />
                  Generate PDF
                </Button>
              )}
            {current?.status !== 'DRAFT' && (
              <Button variant="secondary" onClick={createLink}>
                <ExternalLink className="h-4 w-4" />
                Copy public link
              </Button>
            )}
          </div>
        </div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">Contact</dt>
            <dd>
              {q.customerEmail || '—'}
              <br />
              {q.customerPhone}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Travel dates</dt>
            <dd>
              {q.travelStartDate ? new Date(q.travelStartDate).toLocaleDateString() : 'Flexible'} –{' '}
              {q.travelEndDate ? new Date(q.travelEndDate).toLocaleDateString() : 'Open'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Travellers</dt>
            <dd>
              {q.adults} adults · {q.childrenWithBed + q.childrenWithoutBed} children · {q.infants}{' '}
              infants
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Valid until</dt>
            <dd>{q.validUntil ? new Date(q.validUntil).toLocaleDateString() : 'Not set'}</dd>
          </div>
        </dl>
      </section>
      {current && (
        <section className="rounded-xl border bg-white p-6">
          <div className="border-b pb-5">
            <p className="text-sm text-brand-700">
              Customer preview · Version {current.versionNumber}
            </p>
            <h2 className="mt-1 text-2xl font-semibold">{current.title}</h2>
            <p className="mt-2 text-slate-600">{current.introduction}</p>
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="font-semibold">Hotels</h3>
              <div className="mt-2 space-y-2">
                {current.hotels.map((hotel) => (
                  <article key={hotel.id} className="rounded-lg bg-slate-50 p-3">
                    <strong>{hotel.hotelName}</strong>
                    <p className="text-sm text-slate-600">
                      {hotel.city} · {hotel.nights} nights · {hotel.roomType || 'Room open'} ·{' '}
                      {hotel.mealPlan || 'Meal plan open'}
                    </p>
                  </article>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-semibold">Itinerary</h3>
              <div className="mt-2 space-y-3">
                {current.itinerary.map((day) => (
                  <article key={day.id} className="border-l-2 border-brand-300 pl-3">
                    <strong>
                      Day {day.dayNumber} · {day.title}
                    </strong>
                    <p className="text-sm text-slate-600">{day.description}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              ['Inclusions', current.inclusions],
              ['Exclusions', current.exclusions],
              ['Terms', current.terms],
            ].map(([label, rows]) => (
              <div key={label as string}>
                <h3 className="font-semibold">{label as string}</h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {(rows as typeof current.inclusions).map((row) => (
                    <li key={row.id}>• {row.content}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-xl bg-slate-950 p-5 text-white">
            <p className="text-sm text-slate-300">Final quotation amount</p>
            <p className="mt-1 text-3xl font-semibold">
              {money(current.finalAmount, current.currency)}
            </p>
            {current.marginAmount && (
              <p className="mt-2 text-xs text-slate-400">
                Internal margin: {money(current.marginAmount, current.currency)} ·{' '}
                {current.marginPercentage}%
              </p>
            )}
          </div>
        </section>
      )}
      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-xl border bg-white p-5 lg:col-span-2">
          <h2 className="font-semibold">Version history</h2>
          <div className="mt-3 divide-y">
            {q.versions.map((version) => (
              <article
                key={version.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <strong>Version {version.versionNumber}</strong>
                  <p className="text-xs text-slate-500">
                    {labelForLookup(version.status)} ·{' '}
                    {new Date(version.createdAt).toLocaleString()} · {version.createdBy.fullName}
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className="font-semibold">
                    {money(version.finalAmount, version.currency)}
                  </span>
                  {hasPermission(PERMISSIONS.QUOTATIONS_UPDATE) && q.status !== 'ACCEPTED' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => action.mutate({ path: `versions/${version.id}/duplicate` })}
                    >
                      <Copy className="h-4 w-4" />
                      Duplicate
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="rounded-xl border bg-white p-5">
          <h2 className="font-semibold">Documents</h2>
          {hasPermission(PERMISSIONS.QUOTATIONS_UPDATE) && (
            <label className="mt-3 block cursor-pointer rounded-lg border border-dashed p-3 text-center text-sm text-slate-600">
              {uploading ? 'Uploading…' : 'Add PDF or image attachment'}
              <input
                className="sr-only"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setUploading(true);
                  setUploadError('');
                  void uploadQuotationAttachment(q.id, file)
                    .then(() => query.refetch())
                    .catch((reason: unknown) =>
                      setUploadError(reason instanceof Error ? reason.message : 'Upload failed.'),
                    )
                    .finally(() => setUploading(false));
                }}
              />
            </label>
          )}
          {uploadError && <p className="mt-2 text-xs text-red-700">{uploadError}</p>}
          <div className="mt-3 space-y-3">
            {q.documents.length ? (
              q.documents.map((document) => (
                <article key={document.id} className="rounded-lg bg-slate-50 p-3">
                  <p className="truncate text-sm font-medium">{document.fileName}</p>
                  <p className="text-xs text-slate-500">
                    {labelForLookup(document.documentType)} ·{' '}
                    {(document.fileSize / 1024).toFixed(1)} KB · {labelForLookup(document.status)}
                  </p>
                  {document.status === 'AVAILABLE' && (
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        action.mutate(
                          { path: `documents/${document.id}/download-url`, method: 'get' },
                          {
                            onSuccess: (result) =>
                              window.open((result as { url: string }).url, '_blank', 'noopener'),
                          },
                        )
                      }
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                  )}
                </article>
              ))
            ) : (
              <p className="text-sm text-slate-500">No generated documents.</p>
            )}
          </div>
        </section>
      </div>
      <section className="rounded-xl border bg-white p-5">
        <h2 className="flex items-center gap-2 font-semibold">
          <Mail className="h-4 w-4" />
          Email history
        </h2>
        <div className="mt-3 divide-y">
          {q.emailLogs.length ? (
            q.emailLogs.map((log) => (
              <article key={log.id} className="py-3">
                <div className="flex justify-between">
                  <strong>{log.recipientEmail}</strong>
                  <span className="text-xs">{labelForLookup(log.status)}</span>
                </div>
                <p className="text-sm text-slate-600">{log.subject}</p>
                <p className="text-xs text-slate-500">
                  {log.sentAt
                    ? new Date(log.sentAt).toLocaleString()
                    : new Date(log.createdAt).toLocaleString()}
                </p>
              </article>
            ))
          ) : (
            <p className="text-sm text-slate-500">No emails sent yet.</p>
          )}
        </div>
      </section>
      <section className="rounded-xl border bg-white p-5">
        <h2 className="font-semibold">Activity timeline</h2>
        <div className="mt-3 space-y-3">
          {q.activityTimeline?.length ? (
            q.activityTimeline.map((entry) => (
              <article key={entry.id} className="border-l-2 border-brand-200 pl-3">
                <p className="text-sm font-medium">{labelForLookup(entry.action)}</p>
                <p className="text-xs text-slate-500">
                  {entry.actorUser?.fullName ?? 'Customer / system'} ·{' '}
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
              </article>
            ))
          ) : (
            <p className="text-sm text-slate-500">No quotation activity recorded yet.</p>
          )}
        </div>
      </section>
      {sendOpen && current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold">Send finalized quotation</h2>
            <p className="mt-1 text-sm text-slate-500">
              Version {current.versionNumber} · {money(current.finalAmount, current.currency)}
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium">
                Recipient email
                <input
                  aria-label="Recipient email"
                  className={`${field} mt-1`}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includePdf}
                  onChange={(event) => setIncludePdf(event.target.checked)}
                />
                Include secure PDF download
              </label>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includePublicLink}
                  onChange={(event) => setIncludePublicLink(event.target.checked)}
                />
                Include customer view/accept link
              </label>
              {send.isError && <p className="text-sm text-red-700">{send.error.message}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSendOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={!email}
                isLoading={send.isPending}
                onClick={() =>
                  send.mutate(
                    {
                      quotationVersionId: current.id,
                      recipientEmail: email,
                      cc: [],
                      subject: null,
                      message: null,
                      includePdf,
                      includePublicLink,
                    },
                    { onSuccess: () => setSendOpen(false) },
                  )
                }
              >
                Send quotation
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

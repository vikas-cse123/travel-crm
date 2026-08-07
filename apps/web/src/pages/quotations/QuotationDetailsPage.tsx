import { useEffect, useRef, useState } from 'react';
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
import { labelForLookup, PERMISSIONS, hotelStayNights } from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/Tooltip';
import { useAuth } from '@/features/auth/AuthProvider';
import {
  uploadQuotationAttachment,
  useGenerateQuotationPdf,
  useQuotation,
  useQuotationAction,
  useSendQuotation,
} from '@/features/quotations/quotations.api';
import { resolveTravelDates } from '@/features/quotations/travel-dates';

/** Trigger a normal browser download for a generated document URL. */
function downloadPdf(url: string, fileName?: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  if (fileName) anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

const field = 'w-full rounded-lg border border-slate-300 bg-card px-3 py-2 text-sm';
export function QuotationDetailsPage() {
  const { quotationId = '' } = useParams();
  const { hasPermission } = useAuth();
  const query = useQuotation(quotationId);
  const action = useQuotationAction(quotationId);
  const generatePdf = useGenerateQuotationPdf(quotationId);
  const send = useSendQuotation(quotationId);
  const [sendOpen, setSendOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [includePdf, setIncludePdf] = useState(true);
  const [includePublicLink, setIncludePublicLink] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [pdfError, setPdfError] = useState('');
  // Public weblink URL once provisioned, tagged with the version it belongs to.
  // Reset whenever the current version changes so Copy/Open always target the
  // currently displayed version (never a stale link from an earlier version).
  const [publicLinkUrl, setPublicLinkUrl] = useState<string | null>(null);
  const [publicLinkVersionId, setPublicLinkVersionId] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Pre-provision the public link so the Open Weblink anchor is a real href
  // (the action is idempotent). Re-runs when the current version changes so the
  // cached link never points at an older version. Guarded on query.data so this
  // hook runs unconditionally before any early return.
  useEffect(() => {
    const data = query.data;
    const current = data?.versions.find(
      (version) => version.id === data.currentVersionId,
    ) ?? data?.versions[0];
    if (!current || current.status === 'DRAFT') {
      setPublicLinkUrl(null);
      setPublicLinkVersionId(null);
      return;
    }
    if (publicLinkVersionId === current.id && publicLinkUrl) return;
    setPublicLinkUrl(null);
    setPublicLinkVersionId(null);
    action.mutate(
      { path: 'public-link', body: { quotationVersionId: current.id } },
      {
        onSuccess: (result) => {
          const url = (result as { url?: string }).url ?? null;
          if (url) {
            setPublicLinkUrl(url);
            setPublicLinkVersionId(current.id);
          }
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, publicLinkVersionId, publicLinkUrl]);
  if (query.isLoading) return <div className="h-96 animate-pulse rounded-xl bg-card" />;
  if (!query.data)
    return <div className="rounded-xl bg-card p-12 text-center">Quotation unavailable.</div>;
  const q = query.data;
  const current = q.versions.find((version) => version.id === q.currentVersionId) ?? q.versions[0];
  const money = (value: string, currency: string) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(value));
  const createRevision = () =>
    current && action.mutate({ path: 'versions', body: { sourceVersionId: current.id } });
  /** Provision the public weblink for the current version; stores the URL for
   *  both Copy public link and Open Weblink. Returns the cached URL only when
   *  it still belongs to the current version. */
  const ensurePublicLink = (): Promise<string | null> =>
    new Promise((resolve) => {
      if (!current) return resolve(null);
      if (publicLinkUrl && publicLinkVersionId === current.id) return resolve(publicLinkUrl);
      action.mutate(
        { path: 'public-link', body: { quotationVersionId: current.id } },
        {
          onSuccess: (result) => {
            const url = (result as { url?: string }).url ?? null;
            if (url) {
              setPublicLinkUrl(url);
              setPublicLinkVersionId(current.id);
            }
            resolve(url);
          },
          onError: () => resolve(null),
        },
      );
    });
  const copyPublicLink = async () => {
    const url = await ensurePublicLink();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      // Copy failed — do not show "Copied!".
    }
  };
  // Generate the PDF for the currently displayed version and download it
  // directly — no new tab, no popup, no window.open.
  const handleGeneratePdf = () => {
    if (!current || generatePdf.isPending) return;
    setPdfError('');
    generatePdf.mutate(current.id, {
      onSuccess: ({ url, fileName }) => {
        if (url) downloadPdf(url, fileName);
      },
      onError: () => setPdfError('PDF generation failed. Please try again.'),
    });
  };
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/quotations" className="rounded-lg p-2 hover:bg-card">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-sm text-slate-500">Customer quotations / {q.quotationNumber}</p>
            <h1 className="text-2xl font-semibold">
              {q.customerName} · {q.destinationSummary}
            </h1>
            {q.customer && (
              <Link
                className="text-xs font-medium text-brand-700 hover:underline"
                to={`/customers/${q.customer.id}`}
              >
                View {q.customer.customerNumber} customer profile
              </Link>
            )}
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
          {current?.status !== 'DRAFT' && hasPermission(PERMISSIONS.QUOTATIONS_UPDATE) && (
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
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Current version', current ? `v${current.versionNumber}` : '—'],
          ['Final amount', current ? money(current.finalAmount, current.currency) : '—'],
          ['Last sent', q.lastSentAt ? new Date(q.lastSentAt).toLocaleString() : 'Never'],
          ['Last viewed', q.lastViewedAt ? new Date(q.lastViewedAt).toLocaleString() : 'Never'],
        ].map(([label, value]) => (
          <article key={label} className="rounded-xl border bg-card p-4">
            <p className="text-xs uppercase text-slate-500">{label}</p>
            <p className="mt-2 font-semibold">{value}</p>
          </article>
        ))}
      </section>
      <section className="rounded-xl border bg-card p-5">
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
                  isLoading={generatePdf.isPending}
                  onClick={handleGeneratePdf}
                >
                  <FileText className="h-4 w-4" />
                  {generatePdf.isPending ? 'Generating PDF…' : 'Generate PDF'}
                </Button>
              )}
            {current?.status !== 'DRAFT' && (
              <TooltipProvider delayDuration={0}>
                <Tooltip
                  open={linkCopied}
                  onOpenChange={(open) => {
                    if (!open) setLinkCopied(false);
                  }}
                >
                  <TooltipTrigger asChild>
                    <Button variant="secondary" onClick={() => void copyPublicLink()}>
                      <Copy className="h-4 w-4" />
                      Copy public link
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{linkCopied ? 'Copied!' : 'Copy public link'}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {current?.status !== 'DRAFT' && (
              <a
                href={publicLinkUrl ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => {
                  if (publicLinkUrl) return;
                  event.preventDefault();
                  void ensurePublicLink().then((url) => {
                    if (url) window.open(url, '_blank', 'noopener,noreferrer');
                  });
                }}
              >
                <Button variant="secondary">
                  <ExternalLink className="h-4 w-4" />
                  Open Weblink
                </Button>
              </a>
            )}
          </div>
        </div>
        {pdfError && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {pdfError}
          </p>
        )}
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
              {resolveTravelDates({
                start: q.travelStartDate,
                end: q.travelEndDate,
                // Canonical trip duration: the itinerary's highest day number is
                // the number of travel days (Day 1 = start day).
                totalDays: current?.itinerary.length
                  ? Math.max(...current.itinerary.map((day) => day.dayNumber))
                  : undefined,
              }).label || '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Travellers</dt>
            <dd>
              {q.adults} adults · {q.childrenWithBed + q.childrenWithoutBed} children · {q.infants}{' '}
              infants
            </dd>
          </div>
        </dl>
      </section>
      {current && (
        <section className="rounded-xl border bg-card p-6">
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
                      {hotel.city} · {hotelStayNights(hotel.checkInDate, hotel.checkOutDate) ?? hotel.nights} nights · {hotel.roomType || 'Room open'} ·{' '}
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
          <div className="mt-6 rounded-xl bg-panel p-5 text-panel-foreground">
            <p className="text-sm text-panel-foreground/70">Final quotation amount</p>
            <p className="mt-1 text-3xl font-semibold">
              {money(current.finalAmount, current.currency)}
            </p>
            {current.marginAmount && (
              <p className="mt-2 text-xs text-panel-foreground/60">
                Internal margin: {money(current.marginAmount, current.currency)} ·{' '}
                {current.marginPercentage}%
              </p>
            )}
          </div>
        </section>
      )}
      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-xl border bg-card p-5 lg:col-span-2">
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
                  {hasPermission(PERMISSIONS.QUOTATIONS_UPDATE) && (
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
        <section className="rounded-xl border bg-card p-5">
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
                              downloadPdf((result as { url: string }).url, document.fileName),
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
      <section className="rounded-xl border bg-card p-5">
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
      <section className="rounded-xl border bg-card p-5">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg rounded-xl bg-card p-6 shadow-xl"
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
                Include customer view link
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

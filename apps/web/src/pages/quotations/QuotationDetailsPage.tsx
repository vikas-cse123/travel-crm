import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bold,
  Copy,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Heading1,
  Image as ImageIcon,
  Italic,
  List,
  Mail,
  MessageCircle,
  Plane,
  Plus,
  Send,
  Ship,
  Sparkles,
  TicketCheck,
  CarFront,
  RotateCcw,
  X,
} from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { labelForLookup, PERMISSIONS, validateQuotationPricing } from '@interscale/shared';
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
import { WeblinkVisitors } from '@/features/quotations/WeblinkVisitors';
import { resolveTravelDates } from '@/features/quotations/travel-dates';
import { formatDateTime12Hour } from '@/utils/dateTime';
import {
  buildWhatsAppSummary,
  richHtmlToWhatsappMarkdown,
  whatsappMarkdownToHtml,
} from '@/features/quotations/whatsappSummary';

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
  const { hasPermission, user } = useAuth();
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
  const [actionError, setActionError] = useState('');
  // Visible confirmation after a successful finalize (the status flip also
  // removes the button, but the agent should never be left guessing).
  const [actionSuccess, setActionSuccess] = useState('');
  const [pdfChoiceOpen, setPdfChoiceOpen] = useState(false);
  const [stylishCoverOpen, setStylishCoverOpen] = useState(false);
  const [coverSource, setCoverSource] = useState<'DESTINATION' | 'UPLOAD'>('DESTINATION');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [summaryCopied, setSummaryCopied] = useState(false);
  const summaryCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [includeFlights, setIncludeFlights] = useState(false);
  const [includeCruises, setIncludeCruises] = useState(false);
  const [includeVehicles, setIncludeVehicles] = useState(false);
  const [whatsappHtml, setWhatsappHtml] = useState('');
  const whatsappEditorRef = useRef<HTMLDivElement | null>(null);
  const [hasAttemptedFinalize, setHasAttemptedFinalize] = useState(false);
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
    const current =
      data?.versions.find((version) => version.id === data.currentVersionId) ?? data?.versions[0];
    if (!current) {
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

  // Keep editable WhatsApp HTML in sync when optional toggles or weblink change while dialog is open.
  // Must be before any early return to keep hook order stable.
  useEffect(() => {
    if (!whatsappOpen) return;
    const data = query.data;
    if (!data) return;
    const currentV =
      (data as unknown as { versions: typeof data.versions; currentVersionId: string | null }).versions.find(
        (v) => v.id === (data as unknown as { currentVersionId: string | null }).currentVersionId,
      ) ?? data.versions[0];
    if (!currentV) return;
    const base = buildWhatsAppSummary({
      quotation: data as unknown as Parameters<typeof buildWhatsAppSummary>[0]['quotation'],
      version: currentV as unknown as Parameters<typeof buildWhatsAppSummary>[0]['version'],
      weblinkUrl: publicLinkUrl,
      companyName: user?.company.name ?? 'Travel CRM',
      preparedByName:
        (data as unknown as { createdBy?: { fullName?: string | null } }).createdBy?.fullName ??
        (currentV as unknown as { createdBy?: { fullName?: string | null } }).createdBy?.fullName ??
        user?.fullName ??
        null,
      options: { includeFlights, includeCruises, includeVehicles },
    });
    setWhatsappHtml(whatsappMarkdownToHtml(base));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whatsappOpen, includeFlights, includeCruises, includeVehicles, publicLinkUrl, query.data]);

  // Push generated HTML into the contentEditable DOM (avoids controlled re-render cursor jumps)
  useEffect(() => {
    if (!whatsappOpen) return;
    if (!whatsappEditorRef.current) return;
    if (whatsappEditorRef.current.innerHTML !== whatsappHtml) {
      whatsappEditorRef.current.innerHTML = whatsappHtml;
    }
  }, [whatsappHtml, whatsappOpen]);

  useEffect(() => {
    setHasAttemptedFinalize(false);
  }, [query.data?.id, query.data?.currentVersionId]);

  if (query.isLoading) return <div className="h-96 animate-pulse rounded-xl bg-card" />;
  if (!query.data)
    return <div className="rounded-xl bg-card p-12 text-center">Quotation unavailable.</div>;
  const q = query.data;
  const current = q.versions.find((version) => version.id === q.currentVersionId) ?? q.versions[0];
  const pricingIssues = (() => {
    if (!current) return [] as ReturnType<typeof validateQuotationPricing>;
    try {
      return validateQuotationPricing({
        version: current as unknown as Parameters<typeof validateQuotationPricing>[0]['version'],
        quotation: q as unknown as Parameters<typeof validateQuotationPricing>[0]['quotation'],
      });
    } catch {
      return [] as ReturnType<typeof validateQuotationPricing>;
    }
  })();
  // Only show the large incomplete-pricing warning after the user has tried to finalize.
  // Before that, a newly created draft with no pricing is a normal Draft.
  const isDraftIncomplete = current?.status === 'DRAFT' && hasAttemptedFinalize && pricingIssues.length > 0;
  const showSubtleDraftHint =
    current?.status === 'DRAFT' && !hasAttemptedFinalize && pricingIssues.length > 0;
  const money = (value: string, currency: string) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(Number(value));
  const createRevision = () => {
    if (!current) return;
    setActionError('');
    setActionSuccess('');
    action.mutate(
      { path: 'versions', body: { sourceVersionId: current.id } },
      {
        onSuccess: () => setActionError(''),
        onError: (error) =>
          setActionError(
            error instanceof Error && error.message
              ? error.message
              : 'Unable to create a revision. Please try again.',
          ),
      },
    );
  };
  /**
   * Finalize the current DRAFT version. The backend runs the authoritative
   * pricing validation (validateQuotationPricing) and a 400/422 carries the
   * exact pricing errors — they MUST reach the agent, never fail silently:
   *  - success: refresh the quotation (status flips to FINALIZED via the
   *    mutation's cache invalidation) and confirm visibly;
   *  - 4xx (validation/permission): show the server's message verbatim;
   *  - 5xx / network: show a friendly, visible error.
   * `action.isPending` keeps the button disabled so a double-click cannot
   * fire a duplicate finalize request.
   */
  const handleFinalize = () => {
    if (!current || action.isPending) return;
    setHasAttemptedFinalize(true);
    setActionError('');
    setActionSuccess('');
    action.mutate(
      { path: `versions/${current.id}/finalize` },
      {
        onSuccess: () => {
          setActionError('');
          setActionSuccess(
            `Version v${current.versionNumber} finalized. You can now generate the PDF or send it to the customer.`,
          );
        },
        onError: (error) => {
          setActionSuccess('');
          setActionError(
            error instanceof Error && error.message
              ? error.message
              : 'Unable to finalize this quotation. Please try again.',
          );
        },
      },
    );
  };
  /** Provision the public weblink for the current version; stores the URL for
   *  both Copy Weblink URL and Open Weblink. Returns the cached URL only when
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
  const buildBaseWhatsAppSummary = (overrides?: {
    weblinkUrl?: string | null;
    includeFlights?: boolean;
    includeCruises?: boolean;
    includeVehicles?: boolean;
  }) =>
    q && current
      ? buildWhatsAppSummary({
          quotation: q,
          version: current,
          weblinkUrl: overrides?.weblinkUrl !== undefined ? overrides.weblinkUrl : publicLinkUrl,
          companyName: user?.company.name ?? 'Travel CRM',
          preparedByName: q.createdBy?.fullName ?? current.createdBy?.fullName ?? user?.fullName ?? null,
          options: {
            includeFlights: overrides?.includeFlights ?? includeFlights,
            includeCruises: overrides?.includeCruises ?? includeCruises,
            includeVehicles: overrides?.includeVehicles ?? includeVehicles,
          },
        })
      : '';

  const openWhatsappSummary = async () => {
    let url = publicLinkUrl;
    if (current?.status !== 'DRAFT' && !url) {
      url = await ensurePublicLink();
    }
    const base = buildBaseWhatsAppSummary({ weblinkUrl: url });
    setWhatsappHtml(whatsappMarkdownToHtml(base));
    setWhatsappOpen(true);
  };

  const execRichCommand = (command: string, value?: string) => {
    const editor = whatsappEditorRef.current;
    if (!editor) return;
    editor.focus();
    try {
      document.execCommand(command, false, value);
    } catch {
      // Fallback no-op; toolbar still focuses editor for manual typing.
    }
    // Sync HTML state after command
    setWhatsappHtml(editor.innerHTML);
  };

  const copyWhatsappSummary = async () => {
    const editor = whatsappEditorRef.current;
    // Prefer the live rich HTML from the editor (includes user edits), fallback to stored html
    const html = editor?.innerHTML ?? whatsappHtml;
    const fallbackMarkdown = buildBaseWhatsAppSummary();
    const text = html ? richHtmlToWhatsappMarkdown(html) : fallbackMarkdown;
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setSummaryCopied(true);
      if (summaryCopyTimerRef.current) clearTimeout(summaryCopyTimerRef.current);
      summaryCopyTimerRef.current = setTimeout(() => setSummaryCopied(false), 1800);
    } catch {
      // Copy failed — do not show "Copied!".
    }
  };
  const generateIntoNewTab = async (
    style: 'CLASSIC' | 'STYLISH',
    selectedCoverSource: 'DESTINATION' | 'UPLOAD' = 'DESTINATION',
  ) => {
    if (!current || generatePdf.isPending) return;
    setPdfError('');
    const pdfTab = window.open('about:blank', '_blank');
    if (!pdfTab) {
      setPdfError('Allow pop-ups for this site so the generated PDF can open in a new tab.');
      return;
    }
    pdfTab.opener = null;
    pdfTab.document.title = 'Generating PDF…';
    pdfTab.document.body.innerHTML =
      '<p style="font:16px system-ui;padding:32px">Generating PDF…</p>';
    let coverImageDataUrl: string | undefined;
    if (style === 'STYLISH' && selectedCoverSource === 'UPLOAD') {
      if (!coverFile) {
        pdfTab.close();
        setPdfError('Choose a first-page image for the stylish PDF.');
        return;
      }
      coverImageDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Unable to read the selected image.'));
        reader.readAsDataURL(coverFile);
      }).catch(() => undefined);
      if (!coverImageDataUrl) {
        pdfTab.close();
        setPdfError('Unable to read the selected cover image.');
        return;
      }
    }
    generatePdf.mutate(
      {
        versionId: current.id,
        style,
        coverSource: selectedCoverSource,
        ...(coverImageDataUrl ? { coverImageDataUrl } : {}),
      },
      {
        onSuccess: ({ url }) => {
          if (url) pdfTab.location.replace(url);
        },
        onError: () => {
          pdfTab.close();
          setPdfError('PDF generation failed. Please try again.');
        },
      },
    );
  };
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link to="/quotations" className="shrink-0 rounded-lg p-2 hover:bg-card">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-sm text-slate-500">Customer quotations / {q.quotationNumber}</p>
            <h1 className="break-words text-2xl font-semibold">
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
                Edit quotation
              </Button>
            </Link>
          )}
          {current?.status !== 'DRAFT' && hasPermission(PERMISSIONS.QUOTATIONS_UPDATE) && (
            <Button variant="secondary" disabled={action.isPending} onClick={createRevision}>
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
      {actionError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {actionSuccess}
        </div>
      )}
      {isDraftIncomplete && (
        <div
          role="note"
          aria-label="Draft pricing incomplete"
          className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
        >
          <p className="font-medium">Draft pricing is incomplete. You can preview the quotation, but it cannot be finalized until all required pricing is completed.</p>
          {pricingIssues.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {pricingIssues.map((issue, idx) => (
                <li key={idx}>{issue.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {showSubtleDraftHint && (
        <div
          role="note"
          aria-label="Draft pricing not yet configured"
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600"
        >
          <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />
          Draft — pricing not yet configured. Preview is available.
        </div>
      )}
      <section className="grid gap-3 sm:grid-cols-2">
        {[
          ['Current version', current ? `v${current.versionNumber}` : '—'],
          ['Final amount', current ? money(current.finalAmount, current.currency) : '—'],
        ].map(([label, value]) => (
          <article key={label} className="rounded-xl border bg-card p-4">
            <p className="text-xs uppercase text-slate-500">{label}</p>
            <p className="mt-2 font-semibold">{value}</p>
          </article>
        ))}
      </section>
      <section className="rounded-xl border bg-card p-5">
        <div className="flex flex-wrap justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold">Customer and travel</h2>
            <p className="mt-1 text-sm text-slate-500">
              Linked lead{' '}
              <Link className="text-brand-700" to={`/queries/${q.query.id}`}>
                {q.query.queryNumber}
              </Link>
            </p>
          </div>
          {/* Stacked full-width on phones — these labels are too long to sit
              side by side under ~640px — and the original inline row from sm up. */}
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            {current?.status === 'DRAFT' && hasPermission(PERMISSIONS.QUOTATIONS_UPDATE) && (
              <Button
                className="w-full sm:w-auto"
                isLoading={action.isPending}
                onClick={handleFinalize}
              >
                {action.isPending
                  ? 'Finalizing…'
                  : `Finalize v${current.versionNumber}`}
              </Button>
            )}
            {current && hasPermission(PERMISSIONS.QUOTATIONS_GENERATE_PDF) && (
                <Button
                  className="w-full sm:w-auto"
                  variant="secondary"
                  isLoading={generatePdf.isPending}
                  onClick={() => setPdfChoiceOpen(true)}
                >
                  <FileText className="h-4 w-4" />
                  {generatePdf.isPending ? 'Generating PDF…' : 'Generate PDF'}
                </Button>
              )}
            {current && (
              <TooltipProvider delayDuration={0}>
                <Tooltip
                  open={linkCopied}
                  onOpenChange={(open) => {
                    if (!open) setLinkCopied(false);
                  }}
                >
                  <TooltipTrigger asChild>
                    <Button
                      className="w-full sm:w-auto"
                      variant="secondary"
                      onClick={() => void copyPublicLink()}
                    >
                      <Copy className="h-4 w-4" />
                      Copy Weblink URL
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{linkCopied ? 'Copied!' : 'Copy Weblink URL'}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {current && (
              <a
                className="w-full sm:w-auto"
                href={publicLinkUrl ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(event) => {
                  if (publicLinkUrl) return;
                  event.preventDefault();
                  const win = window.open('about:blank', '_blank');
                  if (!win) return;
                  win.opener = null;
                  win.document.title = 'Opening preview…';
                  win.document.body.innerHTML =
                    '<p style="font:16px system-ui;padding:32px">Opening preview…</p>';
                  void ensurePublicLink().then((url) => {
                    if (url) win.location.replace(url);
                    else win.close();
                  });
                }}
              >
                <Button className="w-full sm:w-auto" variant="secondary">
                  <ExternalLink className="h-4 w-4" />
                  {current.status === 'DRAFT' ? 'Preview Weblink' : 'Open Weblink'}
                </Button>
              </a>
            )}
            {current && (
              <TooltipProvider delayDuration={0}>
                <Tooltip
                  open={summaryCopied}
                  onOpenChange={(open) => {
                    if (!open) setSummaryCopied(false);
                  }}
                >
                  <TooltipTrigger asChild>
                    <Button
                      className="w-full sm:w-auto"
                      variant="secondary"
                      onClick={() => void openWhatsappSummary()}
                    >
                      <MessageCircle className="h-4 w-4" />
                      WhatsApp Message
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{summaryCopied ? 'Copied!' : 'WhatsApp Message'}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
        {pdfError && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {pdfError}
          </p>
        )}
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-xs text-slate-500">Contact</dt>
            {/* A long address must wrap rather than push the card wider. */}
            <dd className="break-words">
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
                // Canonical trip duration from the itinerary day numbers (only
                // meaningful when the itinerary has more than one day). A
                // Day-1-only itinerary must not hide a real multi-night stay,
                // so the hotel-night total is always offered as the fallback.
                totalDays: current?.itinerary.length
                  ? Math.max(...current.itinerary.map((day) => day.dayNumber))
                  : undefined,
                nights:
                  current?.hotels.reduce((sum, hotel) => sum + (hotel.nights ?? 0), 0) || undefined,
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

      <WeblinkVisitors quotationId={quotationId} />
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
                    {labelForLookup(version.status)} · {formatDateTime12Hour(version.createdAt)} ·{' '}
                    {version.createdBy.fullName}
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
                    ? formatDateTime12Hour(log.sentAt)
                    : formatDateTime12Hour(log.createdAt)}
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
                  {formatDateTime12Hour(entry.createdAt)}
                </p>
              </article>
            ))
          ) : (
            <p className="text-sm text-slate-500">No quotation activity recorded yet.</p>
          )}
        </div>
      </section>
      {pdfChoiceOpen && current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-style-title"
            className="w-full max-w-2xl rounded-2xl bg-card p-6 shadow-xl"
          >
            <h2 id="pdf-style-title" className="text-xl font-semibold">
              Choose PDF style
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Select how this quotation should be presented.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <button
                type="button"
                className="rounded-xl border p-5 text-left transition hover:border-brand-400 hover:bg-brand-50"
                onClick={() => {
                  setPdfChoiceOpen(false);
                  void generateIntoNewTab('CLASSIC');
                }}
              >
                <FileText className="h-7 w-7 text-brand-700" />
                <strong className="mt-4 block text-lg">Classic PDF</strong>
                <span className="mt-1 block text-sm text-slate-500">
                  The existing clean quotation PDF currently used by the CRM.
                </span>
              </button>
              <button
                type="button"
                className="rounded-xl border p-5 text-left transition hover:border-brand-400 hover:bg-brand-50"
                onClick={() => {
                  setPdfChoiceOpen(false);
                  setCoverSource('DESTINATION');
                  setCoverFile(null);
                  setStylishCoverOpen(true);
                }}
              >
                <Sparkles className="h-7 w-7 text-amber-500" />
                <strong className="mt-4 block text-lg">Stylish PDF</strong>
                <span className="mt-1 block text-sm text-slate-500">
                  A photo-led navy and gold proposal inspired by the supplied design.
                </span>
              </button>
            </div>
            <div className="mt-5 flex justify-end">
              <Button variant="secondary" onClick={() => setPdfChoiceOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
      {stylishCoverOpen && current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cover-image-title"
            className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-xl"
          >
            <h2 id="cover-image-title" className="text-xl font-semibold">
              Choose first-page image
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              This image fills the cover of the stylish PDF.
            </p>
            <div className="mt-5 space-y-3">
              <label
                className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${coverSource === 'DESTINATION' ? 'border-brand-500 bg-brand-50' : ''}`}
              >
                <input
                  type="radio"
                  name="cover-source"
                  checked={coverSource === 'DESTINATION'}
                  onChange={() => setCoverSource('DESTINATION')}
                />
                <ImageIcon className="h-5 w-5 text-brand-700" />
                <span>
                  <strong className="block">Use destination image</strong>
                  <span className="text-sm text-slate-500">
                    Use the destination master image already linked to this quotation.
                  </span>
                </span>
              </label>
              <label
                className={`block cursor-pointer rounded-xl border p-4 ${coverSource === 'UPLOAD' ? 'border-brand-500 bg-brand-50' : ''}`}
              >
                <span className="flex gap-3">
                  <input
                    type="radio"
                    name="cover-source"
                    checked={coverSource === 'UPLOAD'}
                    onChange={() => setCoverSource('UPLOAD')}
                  />
                  <ImageIcon className="h-5 w-5 text-brand-700" />
                  <span>
                    <strong className="block">Upload another image</strong>
                    <span className="text-sm text-slate-500">JPEG, PNG or WebP, up to 5 MB.</span>
                  </span>
                </span>
                {coverSource === 'UPLOAD' && (
                  <input
                    aria-label="First-page image"
                    className="mt-3 block w-full text-sm"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      if (file && file.size > 5 * 1024 * 1024) {
                        setCoverFile(null);
                        setPdfError('The first-page image may not exceed 5 MB.');
                      } else {
                        setPdfError('');
                        setCoverFile(file);
                      }
                    }}
                  />
                )}
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setStylishCoverOpen(false);
                  setPdfChoiceOpen(true);
                }}
              >
                Back
              </Button>
              <Button
                disabled={coverSource === 'UPLOAD' && !coverFile}
                onClick={() => {
                  setStylishCoverOpen(false);
                  void generateIntoNewTab('STYLISH', coverSource);
                }}
              >
                Generate Stylish PDF
              </Button>
            </div>
          </div>
        </div>
      )}
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
      {whatsappOpen && current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="whatsapp-summary-title"
            className="flex max-h-[85vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
          >
            {/* Header — compact and CRM-aligned */}
            <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4">
              <div className="flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div>
                  <h2 id="whatsapp-summary-title" className="text-[15px] font-semibold leading-none text-slate-900">
                    WhatsApp Message
                  </h2>
                  <p className="mt-1 text-xs leading-4 text-slate-500">
                    Clean share text — pricing stays in the weblink. Edit freely.
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setWhatsappOpen(false)}
                className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Add sections — subtle pill control */}
            <div className="flex items-center gap-2 border-y border-slate-100 bg-slate-50/60 px-6 py-2.5">
              <span className="shrink-0 text-xs font-medium text-slate-500">Add sections</span>
              <div className="flex items-center gap-1.5">
                {[
                  { key: 'flights', label: 'Flights', Icon: Plane, active: includeFlights, setter: setIncludeFlights },
                  { key: 'cruises', label: 'Cruises', Icon: Ship, active: includeCruises, setter: setIncludeCruises },
                  { key: 'vehicles', label: 'Vehicles', Icon: CarFront, active: includeVehicles, setter: setIncludeVehicles },
                ].map(({ key, label, Icon, active, setter }) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => (setter as (v: boolean) => void)(!active)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  const base = buildBaseWhatsAppSummary();
                  const html = whatsappMarkdownToHtml(base);
                  setWhatsappHtml(html);
                  if (whatsappEditorRef.current) {
                    whatsappEditorRef.current.innerHTML = html;
                  }
                }}
                className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-slate-500 transition hover:bg-white hover:text-slate-700"
                title="Reset to generated default"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            </div>

            {/* Toolbar — compact, intuitive */}
            <div className="flex items-center gap-1 border-b border-slate-100 bg-white px-3 py-2">
              <button
                type="button"
                title="Bold"
                aria-label="Bold"
                onClick={() => execRichCommand('bold')}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
              >
                <Bold className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Italic"
                aria-label="Italic"
                onClick={() => execRichCommand('italic')}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
              >
                <Italic className="h-4 w-4" />
              </button>
              <div className="mx-1 h-4 w-px bg-slate-200" />
              <button
                type="button"
                title="Bulleted list"
                aria-label="Bulleted list"
                onClick={() => execRichCommand('insertUnorderedList')}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Heading"
                aria-label="Heading"
                onClick={() => execRichCommand('formatBlock', '<h3>')}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
              >
                <Heading1 className="h-4 w-4" />
              </button>
              <span className="ml-auto hidden text-xs text-slate-400 sm:inline">Select text to format</span>
            </div>

            {/* Rich-text editor — shows formatted text, not markdown */}
            <div className="flex-1 overflow-auto bg-[#fcfcfc] p-4">
              <div
                ref={whatsappEditorRef}
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                aria-label="WhatsApp summary editor"
                data-placeholder="Summary will appear here…"
                onInput={(e) => setWhatsappHtml((e.currentTarget as HTMLDivElement).innerHTML)}
                className="min-h-[320px] rounded-xl border border-slate-200 bg-white p-5 text-sm leading-6 text-slate-800 shadow-sm prose prose-sm max-w-none prose-p:my-1.5 prose-headings:mt-6 prose-headings:mb-2 prose-hr:my-5 prose-li:my-1 prose-strong:font-semibold prose-strong:text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300 [&:empty:before]:content-[attr(data-placeholder)] [&:empty:before]:text-slate-400"
              />
              <p className="mt-3 text-center text-xs text-slate-400">
                Styled for you — bold, bullets and headings are rendered. Copied as WhatsApp-ready text.
              </p>
            </div>

            {/* Footer — cleanly positioned */}
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-white px-6 py-4">
              <span className="text-xs text-slate-400">
                {publicLinkUrl ? 'Weblink included' : 'Weblink pending'} • No pricing
              </span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setWhatsappOpen(false)} className="text-slate-600">
                  Close
                </Button>
                <TooltipProvider delayDuration={0}>
                  <Tooltip
                    open={summaryCopied}
                    onOpenChange={(open) => {
                      if (!open) setSummaryCopied(false);
                    }}
                  >
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => void copyWhatsappSummary()}
                        className="bg-slate-900 px-5 text-white shadow-sm hover:bg-slate-800"
                      >
                        <Copy className="h-4 w-4" />
                        {summaryCopied ? 'Copied!' : 'Copy'}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{summaryCopied ? 'Copied!' : 'Copy to clipboard'}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

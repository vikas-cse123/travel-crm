import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { ArrowRight, CheckCircle2, FileSpreadsheet, Loader2, UploadCloud, X } from 'lucide-react';
import {
  LEAD_IMPORT_FIELDS,
  LEAD_IMPORT_MAX_ROWS,
  type LeadImportFieldKey,
} from '@interscale/shared';
import { Button } from '@/components/ui/Button';
import { downloadCsv } from '@/lib/downloadCsv';
import { ApiError } from '@/api/client';
import { useLeadImport, useLeadImportErrorDownload } from '@/features/queries/queries.api';

/** A lead field that a CSV column may map to, plus "ignore". */
const MAPPABLE_FIELDS = Object.values(LEAD_IMPORT_FIELDS);
const IGNORE = '';

/** Human label for a mapped lead field. */
function fieldLabel(key: string): string {
  const labels: Record<string, string> = {
    customerName: 'Customer Name',
    phone: 'Phone',
    alternatePhone: 'Alternate Phone',
    email: 'Email',
    leadSource: 'Lead Source',
    leadType: 'Lead Type',
    leadStage: 'Lead Stage',
    priority: 'Priority',
    departureCountry: 'Country',
    departureCity: 'City',
    destination: 'Destination',
    travelStartDate: 'Travel Date',
    travelEndDate: 'Travel End Date',
    adults: 'Adults',
    childrenWithBed: 'Children With Bed',
    childrenWithoutBed: 'Children Without Bed',
    infants: 'Infants',
    expectedAmount: 'Expected Amount',
    budgetMin: 'Budget Min',
    budgetMax: 'Budget Max',
    currency: 'Currency',
    tripType: 'Trip Type',
    internalRemarks: 'Remarks',
    services: 'Services',
    assignedTo: 'Assigned To',
  };
  return labels[key] ?? key;
}

const AUTO_MAP: Record<string, LeadImportFieldKey> = {
  name: 'customerName',
  customername: 'customerName',
  customer: 'customerName',
  fullname: 'customerName',
  phone: 'phone',
  mobile: 'phone',
  contact: 'phone',
  phonenumber: 'phone',
  mobilenumber: 'phone',
  email: 'email',
  e_mail: 'email',
  emailaddress: 'email',
  destination: 'destination',
  location: 'destination',
  source: 'leadSource',
  leadsource: 'leadSource',
  traveldate: 'travelStartDate',
  startdate: 'travelStartDate',
  travelstartdate: 'travelStartDate',
  enddate: 'travelEndDate',
  travelenddate: 'travelEndDate',
  assignedto: 'assignedTo',
  assignee: 'assignedTo',
  staff: 'assignedTo',
  owner: 'assignedTo',
  city: 'departureCity',
  country: 'departureCountry',
  leadtype: 'leadType',
  type: 'leadType',
  leadstage: 'leadStage',
  stage: 'leadStage',
  status: 'leadStage',
  priority: 'priority',
  adults: 'adults',
  childrenwithbed: 'childrenWithBed',
  childrenwithoutbed: 'childrenWithoutBed',
  infants: 'infants',
  expectedamount: 'expectedAmount',
  budgetmin: 'budgetMin',
  budgetmax: 'budgetMax',
  currency: 'currency',
  triptype: 'tripType',
  remarks: 'internalRemarks',
  notes: 'internalRemarks',
  internalremarks: 'internalRemarks',
  alternatephone: 'alternatePhone',
  altphone: 'alternatePhone',
  services: 'services',
  service: 'services',
};

/** Normalise a CSV header for auto-mapping. */
function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function autoMap(header: string): LeadImportFieldKey | '' {
  const key = normalizeHeader(header);
  return AUTO_MAP[key] ?? '';
}

/** Basic per-row validation used for the preview badges. */
function previewErrors(row: Record<string, string>, mapping: Record<string, string>): string[] {
  const errors: string[] = [];
  // mapping is keyed by CSV header -> lead field; invert it to look up the
  // source column for a given lead field.
  const sourceHeader = (field: string) =>
    Object.entries(mapping).find(([, target]) => target === field)?.[0] ?? '';
  const value = (field: string) => row[sourceHeader(field)]?.trim() ?? '';
  const mapped = new Set(Object.values(mapping));
  if (mapped.has('customerName') && !value('customerName')) errors.push('Missing customer name');
  if (mapped.has('phone') && value('phone').replace(/\D/g, '').length < 5)
    errors.push('Missing phone number');
  if (mapped.has('leadSource') && !value('leadSource')) errors.push('Missing lead source');
  const email = value('email');
  if (mapped.has('email') && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.push('Invalid email');
  const date = value('travelStartDate');
  if (mapped.has('travelStartDate') && date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
    errors.push('Invalid date');
  return errors;
}

const SAMPLE_ROWS = [
  {
    'Customer Name': 'Aarav Mehta',
    Phone: '+91 98765 43210',
    Email: 'aarav@example.com',
    Destination: 'Goa',
    'Travel Date': '2026-12-10',
    Source: 'Referral',
    'Assigned To': '',
  },
];

/** Build the downloadable sample CSV from the supported fields. */
function buildSampleCsv(): string {
  const headers = [
    'Customer Name',
    'Phone',
    'Alternate Phone',
    'Email',
    'Lead Source',
    'Lead Type',
    'Lead Stage',
    'Priority',
    'Country',
    'City',
    'Destination',
    'Travel Date',
    'Travel End Date',
    'Adults',
    'Children With Bed',
    'Children Without Bed',
    'Infants',
    'Expected Amount',
    'Budget Min',
    'Budget Max',
    'Currency',
    'Trip Type',
    'Remarks',
    'Services',
    'Assigned To',
  ];
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const lines = SAMPLE_ROWS.map((row: Record<string, string>) =>
    headers.map((header) => quote(row[header] ?? '')).join(','),
  );
  return [headers.map(quote).join(','), ...lines].join('\n');
}

export function LeadImportModal({ onClose }: { onClose: () => void }) {
  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [noteColumns, setNoteColumns] = useState<Record<string, boolean>>({});
  const [submittedRows, setSubmittedRows] = useState<Record<string, unknown>[]>([]);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [step, setStep] = useState<'upload' | 'map' | 'result'>('upload');
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const importMutation = useLeadImport();
  const errorDownload = useLeadImportErrorDownload();
  const inputRef = useRef<HTMLInputElement>(null);
  const result = importMutation.data;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const parseFile = useCallback((file: File) => {
    setError('');
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Only .csv files are accepted.');
      return;
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (parsed) => {
        if (parsed.errors.length) {
          setError('The CSV file could not be read cleanly.');
          return;
        }
        const rows = (parsed.data as Record<string, string>[]).filter((row) =>
          Object.values(row).some((v) => v !== undefined && v !== null && String(v).trim() !== ''),
        );
        const headerKeys = parsed.meta.fields ?? Object.keys(rows[0] ?? {});
        if (rows.length === 0) {
          setError('The file contains no data rows.');
          return;
        }
        if (rows.length > LEAD_IMPORT_MAX_ROWS) {
          setError(`Imports are limited to ${LEAD_IMPORT_MAX_ROWS} rows.`);
          return;
        }
        setFileName(file.name);
        setRawRows(rows);
        setHeaders(headerKeys);
        const initial: Record<string, string> = {};
        for (const header of headerKeys) initial[header] = autoMap(header);
        setMapping(initial);
        setNoteColumns({});
        setStep('map');
      },
      error: () => setError('The CSV file could not be read.'),
    });
  }, []);

  const onFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) parseFile(file);
    },
    [parseFile],
  );

  const preview = useMemo(() => rawRows.slice(0, 6), [rawRows]);

  const buildRows = useCallback(() => {
    // Map CSV columns to lead-field values per row.
    return rawRows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const header of headers) {
        const target = mapping[header];
        const value = row[header]?.trim() ?? '';
        if (!target) {
          if (noteColumns[header] && value) {
            const notes = (out.ignoredColumnNotes ??= []) as Array<{
              label: string;
              value: string;
            }>;
            notes.push({ label: header, value });
          }
          continue;
        }
        if (target === 'services') {
          out[target] = value
            ? value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
        } else {
          out[target] = value;
        }
      }
      return out;
    });
  }, [rawRows, headers, mapping, noteColumns]);

  const runImport = () => {
    const rows = buildRows();
    setSubmittedRows(rows);
    importMutation.mutate(
      { rows: rows as never, skipDuplicates, ignoreInvalidOptionalFields: false },
      {
        onSuccess: () => setStep('result'),
        onError: (importError) => {
          // Surface safe backend validation/import errors; the client already
          // strips stack traces and internal details.
          setError(
            importError instanceof ApiError && importError.message
              ? importError.message
              : 'The import could not be completed.',
          );
        },
      },
    );
  };

  const retryFailedRows = () => {
    if (!result) return;
    const failedRows = result.results
      .filter((row) => row.status === 'FAILED')
      .map((row) => submittedRows[row.row - 2])
      .filter((row): row is Record<string, unknown> => Boolean(row));
    if (!failedRows.length) return;
    setError('');
    setSubmittedRows(failedRows);
    importMutation.mutate(
      {
        rows: failedRows as never,
        skipDuplicates,
        ignoreInvalidOptionalFields: true,
      },
      {
        onError: (importError) =>
          setError(
            importError instanceof ApiError && importError.message
              ? importError.message
              : 'The failed rows could not be retried.',
          ),
      },
    );
  };

  // mapping is csvHeader -> leadField. The three required Lead fields must all
  // be selected as a mapping target, then at least one row must be importable.
  const canImport = useMemo(() => {
    const mappedFields = new Set(Object.values(mapping));
    if (
      !mappedFields.has(LEAD_IMPORT_FIELDS.CUSTOMER_NAME) ||
      !mappedFields.has(LEAD_IMPORT_FIELDS.PHONE) ||
      !mappedFields.has(LEAD_IMPORT_FIELDS.LEAD_SOURCE)
    ) {
      return false;
    }
    const sourceHeader = (field: string) =>
      Object.entries(mapping).find(([, target]) => target === field)?.[0] ?? '';
    return rawRows.some((row) => {
      const name = (row[sourceHeader(LEAD_IMPORT_FIELDS.CUSTOMER_NAME)] ?? '').trim();
      const phone = (row[sourceHeader(LEAD_IMPORT_FIELDS.PHONE)] ?? '').trim();
      const source = (row[sourceHeader(LEAD_IMPORT_FIELDS.LEAD_SOURCE)] ?? '').trim();
      return name && phone.replace(/\D/g, '').length >= 5 && source;
    });
  }, [mapping, rawRows]);

  const mappedColumns = headers.filter((header) => mapping[header]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Import Leads"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-card shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between rounded-t-xl bg-blue-600 px-5 py-3 text-white">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <FileSpreadsheet className="h-5 w-5" /> Import Leads
          </h2>
          <button
            aria-label="Close import"
            onClick={onClose}
            className="rounded p-1 hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5">
          {error && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {step === 'upload' && (
            <div className="space-y-4">
              <div
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 p-8 text-center"
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOver(false);
                  onFiles(event.dataTransfer.files);
                }}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click();
                }}
              >
                <UploadCloud
                  className={`h-10 w-10 ${dragOver ? 'text-blue-600' : 'text-blue-400'}`}
                  aria-hidden="true"
                />
                <p className="font-medium text-slate-700">Drag &amp; drop a .csv file here</p>
                <p className="text-sm text-slate-500">or click to choose a file</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,text/csv"
                  aria-label="Choose a CSV file"
                  className="hidden"
                  onChange={(event) => onFiles(event.target.files)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    downloadCsv({
                      fileName: 'lead-import-sample.csv',
                      mimeType: 'text/csv',
                      content: buildSampleCsv(),
                    })
                  }
                >
                  Download Sample CSV
                </Button>
                <p className="text-xs text-slate-500">
                  Up to {LEAD_IMPORT_MAX_ROWS.toLocaleString()} rows per import
                </p>
              </div>
            </div>
          )}

          {step === 'map' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">
                    <FileSpreadsheet
                      className="mr-1 inline h-4 w-4 text-blue-600"
                      aria-hidden="true"
                    />
                    {fileName}
                  </p>
                  <p className="text-sm text-slate-500">{rawRows.length} data rows detected</p>
                </div>
                <Button size="sm" onClick={() => setStep('upload')}>
                  Choose another file
                </Button>
              </div>

              <section className="overflow-hidden rounded-lg border">
                <h3 className="border-b bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
                  Map CSV columns to Lead fields
                </h3>
                <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {headers.map((header) => (
                    <div key={header} className="block text-sm">
                      <span
                        className="mb-1 block truncate font-medium text-slate-600"
                        title={header}
                      >
                        {header}
                      </span>
                      <select
                        className="w-full rounded-md border border-slate-300 bg-card px-2 py-1.5 text-sm"
                        value={mapping[header] ?? ''}
                        onChange={(event) =>
                          setMapping((prev) => ({ ...prev, [header]: event.target.value }))
                        }
                      >
                        <option value={IGNORE}>Ignore this column</option>
                        {MAPPABLE_FIELDS.map((key) => (
                          <option key={key} value={key}>
                            {fieldLabel(key)}
                          </option>
                        ))}
                      </select>
                      {!mapping[header] && (
                        <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={noteColumns[header] ?? false}
                            onChange={(event) =>
                              setNoteColumns((prev) => ({
                                ...prev,
                                [header]: event.target.checked,
                              }))
                            }
                          />
                          Add values to lead note
                        </label>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section className="overflow-hidden rounded-lg border">
                <h3 className="border-b bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
                  Preview
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Status</th>
                        {mappedColumns.map((header) => (
                          <th key={header} className="px-3 py-2">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {preview.map((row, index) => {
                        const errors = previewErrors(row, mapping);
                        return (
                          <tr key={index}>
                            <td className="px-3 py-2">
                              {errors.length ? (
                                <span className="inline-block rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                                  Error: {errors[0]}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Valid
                                </span>
                              )}
                            </td>
                            {mappedColumns.map((header) => (
                              <td key={header} className="max-w-[180px] truncate px-3 py-2">
                                {row[header] ?? ''}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {rawRows.length > preview.length && (
                  <p className="border-t px-3 py-2 text-xs text-slate-500">
                    +{rawRows.length - preview.length} more rows
                  </p>
                )}
              </section>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={skipDuplicates}
                  onChange={(event) => setSkipDuplicates(event.target.checked)}
                />
                Skip duplicate leads (by phone/email)
              </label>

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  {canImport
                    ? 'Map Customer Name, Phone and Lead Source to import.'
                    : 'Map at least Customer Name, Phone and Lead Source to continue.'}
                </p>
                <Button onClick={runImport} disabled={!canImport || importMutation.isPending}>
                  {importMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Importing…
                    </>
                  ) : (
                    <>
                      Import <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {step === 'result' && result && (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <h3 className="flex items-center gap-2 font-semibold text-emerald-800">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> Import Complete
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Total Rows', value: result.total, cls: 'text-slate-800' },
                  { label: 'Imported', value: result.imported, cls: 'text-emerald-700' },
                  { label: 'Skipped Duplicates', value: result.skipped, cls: 'text-amber-700' },
                  { label: 'Failed', value: result.failed, cls: 'text-red-700' },
                ].map((card) => (
                  <div key={card.label} className="rounded-lg border bg-card p-3 text-center">
                    <p className={`text-2xl font-bold ${card.cls}`}>{card.value}</p>
                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                      {card.label}
                    </p>
                  </div>
                ))}
              </div>

              {result.failed > 0 && (
                <section className="overflow-hidden rounded-lg border">
                  <h3 className="border-b bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
                    Failed Rows
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Row</th>
                          <th className="px-3 py-2">Customer</th>
                          <th className="px-3 py-2">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {result.results
                          .filter((row) => row.status === 'FAILED')
                          .map((row) => (
                            <tr key={row.row}>
                              <td className="px-3 py-2 text-slate-500">{row.row}</td>
                              <td className="px-3 py-2 font-medium">{row.customerName}</td>
                              <td className="px-3 py-2 text-red-700">{row.reason}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="border-t bg-amber-50 px-4 py-3">
                    <p className="mb-2 text-xs text-amber-800">
                      Retry failed rows with invalid optional fields left blank. Customer name,
                      phone and lead source are still required.
                    </p>
                    <Button size="sm" onClick={retryFailedRows} disabled={importMutation.isPending}>
                      {importMutation.isPending
                        ? 'Retrying…'
                        : 'Import failed rows without invalid fields'}
                    </Button>
                  </div>
                </section>
              )}

              <div className="flex items-center justify-between gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => errorDownload.download(result.errorCsv)}
                  disabled={result.failed === 0}
                >
                  Download Errors CSV
                </Button>
                <Button onClick={onClose}>Done</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

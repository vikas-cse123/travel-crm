import { useState, useRef } from 'react';
import { Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle2, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  downloadTemplate,
  previewImport,
  executeImport,
  downloadErrorReport,
  triggerDownload,
  type SupportedMasterType,
  type PreviewResult,
  type ImportResult,
} from './excelImport.api';

const MASTER_LABELS: Record<SupportedMasterType, string> = {
  CITY: 'Cities',
  AIRLINE: 'Airlines',
  CRUISE: 'Cruises',
  VEHICLE: 'Vehicles',
  ADD_ON_SERVICE: 'Add-on Services',
  DESTINATION: 'Destinations',
  SIGHTSEEING: 'Sightseeing',
};

const MASTER_FILE_NAMES: Record<SupportedMasterType, string> = {
  CITY: 'Cities.xlsx',
  AIRLINE: 'Airlines.xlsx',
  CRUISE: 'Cruises.xlsx',
  VEHICLE: 'Vehicles.xlsx',
  ADD_ON_SERVICE: 'Add-On-Services.xlsx',
  DESTINATION: 'Destinations.xlsx',
  SIGHTSEEING: 'Sightseeing.xlsx',
};

interface Props {
  open: boolean;
  onClose: () => void;
  initialMasterType?: SupportedMasterType | null;
  onSuccess?: () => void;
}

export function ExcelImportDialog({ open, onClose, initialMasterType, onSuccess }: Props) {
  const [masterType, setMasterType] = useState<SupportedMasterType | ''>(initialMasterType ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleDownloadTemplate = async () => {
    if (!masterType) {
      setError('Please select a master type first.');
      return;
    }
    try {
      const blob = await downloadTemplate(masterType as SupportedMasterType);
      triggerDownload(blob, MASTER_FILE_NAMES[masterType as SupportedMasterType]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to download template');
    }
  };

  const handleFile = (f: File | null) => {
    setFile(f);
    setPreview(null);
    setImportResult(null);
    setError(null);
  };

  const handlePreview = async () => {
    if (!masterType) {
      setError('Please select a master type.');
      return;
    }
    if (!file) {
      setError('Please choose an Excel file.');
      return;
    }
    setLoadingPreview(true);
    setError(null);
    try {
      const result = await previewImport(masterType as SupportedMasterType, file);
      setPreview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleImport = async () => {
    if (!masterType || !file || !preview) return;
    setImporting(true);
    setError(null);
    try {
      const result = await executeImport(masterType as SupportedMasterType, file);
      setImportResult(result);
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleErrorReport = async () => {
    if (!masterType || !file) return;
    try {
      const blob = await downloadErrorReport(masterType as SupportedMasterType, file);
      triggerDownload(blob, `${masterType}_error_report.xlsx`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate error report');
    }
  };

  const handleClose = () => {
    setMasterType(initialMasterType ?? '');
    setFile(null);
    setPreview(null);
    setImportResult(null);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl bg-card shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b bg-card px-6 py-4">
          <h2 className="text-lg font-semibold">Import Excel</h2>
          <button onClick={handleClose} className="rounded p-1 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          {/* Master Selector */}
          {!initialMasterType && (
            <div>
              <label className="text-sm font-semibold text-slate-800">Select Master</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {(Object.keys(MASTER_LABELS) as SupportedMasterType[]).map((key) => (
                  <button
                    key={key}
                    onClick={() => setMasterType(key)}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium ${masterType === key ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-slate-200 bg-card hover:bg-slate-50'}`}
                  >
                    {MASTER_LABELS[key]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {masterType && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="font-medium">Master:</span>
              <span className="rounded bg-slate-100 px-2 py-1">{MASTER_LABELS[masterType as SupportedMasterType]}</span>
              {!initialMasterType && (
                <button onClick={() => setMasterType('')} className="text-xs text-slate-500 underline">
                  Change
                </button>
              )}
            </div>
          )}

          {/* Step 1: File */}
          <div className="rounded-xl border bg-slate-50 p-4">
            <h3 className="font-semibold text-slate-800">Step 1 — Choose Excel File</h3>
            <div className="mt-3 flex flex-wrap gap-3">
              <Button variant="secondary" onClick={handleDownloadTemplate} disabled={!masterType}>
                <Download className="h-4 w-4" /> Download Template
              </Button>
              <span className="text-xs text-slate-500 self-center">Use the template for correct headers.</span>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files[0] ?? null;
                handleFile(f);
              }}
              className={`mt-4 flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center ${dragOver ? 'border-brand-600 bg-brand-50' : 'border-slate-300 bg-card'}`}
            >
              <FileSpreadsheet className="h-10 w-10 text-slate-400" />
              <p className="mt-2 text-sm text-slate-600">
                {file ? file.name : 'Drag & Drop Excel Here'}
              </p>
              <p className="text-xs text-slate-500">or</p>
              <Button variant="secondary" onClick={() => inputRef.current?.click()} className="mt-2">
                <Upload className="h-4 w-4" /> Choose Excel File
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
              {file && <p className="mt-2 text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>}
            </div>

            {masterType && file && (
              <div className="mt-4 flex justify-end">
                <Button onClick={handlePreview} disabled={loadingPreview}>
                  {loadingPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Validate & Preview
                </Button>
              </div>
            )}
          </div>

          {/* Step 2: Preview */}
          {preview && (
            <div className="rounded-xl border p-4">
              <h3 className="font-semibold text-slate-800">Step 2 — Validate & Preview</h3>
              <div className="mt-2 flex gap-4 text-sm">
                <span className="rounded bg-slate-100 px-3 py-1">Rows: {preview.totalRows}</span>
                <span className="flex items-center gap-1 rounded bg-emerald-50 px-3 py-1 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Valid: {preview.validCount}
                </span>
                <span className="flex items-center gap-1 rounded bg-red-50 px-3 py-1 text-red-700">
                  <AlertCircle className="h-4 w-4" /> Errors: {preview.invalidCount}
                </span>
              </div>

              {/* Column mapping */}
              <div className="mt-4">
                <h4 className="text-sm font-medium">Column Mapping</h4>
                <div className="mt-1 overflow-x-auto rounded border">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2">Excel Column</th>
                        <th className="px-3 py-2">CRM Field</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {preview.columnMappings.map((m) => (
                        <tr key={m.excelHeader}>
                          <td className="px-3 py-2">{m.excelHeader}</td>
                          <td className="px-3 py-2">
                            {m.crmField ? (
                              <span className="text-emerald-700">{m.crmField} ✓</span>
                            ) : (
                              <span className="text-amber-600">Unmapped: {m.excelHeader}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {preview.unmappedColumns.length > 0 && (
                  <p className="mt-1 text-xs text-amber-600">Unmapped columns: {preview.unmappedColumns.join(', ')}</p>
                )}
              </div>

              {/* Errors */}
              {preview.invalidCount > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-red-700">Errors</h4>
                    <Button variant="secondary" onClick={handleErrorReport}>
                      <Download className="h-4 w-4" /> Download Error Report
                    </Button>
                  </div>
                  <div className="mt-2 max-h-64 overflow-auto rounded border">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-2 py-1">Row</th>
                          <th className="px-2 py-1">Field</th>
                          <th className="px-2 py-1">Value</th>
                          <th className="px-2 py-1">Error</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {preview.rows
                          .filter((r) => !r.isValid)
                          .flatMap((r) =>
                            r.errors.map((e, idx) => (
                              <tr key={`${r.rowNumber}-${idx}`}>
                                <td className="px-2 py-1">{e.row}</td>
                                <td className="px-2 py-1">{e.header}</td>
                                <td className="px-2 py-1">{e.value ?? '—'}</td>
                                <td className="px-2 py-1 text-red-600">{e.message}</td>
                              </tr>
                            )),
                          )}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-2 text-xs text-red-600">
                    {preview.invalidCount} rows contain errors and will be skipped. Only valid rows will be imported.
                  </p>
                </div>
              )}

              {/* Valid preview sample */}
              {preview.validCount > 0 && preview.invalidCount === 0 && (
                <p className="mt-3 text-sm text-emerald-700">All rows are valid. Ready to import.</p>
              )}
              {preview.validCount > 0 && preview.invalidCount > 0 && (
                <p className="mt-3 text-sm text-amber-700">
                  {preview.validCount} valid rows will be imported. {preview.invalidCount} rows will be skipped.
                </p>
              )}
            </div>
          )}

          {/* Step 3: Import */}
          {preview && (
            <div className="rounded-xl border bg-slate-50 p-4">
              <h3 className="font-semibold text-slate-800">Step 3 — Import</h3>
              {importResult ? (
                <div className="mt-3 rounded-lg border bg-card p-4 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                  <h4 className="mt-2 font-semibold">Import Complete ✓</h4>
                  <p className="text-sm text-slate-600">Master: {MASTER_LABELS[masterType as SupportedMasterType]}</p>
                  <p className="text-sm">
                    {importResult.createdCount} records imported successfully.
                  </p>
                  {importResult.skippedCount > 0 && (
                    <p className="text-sm text-amber-700">{importResult.skippedCount} rows skipped due to errors.</p>
                  )}
                  {importResult.errors && importResult.errors.length > 0 && (
                    <div className="mt-3 max-h-40 overflow-auto rounded border text-left">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="px-2 py-1">Row</th>
                            <th className="px-2 py-1">Field</th>
                            <th className="px-2 py-1">Error</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {importResult.errors.map((e, idx) => (
                            <tr key={`${e.row}-${idx}`}>
                              <td className="px-2 py-1">{e.row === 0 ? '—' : e.row}</td>
                              <td className="px-2 py-1">{e.header}</td>
                              <td className="px-2 py-1 text-red-600">{e.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="mt-3 flex justify-center gap-2">
                    <Button variant="secondary" onClick={handleClose}>
                      Close
                    </Button>
                    <Button
                      onClick={() => {
                        setPreview(null);
                        setImportResult(null);
                        setFile(null);
                      }}
                    >
                      Import Another File
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button onClick={handleImport} disabled={importing || preview.validCount === 0}>
                    {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Import {preview.validCount} Records
                  </Button>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

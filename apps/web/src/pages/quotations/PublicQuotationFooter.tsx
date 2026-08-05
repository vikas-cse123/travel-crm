import { displayQuotationId } from './quotationContact';

export interface PublicQuotationFooterProps {
  companyName: string;
  operatingSince: number | null | undefined;
  tripsSold: number | null | undefined;
  tan: string | null | undefined;
  gstin: string | null | undefined;
  quotationNumber: string;
  generatedAt: string | null | undefined;
}

/** Format a timestamp as "04 Aug 2026"; null for empty or invalid dates. */
function formatGeneratedDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/**
 * Full-width dark footer shown at the bottom of every public quotation web
 * link. All values are supplied by the caller from Company Settings and the
 * quotation itself; entries without a value are hidden (never "undefined",
 * "null", or stray separators).
 */
export function PublicQuotationFooter({
  companyName,
  operatingSince,
  tripsSold,
  tan,
  gstin,
  quotationNumber,
  generatedAt,
}: PublicQuotationFooterProps) {
  const metadata = [
    operatingSince != null && !Number.isNaN(operatingSince)
      ? `Since: ${operatingSince}`
      : null,
    tripsSold != null && !Number.isNaN(tripsSold) ? `Trips: ${tripsSold}` : null,
    tan?.trim() ? `TAN: ${tan.trim()}` : null,
    gstin?.trim() ? `GSTIN: ${gstin.trim()}` : null,
  ].filter(Boolean);

  const id = displayQuotationId(quotationNumber);
  const quotation = id ? `Quotation ID: #${id}` : null;
  const generated = formatGeneratedDate(generatedAt);
  const rightSide = [quotation, generated ? `Generated: ${generated}` : null]
    .filter(Boolean)
    .join(' | ');

  return (
    <footer className="bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium">
            © {new Date().getFullYear()} {companyName}. All rights reserved.
          </p>
          {metadata.length > 0 && (
            <p className="text-xs text-slate-400">{metadata.join(' | ')}</p>
          )}
        </div>
        {rightSide && <p className="text-xs text-slate-400">{rightSide}</p>}
      </div>
    </footer>
  );
}

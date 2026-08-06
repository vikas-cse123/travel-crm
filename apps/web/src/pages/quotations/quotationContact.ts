/**
 * Shared text helpers for the public quotation contact card (WhatsApp + Email).
 */

/** Format the customer-facing quotation ID by stripping unnecessary leading zeros. */
export function displayQuotationId(value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw) return '';
  const match = raw.match(/^([A-Z]+-?)0*(\d+)$/i);
  return match ? `${match[1]}${match[2]}` : raw;
}

/**
 * Customer-facing public weblink quotation ID: the `QT-` prefix and padding
 * zeroes are removed and exactly one `#` is added. The stored value is never
 * changed — this is presentation only.
 *
 * @example
 * formatPublicQuotationNumber('QT-001032') // '#1032'
 * formatPublicQuotationNumber('QT-1032')   // '#1032'
 * formatPublicQuotationNumber('1032')      // '#1032'
 * formatPublicQuotationNumber('#1032')     // '#1032'
 */
export function formatPublicQuotationNumber(value: string | null | undefined): string {
  const raw = value?.trim();
  if (!raw) return '';
  const cleaned = raw.replace(/^#/, '');
  const digits = cleaned.replace(/^[A-Za-z]+-?/, '').replace(/^0+/, '');
  if (/^\d+$/.test(digits) && digits !== '') return `#${digits}`;
  return cleaned ? `#${cleaned}` : '';
}

/**
 * Build the shared "ID - Title for Name" description used by the WhatsApp and
 * Email prefills. Missing values are dropped cleanly, never shown as
 * "undefined"/"null", empty parentheses, duplicate spaces, dangling hyphens or
 * dangling "for".
 *
 * The lead/traveller name is appended as "for {name}" only when the quotation
 * title does not already contain the same name (compared case-insensitively
 * with whitespace trimmed), so generated titles like
 * "Singapore Package for Vikas Singh" never repeat the name.
 */
export function buildQuotationDescription(
  quotationId: string | null | undefined,
  title: string | null | undefined,
  leadName: string | null | undefined,
): string {
  const id = displayQuotationId(quotationId);
  const t = title?.trim();
  const name = leadName?.trim();
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
  const alreadyNamed = Boolean(t && name && normalize(t).includes(normalize(name)));
  const segments: string[] = [];
  if (id) segments.push(id);
  else if (t) segments.push(t);
  if (id && t) segments.push(`- ${t}`);
  if ((id || t) && name && !alreadyNamed) segments.push(`for ${name}`);
  else if (!id && !t && name) segments.push(name);
  return segments.join(' ');
}

/** Normalise a phone number for WhatsApp: digits only (country code intact). */
export function normalizeWhatsAppPhone(phone: string | null | undefined): string {
  return (phone ?? '').replace(/[^0-9]/g, '');
}

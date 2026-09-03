import type { Quotation, QuotationVersion } from './quotations.api';

function formatTravelDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return trimmed;
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatTravellers(q: Quotation): string | null {
  const adults = q.adults ?? 0;
  const children = (q.childrenWithBed ?? 0) + (q.childrenWithoutBed ?? 0);
  const infants = q.infants ?? 0;
  const parts: string[] = [];
  if (adults) parts.push(`${adults} Adult${adults === 1 ? '' : 's'}`);
  if (children) parts.push(`${children} Child${children === 1 ? '' : 'ren'}`);
  if (infants) parts.push(`${infants} Infant${infants === 1 ? '' : 's'}`);
  if (!parts.length) return null;
  return parts.join(', ');
}

function sanitizeHeading(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hotelLine(hotel: QuotationVersion['hotels'][number]): string | null {
  const name = (hotel.hotelName ?? '').trim();
  if (!name) return null;
  const category = (hotel.category ?? '').trim();
  // Keep hotel line exactly as example: "Orchard Rendezvous Hotel (4.2-Star)"
  // No extra city/nights – stays clean and WhatsApp-readable.
  if (category) return `${name} (${category})`;
  return name;
}

function flightLines(version: QuotationVersion): string[] {
  const details = version.flightDetails;
  if (!details || !details.include) return [];
  if (details.entryMode === 'IMAGE') {
    return ['• Flight details provided as image — see weblink for details'];
  }
  const lines: string[] = [];
  const pushJourney = (label: string, journey: typeof details.outbound | typeof details.returnJourney) => {
    if (!journey?.segments?.length) return;
    const segs = journey.segments.filter(
      (s) => (s.airlineName ?? '').trim() || (s.from ?? '').trim() || (s.to ?? '').trim() || (s.flightNumber ?? '').trim(),
    );
    segs.forEach((seg) => {
      const airline = (seg.airlineName ?? '').trim();
      const flightNo = (seg.flightNumber ?? '').trim();
      const from = (seg.from ?? '').trim();
      const to = (seg.to ?? '').trim();
      const route = from && to ? `${from} → ${to}` : from || to || '';
      const carrier = [airline, flightNo].filter(Boolean).join(' ');
      const time = [seg.departureTime, seg.arrivalTime].filter(Boolean).join(' → ');
      const date = (seg.departureDate ?? '').trim();
      const parts = [carrier, route, time, date].filter(Boolean);
      if (parts.length) lines.push(`• ${parts.join(' • ')}`);
      else if (carrier || route) lines.push(`• ${carrier || route}`);
    });
    // Add a subtle journey label when both directions exist is not needed; segments alone are readable.
    void label;
  };
  // Order: outbound then return (if any)
  if (details.journeyType === 'ONEWAY_RETURN') {
    pushJourney('Return', details.returnJourney);
  } else {
    pushJourney('Outbound', details.outbound);
    if (details.journeyType === 'ROUND_TRIP') pushJourney('Return', details.returnJourney);
  }
  return lines;
}

function cruiseLines(version: QuotationVersion): string[] {
  const rows = (version.services ?? []).filter((s) => s.serviceType === 'CRUISE');
  const lines: string[] = [];
  for (const row of rows) {
    const name = (row.name ?? '').trim();
    if (!name) continue;
    lines.push(`• ${name}`);
    const nightsRaw = (row as unknown as { cruiseNights?: unknown; quantity?: unknown }).cruiseNights ?? (row as unknown as { quantity?: unknown }).quantity ?? null;
    const nights = nightsRaw != null ? Number(nightsRaw) : null;
    if (nights != null && Number.isFinite(nights) && nights > 0) {
      lines.push(`• ${nights} Night${nights === 1 ? '' : 's'}`);
    }
  }
  return lines;
}

function vehicleLines(version: QuotationVersion): string[] {
  const rows = (version.services ?? []).filter((s) => s.serviceType === 'VEHICLE_TRANSFER');
  return rows
    .map((row) => {
      const name = (row.name ?? '').trim();
      if (!name) return null;
      const city = (row.city ?? '').trim();
      const desc = (row.description ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      const parts = [name, city, desc].filter(Boolean);
      return `• ${parts.join(' — ')}`;
    })
    .filter((v): v is string => Boolean(v));
}

function itineraryLines(version: QuotationVersion): string[] {
  // Prefer sightseeingDetails when it has meaningful content, otherwise fall back to itinerary.
  const sightseeing = version.sightseeingDetails;
  if (sightseeing?.days?.length) {
    const days = sightseeing.days;
    const lines: string[] = [];
    for (const day of days) {
      const dayNumber = day.dayNumber ?? 1;
      const activities = day.activities ?? [];
      const validActivities = activities.filter(
        (a) => (a.name?.trim() ?? '') || (a.description?.trim() ?? ''),
      );
      if (validActivities.length) {
        for (const activity of validActivities) {
          const name = sanitizeHeading(activity.name ?? activity.description ?? '');
          if (!name) continue;
          // Include city when distinct and short clean-up: "Night Safari - Singapore"
          const city = activity.city?.trim();
          const label = city && !name.toLowerCase().includes(city.toLowerCase()) ? `${name} - ${city}` : name;
          lines.push(`Day ${dayNumber}: ${label}`);
        }
      } else {
        // Day without explicit activities: use day title/city as fallback.
        const title = sanitizeHeading(day.title ?? day.city ?? '');
        if (title) lines.push(`Day ${dayNumber}: ${title}`);
      }
    }
    if (lines.length) return lines;
  }

  // Legacy itinerary
  if (version.itinerary?.length) {
    return version.itinerary
      .sort((a, b) => (a.sequence ?? a.dayNumber ?? 0) - (b.sequence ?? b.dayNumber ?? 0))
      .map((row) => {
        const title = sanitizeHeading(row.title ?? row.destination ?? row.description ?? '');
        if (!title) return null;
        const dayNumber = row.dayNumber ?? 1;
        return `Day ${dayNumber}: ${title}`;
      })
      .filter((v): v is string => Boolean(v));
  }
  return [];
}

function visaLines(version: QuotationVersion): string[] {
  if (!version.includeVisa) return [];
  const destination = (version.visaDestination ?? '').trim();
  const type = (version.visaType ?? '').trim();
  if (destination && type) return [`• ${destination} - ${type}`];
  if (destination) return [`• ${destination}`];
  if (type) return [`• ${type}`];
  // Fallback: scan services for visa-like entries (defensive, no pricing exposure)
  const visaServices = (version.services ?? [])
    .filter((s) => s.serviceType?.toUpperCase().includes('VISA'))
    .map((s) => s.name?.trim() || s.description?.trim() || '')
    .filter(Boolean)
    .map((name) => `• ${name}`);
  return visaServices;
}

export interface WhatsAppSummaryOptions {
  includeFlights?: boolean;
  includeCruises?: boolean;
  includeVehicles?: boolean;
}

export interface WhatsAppSummaryInput {
  quotation: Quotation;
  version: QuotationVersion;
  weblinkUrl?: string | null;
  companyName: string;
  preparedByName?: string | null;
  options?: WhatsAppSummaryOptions;
}

export function buildWhatsAppSummary(input: WhatsAppSummaryInput): string {
  const { quotation, version, weblinkUrl, companyName, preparedByName, options } = input;
  const includeFlights = Boolean(options?.includeFlights);
  const includeCruises = Boolean(options?.includeCruises);
  const includeVehicles = Boolean(options?.includeVehicles);
  const companyDisplay = (companyName ?? '').trim() || 'Our Team';
  const preparedBy = (preparedByName ?? quotation.createdBy?.fullName ?? '').trim();

  const travelDate = formatTravelDate(version.travelStartDate ?? quotation.travelStartDate);
  // Prefer version-level counts if they diverge? Quotation holds authoritative pax; keep quotation.
  const travellers = formatTravellers(quotation);
  const destinations = (version.destinationSummary ?? quotation.destinationSummary ?? '').trim();

  const hotelsSorted = [...(version.hotels ?? [])].sort(
    (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0),
  );
  const hotelOptions = hotelsSorted
    .map((hotel) => hotelLine(hotel))
    .filter((v): v is string => Boolean(v));

  const visas = visaLines(version);
  const itinerary = itineraryLines(version);
  const flights = includeFlights ? flightLines(version) : [];
  const cruises = includeCruises ? cruiseLines(version) : [];
  const vehicles = includeVehicles ? vehicleLines(version) : [];

  const lines: string[] = [];

  lines.push(`Hello,`);
  lines.push('');
  lines.push(`Greetings from *${companyDisplay}*!`);
  lines.push('');
  lines.push('We are pleased to share your travel quotation details:');
  lines.push('');

  if (travelDate) lines.push(`► *Travel Date:* ${travelDate}`);
  if (travellers) lines.push(`► *Travelers:* ${travellers}`);
  if (destinations) lines.push(`► *Destinations:* ${destinations}`);

  // Only add a blank separator if we rendered any of the header facts.
  if (travelDate || travellers || destinations) lines.push('');

  if (hotelOptions.length) {
    lines.push('== *HOTELS* ==');
    hotelOptions.forEach((entry) => {
      lines.push(`• ${entry}`);
    });
    lines.push('');
  }

  // Optional sections — off by default, toggled via UI when needed
  if (flights.length) {
    lines.push('== *FLIGHT DETAILS* ==');
    flights.forEach((v) => lines.push(v));
    lines.push('');
  }

  if (cruises.length) {
    lines.push('== *CRUISE DETAILS* ==');
    cruises.forEach((v) => lines.push(v));
    lines.push('');
  }

  if (vehicles.length) {
    lines.push('== *VEHICLE DETAILS* ==');
    vehicles.forEach((v) => lines.push(v));
    lines.push('');
  }

  if (visas.length) {
    lines.push('== *VISA DETAILS* ==');
    visas.forEach((v) => lines.push(v));
    lines.push('');
  }

  if (itinerary.length) {
    lines.push('== *ITINERARY* ==');
    itinerary.forEach((item) => lines.push(item));
    lines.push('');
  }

  if (weblinkUrl?.trim()) {
    lines.push('Click on Weblink for Pricing & more details:');
    lines.push(`► ${weblinkUrl.trim()}`);
    lines.push('');
  }

  lines.push('------------------------');
  if (preparedBy) lines.push(`Prepared by: *${preparedBy}*`);
  lines.push(companyDisplay);

  // Join and collapse any accidental triple blank lines for neatness.
  const raw = lines.join('\n');
  return raw.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/* ------------------------------------------------------------------ */
/* Rich-text helpers — markdown (WhatsApp) <-> polished HTML for the  */
/* production-quality editor. The generation stays markdown-only; the   */
/* editor only displays formatted HTML.                                 */
/* ------------------------------------------------------------------ */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMarkdownToHtml(value: string): string {
  let html = escapeHtml(value);
  // Code first (so * inside code not treated as bold)
  html = html.replace(/```([^`]+)```/g, '<code class="rounded bg-slate-100 px-1 py-0.5 font-mono text-[13px] text-slate-700">$1</code>');
  html = html.replace(/~([^~]+)~/g, '<s>$1</s>');
  html = html.replace(/\*([^*]+)\*/g, '<strong class="font-semibold text-slate-900">$1</strong>');
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
  return html;
}

/**
 * Convert the canonical WhatsApp markdown (the exact default summary) to
 * polished HTML for the rich-text editor. The HTML uses Tailwind prose
 * classes so the preview looks like the CRM — not raw *, ==, ►.
 */
export function whatsappMarkdownToHtml(markdown: string): string {
  const rawLines = markdown.replace(/\r/g, '').split('\n');
  let html = '';
  let inList = false;
  const closeList = () => {
    if (inList) {
      html += '</ul>';
      inList = false;
    }
  };

  for (const raw of rawLines) {
    const line = raw.replace(/\s+$/, '');
    const trimmed = line.trim();

    if (!trimmed) {
      closeList();
      html += '<p class="h-3 leading-none"><br></p>';
      continue;
    }

    if (trimmed === '------------------------') {
      closeList();
      html += '<hr class="my-5 border-slate-200" />';
      continue;
    }

    // == *HEADING* ==
    const headingMatch = trimmed.match(/^==\s*\*(.+?)\*\s*==$/);
    if (headingMatch) {
      closeList();
      const title = (headingMatch[1] ?? '').trim();
      html += `<h3 class="mt-6 mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">${escapeHtml(title)}</h3>`;
      continue;
    }

    // Bullet
    if (trimmed.startsWith('•')) {
      const content = trimmed.slice(1).trim();
      if (!inList) {
        html += '<ul class="my-2 space-y-1 pl-5 list-disc marker:text-slate-400">';
        inList = true;
      }
      html += `<li class="text-[14px] leading-6 text-slate-700">${inlineMarkdownToHtml(content)}</li>`;
      continue;
    }
    closeList();

    // Arrow line ► ...
    if (trimmed.startsWith('►')) {
      const content = trimmed.slice(1).trim();
      // Detect bare weblink URL line
      if (/^https?:\/\//.test(content)) {
        html += `<p class="my-1 flex items-start gap-2 text-sm"><span class="mt-0.5 text-emerald-600">►</span> <a href="${escapeHtml(content)}" target="_blank" rel="noreferrer" class="break-all text-emerald-700 underline decoration-emerald-200 underline-offset-2">${escapeHtml(content)}</a></p>`;
      } else {
        html += `<p class="my-1 flex items-start gap-2 text-sm"><span class="mt-0.5 text-emerald-600">►</span> <span class="leading-6 text-slate-700">${inlineMarkdownToHtml(content)}</span></p>`;
      }
      continue;
    }

    // Hotel option label *OPTION A*
    const optionMatch = trimmed.match(/^\*OPTION\s+[A-Z]\*$/);
    if (optionMatch) {
      const label = trimmed.replace(/\*/g, '').trim();
      html += `<p class="mt-4 mb-1 text-xs font-bold tracking-wide text-slate-900">${escapeHtml(label)}</p>`;
      continue;
    }

    // Regular paragraph — may contain inline *bold*
    html += `<p class="my-1.5 text-[14px] leading-6 text-slate-700">${inlineMarkdownToHtml(trimmed)}</p>`;
  }
  closeList();
  // Wrap in a minimal container for contentEditable styling
  return `<div class="space-y-1">${html}</div>`;
}

function inlineHtmlToWhatsApp(node: Node): string {
  let out = '';
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out += (child.textContent ?? '');
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const inner = inlineHtmlToWhatsApp(el);
      if (tag === 'strong' || tag === 'b') out += `*${inner}*`;
      else if (tag === 'em' || tag === 'i') out += `_${inner}_`;
      else if (tag === 's' || tag === 'strike' || tag === 'del') out += `~${inner}~`;
      else if (tag === 'code') out += `\`\`\`${inner}\`\`\``;
      else if (tag === 'a') out += inner || el.getAttribute('href') || '';
      else if (tag === 'br') out += '\n';
      else if (tag === 'span') out += inner;
      else out += inner;
    }
  }
  return out;
}

/**
 * Convert polished editor HTML back to the canonical WhatsApp markdown
 * (plain text with *, _, ►, •, ==, ---). Used for the final Copy.
 */
export function richHtmlToWhatsappMarkdown(html: string): string {
  if (!html || !html.trim()) return '';
  // Use a temporary element — works in browser & JSDOM (tests).
  const container =
    typeof document !== 'undefined' ? document.createElement('div') : (null as unknown as HTMLDivElement);
  if (container) container.innerHTML = html;
  else return html.replace(/<[^>]*>/g, '').trim();

  const lines: string[] = [];
  const blockElements = Array.from(container.childNodes);

  // The markdownToHtml wrapper is a single <div class="space-y-1"> — unwrap it
  const roots: Node[] =
    blockElements.length === 1 &&
    (blockElements[0] as HTMLElement).tagName?.toLowerCase() === 'div' &&
    (blockElements[0] as HTMLElement).className?.includes('space-y-1')
      ? Array.from((blockElements[0] as HTMLElement).childNodes)
      : blockElements;

  for (const node of roots) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent ?? '').trim();
      if (text) lines.push(text);
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'h3') {
      const text = inlineHtmlToWhatsApp(el).trim().replace(/\*/g, '');
      if (text) lines.push(`== *${text}* ==`);
      continue;
    }
    if (tag === 'hr') {
      lines.push('------------------------');
      continue;
    }
    if (tag === 'ul' || tag === 'ol') {
      for (const li of Array.from(el.children)) {
        if (li.tagName.toLowerCase() !== 'li') continue;
        const text = inlineHtmlToWhatsApp(li).trim();
        if (text) lines.push(`• ${text}`);
      }
      continue;
    }
    if (tag === 'p' || tag === 'div') {
      // Detect arrow paragraph: it contains a leading ► span
      const isArrow = el.textContent?.trim().startsWith('►') || el.innerHTML.includes('►') || el.querySelector('span')?.textContent?.trim() === '►';
      // Empty spacer <p><br></p> or <p class="h-3">
      const isEmptySpacer =
        el.className?.includes('h-3') ||
        (el.textContent?.trim() === '' && el.innerHTML.includes('<br')) ||
        el.innerHTML.trim() === '<br>' ||
        el.innerHTML.trim() === '';
      if (isEmptySpacer) {
        lines.push('');
        continue;
      }
      const inline = inlineHtmlToWhatsApp(el).trim().replace(/\s+/g, ' ').trim();
      if (!inline) {
        lines.push('');
        continue;
      }
      // If arrow was stripped to text, re-add ► prefix
      if (isArrow && !inline.startsWith('►')) {
        // Check if original had arrow: we already have ► in text if span kept
        // inlineHtmlToWhatsApp keeps span text "►"
        lines.push(inline);
      } else if (isArrow && inline.startsWith('►')) {
        lines.push(inline);
      } else {
        // Detect hotel option label: all caps OPTION
        if (/^OPTION\s+[A-Z]$/.test(inline.replace(/\*/g, '').trim())) {
          lines.push(`*${inline.replace(/\*/g, '').trim()}*`);
        } else {
          lines.push(inline);
        }
      }
      continue;
    }
    // Fallback
    const text = inlineHtmlToWhatsApp(el).trim();
    if (text) lines.push(text);
  }

  // Normalize: collapse 3+ blank lines, trim
  const raw = lines.join('\n');
  return raw.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

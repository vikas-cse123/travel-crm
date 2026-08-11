import { useState } from 'react';
import {
  ChevronDown,
  Clock,
  Cpu,
  Gauge,
  Globe,
  Link2,
  MapPin,
  Monitor,
  MonitorSmartphone,
  Smartphone,
  Tablet,
  Users,
  Wifi,
} from 'lucide-react';
import { useQuotationWeblinkAnalytics, type WeblinkAnalyticsEntry } from './quotations.api';

/** Join defined, non-empty parts with a middle dot. */
const join = (parts: Array<string | number | null | undefined>) =>
  parts.filter((part) => part !== null && part !== undefined && part !== '').join(' · ');

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

const fmtDuration = (seconds: number | null) => {
  if (!seconds || seconds <= 0) return null;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
};

const fmtAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

const cap = (value: string | null) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : null;

const hostOf = (url: string | null) => {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="break-words text-sm text-slate-700">{value}</p>
      </div>
    </div>
  );
}

function VisitorCard({ v }: { v: WeblinkAnalyticsEntry }) {
  const [showUa, setShowUa] = useState(false);

  const DeviceIcon =
    v.deviceType === 'mobile' ? Smartphone : v.deviceType === 'tablet' ? Tablet : Monitor;
  const returning = v.views > 1;

  const location = join([v.city, v.region, v.country]) || 'Unknown location';
  const coords =
    v.latitude != null && v.longitude != null
      ? `${v.latitude.toFixed(2)}, ${v.longitude.toFixed(2)}`
      : null;
  const browser = v.browser
    ? `${v.browser}${v.browserVersion ? ` ${v.browserVersion.split('.')[0]}` : ''}`
    : null;
  const osText = v.os ? `${v.os}${v.osVersion ? ` ${v.osVersion}` : ''}` : null;

  const device = join([browser, osText, cap(v.deviceType), v.deviceVendor, v.deviceModel]);
  const display = join([
    v.screenWidth && v.screenHeight ? `${v.screenWidth}×${v.screenHeight}` : null,
    v.viewportWidth && v.viewportHeight ? `viewport ${v.viewportWidth}×${v.viewportHeight}` : null,
    v.pixelRatio ? `${v.pixelRatio}×` : null,
    v.colorDepth ? `${v.colorDepth}-bit` : null,
    v.orientation ? v.orientation.replace('-primary', '').replace('-secondary', '') : null,
  ]);
  const system = join([
    v.cpuCores ? `${v.cpuCores} cores` : null,
    v.deviceMemory ? `${v.deviceMemory} GB RAM` : null,
    v.platform,
  ]);
  const locale = join([
    v.language,
    v.languages !== v.language ? v.languages : null,
    v.clientTimezone,
  ]);
  const network = join([
    v.connectionType?.toUpperCase(),
    v.connectionDownlink ? `${v.connectionDownlink} Mbps` : null,
    v.connectionRtt != null ? `${v.connectionRtt}ms` : null,
    v.online === null ? null : v.online ? 'Online' : 'Offline',
  ]);
  const host = hostOf(v.referrer);
  const utm = join([v.utmSource, v.utmMedium, v.utmCampaign]);
  const traffic = join([host ? `From ${host}` : 'Direct', utm ? `UTM ${utm}` : null]);
  const duration = fmtDuration(v.timeOnPageSeconds);
  const engagement = join([
    v.maxScrollDepth != null ? `Scroll ${v.maxScrollDepth}%` : null,
    duration ? duration : null,
    v.ctaClicks ? `${v.ctaClicks} clicks` : null,
  ]);

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/70 p-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <DeviceIcon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-800">
              {v.city ? `Visitor from ${v.city}` : 'Visitor'}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                v.type === 'HOME'
                  ? 'bg-slate-200 text-slate-600'
                  : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {v.type}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                returning ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
              }`}
            >
              {returning ? 'Returning' : 'New'}
            </span>
          </div>
          <p className="truncate text-xs text-slate-500">{join([v.ipAddress, osText, browser])}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold leading-none text-slate-800">{v.views}</p>
          <p className="text-[10px] uppercase tracking-wide text-slate-400">
            view{v.views === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="grid gap-x-5 px-4 py-2 sm:grid-cols-2">
        <DetailRow icon={MapPin} label="Location" value={join([location, v.isp, coords])} />
        <DetailRow icon={DeviceIcon} label="Device" value={device} />
        <DetailRow icon={MonitorSmartphone} label="Display" value={display} />
        <DetailRow icon={Cpu} label="System" value={system} />
        <DetailRow icon={Globe} label="Locale" value={locale} />
        <DetailRow icon={Wifi} label="Network" value={network} />
        <DetailRow icon={Link2} label="Traffic" value={traffic} />
        <DetailRow icon={Gauge} label="Engagement" value={engagement} />
      </div>

      {/* Footer */}
      <div className="border-t border-slate-100 px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-xs text-slate-400">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          First {fmtDateTime(v.firstViewedAt)} · Last {fmtDateTime(v.lastViewedAt)} (
          {fmtAgo(v.lastViewedAt)})
        </p>
        {v.userAgent && (
          <div className="mt-1">
            <button
              type="button"
              onClick={() => setShowUa((prev) => !prev)}
              className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showUa ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
              User agent
            </button>
            {showUa && (
              <p className="mt-1 break-all rounded bg-slate-50 p-2 font-mono text-[11px] text-slate-500">
                {v.userAgent}
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 text-center">
      <p className="text-lg font-semibold text-slate-800">{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
    </div>
  );
}

/**
 * Per-visitor weblink analytics for a quotation. Each card aggregates one IP,
 * enriched with geolocation, device, display, network, referrer/UTM and
 * engagement (scroll / time on page / clicks).
 */
export function WeblinkVisitors({ quotationId }: { quotationId: string }) {
  const analytics = useQuotationWeblinkAnalytics(quotationId);
  const data = analytics.data;
  // Profiled clients only — team (HOME-IP) views are counted but not profiled.
  const clients = (data?.entries ?? []).filter((entry) => entry.type === 'EXTERNAL');

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-semibold text-slate-800">
          <Users className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          Weblink visitors
        </h2>
        {data && ((data.entries?.length ?? 0) > 0 || data.totalViews > 0) && (
          <div className="grid grid-cols-3 gap-2">
            <StatChip label="Views" value={data.totalViews} />
            <StatChip label="Unique" value={data.uniqueIps} />
            <StatChip label="External" value={data.externalViews} />
          </div>
        )}
      </div>

      {analytics.isLoading && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="h-40 animate-pulse rounded-xl bg-slate-100" aria-hidden="true" />
          <div className="h-40 animate-pulse rounded-xl bg-slate-100" aria-hidden="true" />
        </div>
      )}
      {analytics.isError && (
        <p role="alert" className="mt-4 text-sm text-slate-400">
          Visitor analytics could not be loaded.
        </p>
      )}
      {data && clients.length === 0 && (
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 py-10 text-center">
          <Users className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-slate-500">No client visits yet</p>
          <p className="text-xs text-slate-400">
            Details appear here when an external client opens the weblink. Your own team’s views
            (HOME IP) are counted above but not profiled.
          </p>
        </div>
      )}
      {clients.length > 0 && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {clients.map((entry) => (
            <VisitorCard key={entry.ipAddress} v={entry} />
          ))}
        </div>
      )}
    </section>
  );
}

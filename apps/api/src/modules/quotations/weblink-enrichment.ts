/**
 * Best-effort visitor enrichment for public weblink analytics.
 *
 * - `parseUserAgent` derives browser / OS / device from a User-Agent string
 *   with no external dependency (covers the common desktop + mobile cases).
 * - `geolocateIp` resolves approximate country / region / city / ISP from an IP
 *   using the free, no-key ip-api.com service. It is intentionally isolated so
 *   the provider can be swapped later, and it fails silently (returns null) on
 *   private/loopback IPs, timeouts or any error — analytics must never break a
 *   page view.
 */

export interface ParsedUserAgent {
  browser: string | null;
  browserVersion: string | null;
  os: string | null;
  osVersion: string | null;
  deviceType: 'mobile' | 'tablet' | 'desktop' | null;
  deviceVendor: string | null;
  deviceModel: string | null;
}

const firstMatch = (ua: string, re: RegExp): string | null => {
  const m = re.exec(ua);
  return m?.[1] ?? null;
};

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  const s = ua ?? '';
  if (!s) {
    return {
      browser: null,
      browserVersion: null,
      os: null,
      osVersion: null,
      deviceType: null,
      deviceVendor: null,
      deviceModel: null,
    };
  }

  // Browser (order matters: Edge/Opera/Brave masquerade as Chrome).
  let browser: string | null = null;
  let browserVersion: string | null = null;
  if (/Edg\//.test(s)) {
    browser = 'Edge';
    browserVersion = firstMatch(s, /Edg\/([\d.]+)/);
  } else if (/OPR\/|Opera/.test(s)) {
    browser = 'Opera';
    browserVersion = firstMatch(s, /(?:OPR|Opera)\/([\d.]+)/);
  } else if (/SamsungBrowser/.test(s)) {
    browser = 'Samsung Internet';
    browserVersion = firstMatch(s, /SamsungBrowser\/([\d.]+)/);
  } else if (/Firefox\//.test(s)) {
    browser = 'Firefox';
    browserVersion = firstMatch(s, /Firefox\/([\d.]+)/);
  } else if (/Chrome\//.test(s)) {
    browser = 'Chrome';
    browserVersion = firstMatch(s, /Chrome\/([\d.]+)/);
  } else if (/Version\/[\d.]+.*Safari/.test(s) || /Safari\//.test(s)) {
    browser = 'Safari';
    browserVersion = firstMatch(s, /Version\/([\d.]+)/);
  }

  // OS + version.
  let os: string | null = null;
  let osVersion: string | null = null;
  if (/Windows NT/.test(s)) {
    os = 'Windows';
    const nt = firstMatch(s, /Windows NT ([\d.]+)/);
    const map: Record<string, string> = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' };
    osVersion = nt ? (map[nt] ?? nt) : null;
  } else if (/Android/.test(s)) {
    os = 'Android';
    osVersion = firstMatch(s, /Android ([\d.]+)/);
  } else if (/(iPhone|iPad|iPod)/.test(s)) {
    os = 'iOS';
    osVersion = (firstMatch(s, /OS ([\d_]+)/) ?? '').replace(/_/g, '.') || null;
  } else if (/Mac OS X/.test(s)) {
    os = 'macOS';
    osVersion = (firstMatch(s, /Mac OS X ([\d_]+)/) ?? '').replace(/_/g, '.') || null;
  } else if (/CrOS/.test(s)) {
    os = 'ChromeOS';
  } else if (/Linux/.test(s)) {
    os = 'Linux';
  }

  // Device type + rough vendor/model.
  let deviceType: ParsedUserAgent['deviceType'] = 'desktop';
  if (/iPad|Tablet|PlayBook|Silk/.test(s) || (/Android/.test(s) && !/Mobile/.test(s))) {
    deviceType = 'tablet';
  } else if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/.test(s)) {
    deviceType = 'mobile';
  }
  let deviceVendor: string | null = null;
  if (/iPhone|iPad|iPod|Macintosh/.test(s)) deviceVendor = 'Apple';
  else if (/Samsung|SM-/.test(s)) deviceVendor = 'Samsung';
  else if (/Pixel/.test(s)) deviceVendor = 'Google';
  else if (/Xiaomi|Redmi|Mi /.test(s)) deviceVendor = 'Xiaomi';
  else if (/OnePlus/.test(s)) deviceVendor = 'OnePlus';
  const deviceModel =
    firstMatch(s, /\(([^;]*iPhone[^;]*)/) ??
    firstMatch(
      s,
      /;\s?([A-Za-z0-9 _-]*(?:SM-|Pixel|Redmi|Mi|OnePlus)[A-Za-z0-9 _-]*)\s?(?:Build|\))/,
    ) ??
    (/(iPhone)/.test(s)
      ? 'iPhone'
      : /(iPad)/.test(s)
        ? 'iPad'
        : /Macintosh/.test(s)
          ? 'Macintosh'
          : null);

  return { browser, browserVersion, os, osVersion, deviceType, deviceVendor, deviceModel };
}

export interface IpGeo {
  country: string | null;
  region: string | null;
  city: string | null;
  isp: string | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** True for loopback/private ranges that no geo provider can resolve. */
function isPrivateIp(ip: string): boolean {
  return (
    ip === '' ||
    ip === '0.0.0.0' ||
    ip === '::1' ||
    ip === '127.0.0.1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('169.254.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith('fc') ||
    ip.startsWith('fd')
  );
}

/**
 * Approximate geolocation for an IP. Best-effort: a short timeout and any
 * failure resolves to null. Swap this single function to change providers.
 */
export async function geolocateIp(ip: string | null | undefined): Promise<IpGeo | null> {
  const clean = (ip ?? '').trim();
  if (!clean || isPrivateIp(clean)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(clean)}?fields=status,country,regionName,city,lat,lon,isp,timezone`,
      { signal: controller.signal },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      status?: string;
      country?: string;
      regionName?: string;
      city?: string;
      lat?: number;
      lon?: number;
      isp?: string;
      timezone?: string;
    };
    if (data.status !== 'success') return null;
    return {
      country: data.country ?? null,
      region: data.regionName ?? null,
      city: data.city ?? null,
      isp: data.isp ?? null,
      timezone: data.timezone ?? null,
      latitude: typeof data.lat === 'number' ? data.lat : null,
      longitude: typeof data.lon === 'number' ? data.lon : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

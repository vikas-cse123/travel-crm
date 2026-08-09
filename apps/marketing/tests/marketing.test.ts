import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const APP_DIR = resolve(import.meta.dirname, '..');
const DIST = join(APP_DIR, 'dist');

const read = (path: string): string => {
  const file = join(DIST, path);
  if (!existsSync(file)) {
    throw new Error(`Missing built file: ${file}`);
  }
  return readFileSync(file, 'utf8');
};

const readSource = (path: string): string => {
  const file = join(APP_DIR, path);
  if (!existsSync(file)) {
    throw new Error(`Missing source file: ${file}`);
  }
  return readFileSync(file, 'utf8');
};

const count = (haystack: string, needle: string): number => {
  return haystack.split(needle).length - 1;
};

let home: string;

describe('marketing site build output', () => {
  beforeAll(() => {
    expect(existsSync(DIST), `dist directory must exist at ${DIST}`).toBe(true);
    home = read('index.html');
  });

  it('builds a homepage', () => {
    expect(home.length).toBeGreaterThan(1000);
    expect(home).toContain('<!doctype html>');
  });

  it('homepage has exactly one H1', () => {
    expect(count(home, '<h1')).toBe(1);
  });

  it('Go to App link points to the CRM login page', () => {
    const matches = home.match(/href="https:\/\/app\.travelagencycrm\.in\/login"/g);
    expect(matches && matches.length).toBeGreaterThanOrEqual(1);
  });

  it('main navigation links point to valid sections/pages', () => {
    // Nav links present in the header
    for (const href of ['#features', '#how-it-works', '#modules', '#faq']) {
      expect(home).toContain(`href="${href}"`);
    }
    // In-page sections referenced by anchors exist
    for (const id of ['quotations', 'operations', 'team', 'benefits']) {
      expect(home).toContain(`id="${id}"`);
    }
    expect(home).toContain('/privacy');
    expect(home).toContain('/terms');
  });

  it('mobile menu is accessible (toggle button, aria attributes)', () => {
    expect(home).toContain('class="nav-toggle"');
    expect(home).toContain('aria-expanded');
    expect(home).toContain('aria-controls');
    expect(home).toContain('aria-label="Toggle menu"');
  });

  it('contains important offerings', () => {
    for (const phrase of ['Leads and enquiries', 'Quotations and itineraries', 'Bookings and operations', 'Payments and customers', 'Team and access control', 'Follow-ups and reminders']) {
      expect(home).toContain(phrase);
    }
  });

  it('does not contain unverified claims (stats, testimonials, ratings, pricing)', () => {
    const unverified = [
      'testimonial',
      'Testimonial',
      'awards',
      'certified',
      'uptime',
      '99.',
      '10,000',
      'thousands of agencies',
      'satisfied customers',
      'star rating',
      'review count',
      '₹',
      'Rs.',
      'per user',
      '/month',
      '/year',
      'starting at',
    ];
    for (const term of unverified) {
      expect(home).not.toContain(term);
    }
    // 'rating' alone is a false positive inside JSON-LD "operatingSystem"
  });

  it('does not contain private customer data or example emails/phones', () => {
    const privateData = [
      '@gmail.com',
      '@yahoo.com',
      '@outlook.com',
      'vikas',
      'sagar',
      'sahni',
      '+91',
      '98765',
      'interscale.local',
      'interscale.test',
    ];
    for (const term of privateData) {
      expect(home).not.toContain(term);
    }
    // Real quotation/booking IDs look like quotation-<digits> or booking-<digits>.
    expect(home).not.toMatch(/quotation-\d/);
    expect(home).not.toMatch(/booking-\d/);
  });
});

describe('additional pages', () => {
  it('privacy page builds', () => {
    const p = read('privacy.html');
    expect(p).toContain('Privacy Policy');
    expect(p).toContain('<h1>');
  });

  it('terms page builds', () => {
    const t = read('terms.html');
    expect(t).toContain('Terms and Conditions');
    expect(t).toContain('<h1>');
  });

  it('404 page builds', () => {
    const n = read('404.html');
    expect(n).toContain('Page not found');
  });
});

describe('SEO', () => {
  it('robots.txt exists and references sitemap', () => {
    const r = read('robots.txt');
    expect(r).toContain('Sitemap: https://travelagencycrm.in/sitemap.xml');
  });

  it('sitemap.xml uses the correct domain', () => {
    const s = read('sitemap.xml');
    expect(s).toContain('https://travelagencycrm.in/');
    expect(s).toContain('https://travelagencycrm.in/privacy');
    expect(s).toContain('https://travelagencycrm.in/terms');
    expect(s).not.toContain('app.travelagencycrm.in');
  });

  it('homepage canonical is correct', () => {
    expect(home).toContain('rel="canonical" href="https://travelagencycrm.in/"');
  });

  it('open graph metadata exists', () => {
    expect(home).toContain('property="og:title"');
    expect(home).toContain('property="og:description"');
    expect(home).toContain('property="og:image"');
    expect(home).toContain('name="twitter:card"');
  });

  it('unique page title exists', () => {
    expect(home).toContain('<title>Travel CRM — Travel Agency Operations Software</title>');
  });
});

describe('accessibility', () => {
  it('images have alt attributes', () => {
    // Built HTML must not contain <img> without alt (no <img> tags exist by design; check source too)
    const imgTags = home.match(/<img\b[^>]*>/g) ?? [];
    for (const tag of imgTags) {
      expect(tag).toMatch(/alt=/);
    }
    expect(imgTags.length).toBe(0);
  });

  it('decorative svg has empty alt / aria-hidden', () => {
    expect(home).toContain('aria-hidden="true"');
  });

  it('has a skip link', () => {
    expect(home).toContain('Skip to main content');
  });
});

describe('no CRM session/auth coupling', () => {
  it('built HTML does not reference authenticated CRM assets or API', () => {
    for (const term of ['/api/', 'X-CSRF', 'interscale_sid', 'session', 'login?', 'signup']) {
      expect(home).not.toContain(term);
    }
  });

  it('source does not import CRM code', () => {
    const srcFiles = readdirSync(join(APP_DIR, 'src'));
    for (const f of srcFiles) {
      const content = readFileSync(join(APP_DIR, 'src', f), 'utf8');
      expect(content).not.toMatch(/from ['"]@interscale\/(web|api|shared)['"]/);
      expect(content).not.toMatch(/import\(['"].*apps\/(web|api)['"]\)/);
    }
  });
});

describe('production nginx behaviour', () => {
  let nginx: string;

  beforeAll(() => {
    nginx = readSource('nginx.conf');
  });

  it('missing static assets return 404 (no SPA fallback to index.html for unknown files)', () => {
    expect(nginx).toContain('try_files $uri =404;');
    expect(nginx).not.toContain('try_files $uri $uri/ /index.html');
  });

  it('/healthz returns 200', () => {
    expect(nginx).toMatch(/location = \/healthz[\s\S]*?return 200/);
  });

  it('does not proxy /api (marketing site never serves the CRM API)', () => {
    expect(nginx).not.toContain('proxy_pass');
    // /api and /api/* locations return 404 instead of proxying
    expect(nginx).toMatch(/location = \/api \{ return 404; \}/);
    expect(nginx).toMatch(/location \^~ \/api\/ \{ return 404; \}/);
  });

  it('serves on port 8080', () => {
    expect(nginx).toContain('listen 8080');
  });
});

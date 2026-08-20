import { describe, expect, it } from 'vitest';
import {
  hasPolicyHtml,
  leadRequestedTabs,
  masterGallerySnapshot,
  mergeMasterGalleryPreviews,
  policyValue,
  serviceTypeToTabKey,
} from '@/pages/quotations/QuotationBuilderPage';

describe('QuotationBuilder — Master gallery snapshots', () => {
  it('creates ordered opaque refs synchronously without persisting preview URLs', () => {
    const snapshot = masterGallerySnapshot(
      [{ id: 'image-a' }, { id: 'image-b' }, { id: 'image-c' }] as Parameters<
        typeof masterGallerySnapshot
      >[0],
      'Harbour Hotel',
    );

    expect(snapshot).toEqual([
      { masterImageId: 'image-a', alt: 'Harbour Hotel image 1' },
      { masterImageId: 'image-b', alt: 'Harbour Hotel image 2' },
      { masterImageId: 'image-c', alt: 'Harbour Hotel image 3' },
    ]);
  });

  it('merges delayed preview URLs into the current order without restoring removals', () => {
    const imported = masterGallerySnapshot(
      [{ id: 'image-a' }, { id: 'image-b' }, { id: 'image-c' }] as Parameters<
        typeof masterGallerySnapshot
      >[0],
      'Harbour Hotel',
    );
    const current = [imported[2]!, imported[0]!];
    const previewed = imported.map((image) => ({
      ...image,
      url: `https://preview.test/${image.masterImageId}.jpg`,
    }));

    expect(mergeMasterGalleryPreviews(current, previewed)).toEqual([
      { ...imported[2], url: 'https://preview.test/image-c.jpg' },
      { ...imported[0], url: 'https://preview.test/image-a.jpg' },
    ]);
  });
});

describe('QuotationBuilder — lead service → quotation tab mapping', () => {
  it('maps every Lead service type to its quotation tab', () => {
    expect(serviceTypeToTabKey('FLIGHT')).toBe('flight');
    expect(serviceTypeToTabKey('HOTEL')).toBe('hotel');
    expect(serviceTypeToTabKey('SIGHTSEEING')).toBe('sightseeing');
    expect(serviceTypeToTabKey('CRUISE')).toBe('cruise');
    expect(serviceTypeToTabKey('VEHICLE_TRANSFER')).toBe('vehicle');
    // Every Add-on service type maps to the Add-on Services tab.
    for (const addon of [
      'TRAVEL_INSURANCE',
      'RAIL',
      'PASSPORT_ASSISTANCE',
      'MEAL',
      'GUIDE',
      'OTHER_ADD_ON',
      'GENERAL_ENQUIRY',
    ]) {
      expect(serviceTypeToTabKey(addon)).toBe('addon');
    }
  });

  it('returns null for non-service or unknown types', () => {
    expect(serviceTypeToTabKey('VISA')).toBeNull();
    expect(serviceTypeToTabKey('UNKNOWN')).toBeNull();
  });

  it('CASE 1 — all six services selected on the Lead → all six tabs requested', () => {
    const requested = leadRequestedTabs({
      services: [
        { serviceType: 'FLIGHT' },
        { serviceType: 'HOTEL' },
        { serviceType: 'SIGHTSEEING' },
        { serviceType: 'CRUISE' },
        { serviceType: 'VEHICLE_TRANSFER' },
        { serviceType: 'OTHER_ADD_ON' },
      ],
    });
    for (const tab of ['flight', 'hotel', 'sightseeing', 'cruise', 'vehicle', 'addon']) {
      expect(requested.has(tab)).toBe(true);
    }
  });

  it('CASE 2 — only Hotel + Flight selected → only those tabs requested', () => {
    const requested = leadRequestedTabs({
      services: [{ serviceType: 'HOTEL' }, { serviceType: 'FLIGHT' }],
    });
    expect(requested.has('flight')).toBe(true);
    expect(requested.has('hotel')).toBe(true);
    for (const tab of ['sightseeing', 'cruise', 'vehicle', 'addon']) {
      expect(requested.has(tab)).toBe(false);
    }
  });

  it('CASE 6 — Add-on selected on the Lead → addon tab requested (no missing asterisk)', () => {
    const requested = leadRequestedTabs({ services: [{ serviceType: 'MEAL' }] });
    expect(requested.has('addon')).toBe(true);
  });

  it('CASE 7 — Cruise selected on the Lead → cruise tab requested', () => {
    const requested = leadRequestedTabs({ services: [{ serviceType: 'CRUISE' }] });
    expect(requested.has('cruise')).toBe(true);
  });

  it('returns an empty set when the Lead has no services', () => {
    expect(leadRequestedTabs(undefined).size).toBe(0);
    expect(leadRequestedTabs({ services: [] }).size).toBe(0);
  });
});

describe('QuotationBuilder — hasPolicyHtml', () => {
  it('returns false for null', () => {
    expect(hasPolicyHtml(null)).toBe(false);
  });
  it('returns false for undefined', () => {
    expect(hasPolicyHtml(undefined)).toBe(false);
  });
  it('returns false for empty string', () => {
    expect(hasPolicyHtml('')).toBe(false);
  });
  it('returns false for editor-empty HTML <p></p>', () => {
    expect(hasPolicyHtml('<p></p>')).toBe(false);
  });
  it('returns false for editor-empty HTML <p><br></p>', () => {
    expect(hasPolicyHtml('<p><br></p>')).toBe(false);
  });
  it('returns false for whitespace-only stripping', () => {
    expect(hasPolicyHtml('   ')).toBe(false);
  });
  it('returns true for meaningful content', () => {
    expect(hasPolicyHtml('<p>All meals included.</p>')).toBe(true);
  });
  it('returns true for mixed empty + text', () => {
    expect(hasPolicyHtml('<p></p><p>Real content</p>')).toBe(true);
  });
});

describe('QuotationBuilder — policyValue', () => {
  it('returns version value when meaningful', () => {
    expect(policyValue('<p>Quotation text</p>', '<p>Master text</p>')).toBe(
      '<p>Quotation text</p>',
    );
  });

  it('returns master value when version is null', () => {
    expect(policyValue(null, '<p>Master text</p>')).toBe('<p>Master text</p>');
  });

  it('returns master value when version is undefined', () => {
    expect(policyValue(undefined, '<p>Master text</p>')).toBe('<p>Master text</p>');
  });

  it('returns master value when version is empty string', () => {
    expect(policyValue('', '<p>Master text</p>')).toBe('<p>Master text</p>');
  });

  it('returns master value when version is editor-empty', () => {
    expect(policyValue('<p></p>', '<p>Master text</p>')).toBe('<p>Master text</p>');
  });

  it('returns null when both values are null', () => {
    expect(policyValue(null, null)).toBeNull();
  });

  it('returns empty master when version is empty and master is empty', () => {
    // Both empty → master empty string preserved (not-false but not-meaningful).
    expect(policyValue('', '')).toBe('');
  });

  it('returns null when version empty and master null', () => {
    expect(policyValue('', null)).toBeNull();
  });
});

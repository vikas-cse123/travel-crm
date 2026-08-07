import { describe, expect, it } from 'vitest';
import { hasPolicyHtml, policyValue } from '@/pages/quotations/QuotationBuilderPage';

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

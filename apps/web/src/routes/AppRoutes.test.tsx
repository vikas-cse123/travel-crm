import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from './AppRoutes';

/**
 * Collects every `path` prop from the route table by walking the element tree.
 * AppRoutes is a pure element factory — calling it never mounts any page, so
 * no auth/fetch mocks are needed.
 */
function collectPaths(node: ReactNode, acc: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const child of node) collectPaths(child, acc);
    return acc;
  }
  if (!isValidElement(node)) return acc;
  const props = node.props as { path?: string; children?: ReactNode };
  if (typeof props.path === 'string') acc.push(props.path);
  collectPaths(props.children, acc);
  return acc;
}

// The sidebar entries for Bookings and Quotation Templates are temporarily
// hidden, but their routes must keep working when opened directly by URL.
describe('AppRoutes route table', () => {
  const paths = collectPaths((AppRoutes as () => ReactElement)());

  it('keeps the Booking routes registered', () => {
    expect(paths).toContain('/bookings');
    expect(paths).toContain('/bookings/new');
    expect(paths).toContain('/bookings/:bookingId');
    expect(paths).toContain('/quotations/:quotationId/convert-to-booking');
  });

  it('keeps the Quotation Template routes registered', () => {
    expect(paths).toContain('/quotation-templates');
    expect(paths).toContain('/quotation-templates/new');
    expect(paths).toContain('/quotation-templates/:templateId');
    expect(paths).toContain('/quotation-templates/:templateId/edit');
  });

  it('keeps the Leads route registered', () => {
    expect(paths).toContain('/queries');
  });
});

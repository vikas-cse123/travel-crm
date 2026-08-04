import { useEffect, useRef } from 'react';

/**
 * Set the browser-tab title to `title`, falling back to "Quotation" when the
 * value is empty or unavailable. The previous page title is restored on
 * unmount so unrelated pages (e.g. the CRM admin app) are never changed.
 */
export function useDocumentTitle(title: string | null | undefined): void {
  const originalRef = useRef(document.title);
  useEffect(() => {
    const original = originalRef.current;
    document.title = title?.trim() || 'Quotation';
    return () => {
      document.title = original;
    };
  }, [title]);
}

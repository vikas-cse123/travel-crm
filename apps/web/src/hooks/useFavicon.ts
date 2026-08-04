import { useEffect } from 'react';

/**
 * Point the browser-tab favicon at `url` (e.g. a company logo on a public
 * quotation page). The previous favicon is restored when `url` becomes empty or
 * on unmount, so unrelated pages are never permanently changed.
 *
 * - `url` set    → create/update the document `<link rel="icon">`.
 * - `url` empty  → keep the existing/default favicon untouched.
 * - leaving page → restore the favicon that existed before this hook ran.
 */
export function useFavicon(url: string | null | undefined): void {
  useEffect(() => {
    if (!url) return;
    const existing = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    const previousHref = existing?.getAttribute('href') ?? null;
    let link = existing;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.setAttribute('href', url);
    return () => {
      if (!link) return;
      if (existing) {
        if (previousHref === null) link.removeAttribute('href');
        else link.setAttribute('href', previousHref);
      } else {
        link.remove();
      }
    };
  }, [url]);
}

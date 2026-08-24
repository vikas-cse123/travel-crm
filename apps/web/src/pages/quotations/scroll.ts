/**
 * Centralized smooth-scroll behaviour for the public quotation weblink.
 *
 * Section headings carry `scroll-margin-top` (SectionTitle) so calling
 * `scrollIntoView({ block: 'start' })` already clears the sticky Jump To bar.
 * `prefers-reduced-motion` is respected everywhere so we never force motion on
 * a customer who has disabled it.
 */

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Smoothly scroll to a section heading by its stable anchor id. */
export function scrollToSectionId(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
}

/** Smoothly scroll the window back to the very top. */
export function scrollToTop(): void {
  window.scrollTo({
    top: 0,
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
  });
}
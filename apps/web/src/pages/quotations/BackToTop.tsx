import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { scrollToTop } from './scroll';

/** Fraction of the scrollable document the visitor must pass before showing. */
const SCROLL_THRESHOLD = 0.4;

/**
 * Floating "Back to top" button for the public quotation weblink.
 *
 * Fixed to the bottom-right, hidden until the visitor has scrolled through at
 * least 40% of the total scrollable document (scrollTop / (scrollHeight -
 * clientHeight) >= 0.4), then fades/slides in. Hides again when scrolling back
 * above the threshold. Smooth-scrolls to the top on click. Uses the quotation
 * green theme with a soft rounded-square shape and a subtle shadow. Positioning
 * is fixed, so it never causes layout shift.
 */
export function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - doc.clientHeight;
      const ratio = scrollable > 0 ? window.scrollY / scrollable : 0;
      setVisible(ratio >= SCROLL_THRESHOLD);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={scrollToTop}
      className={[
        'fixed z-40 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg transition-all duration-300',
        'right-4 bottom-4 sm:right-6 sm:bottom-6',
        'bottom-[calc(1rem+env(safe-area-inset-bottom))] sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom))]',
        'hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-xl',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      ].join(' ')}
    >
      <ArrowUp className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export type LightboxImage = { url: string; alt?: string | null };

/**
 * Shared fullscreen gallery viewer for the public quotation weblink.
 *
 * Rendered once over any gallery: dark overlay, large centered image (aspect
 * preserved via object-contain), prev/next chevrons, "2 / 5" counter, close
 * button, keyboard navigation (←/→/Esc), swipe on touch, click-outside to
 * close, and body scroll locking while open.
 */
export function QuotationLightbox({
  images,
  index,
  onClose,
  onIndexChange,
}: {
  images: LightboxImage[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const count = images.length;
  const safeIndex = Math.max(0, Math.min(index, count - 1));
  const current = images[safeIndex];

  const goTo = useCallback(
    (next: number) => {
      if (count === 0) return;
      onIndexChange((next + count) % count);
    },
    [count, onIndexChange],
  );

  // Fade-in on mount + close on Escape, lock body scroll while open.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      else if (event.key === 'ArrowLeft') goTo(safeIndex - 1);
      else if (event.key === 'ArrowRight') goTo(safeIndex + 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [onClose, goTo, safeIndex]);

  if (!current) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      onClick={onClose}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 transition-opacity duration-300 ${
        mounted ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <button
        type="button"
        aria-label="Close image viewer"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
      >
        <X className="h-6 w-6" aria-hidden="true" />
      </button>

      <figure
        onClick={(event) => event.stopPropagation()}
        className={`flex max-h-full max-w-full select-none items-center justify-center transition-transform duration-300 ${
          mounted ? 'scale-100' : 'scale-95'
        }`}
      >
        <img
          src={current.url}
          alt={current.alt?.trim() || 'Gallery image'}
          draggable={false}
          className="max-h-[80vh] max-w-full object-contain"
        />
      </figure>

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous image"
            onClick={(event) => {
              event.stopPropagation();
              goTo(safeIndex - 1);
            }}
            onTouchStart={(event) => {
              touchStartX.current = event.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              const start = touchStartX.current;
              touchStartX.current = null;
              if (start == null) return;
              const delta = (event.changedTouches[0]?.clientX ?? start) - start;
              if (Math.abs(delta) > 40) goTo(safeIndex + (delta > 0 ? -1 : 1));
            }}
            className="absolute inset-y-0 left-0 flex w-16 items-center justify-center text-white opacity-70 transition hover:opacity-100"
          >
            <ChevronLeft className="h-10 w-10 drop-shadow-md" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next image"
            onClick={(event) => {
              event.stopPropagation();
              goTo(safeIndex + 1);
            }}
            onTouchStart={(event) => {
              touchStartX.current = event.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              const start = touchStartX.current;
              touchStartX.current = null;
              if (start == null) return;
              const delta = (event.changedTouches[0]?.clientX ?? start) - start;
              if (Math.abs(delta) > 40) goTo(safeIndex + (delta > 0 ? -1 : 1));
            }}
            className="absolute inset-y-0 right-0 flex w-16 items-center justify-center text-white opacity-70 transition hover:opacity-100"
          >
            <ChevronRight className="h-10 w-10 drop-shadow-md" aria-hidden="true" />
          </button>
          <p className="absolute bottom-4 right-5 rounded-full bg-white/15 px-3 py-1 text-sm font-medium text-white">
            {safeIndex + 1} / {count}
          </p>
        </>
      )}
    </div>
  );
}
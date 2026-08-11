import { useEffect, useRef, useState } from 'react';

const FILE_INPUT_SELECTOR = 'input[type="file"]';
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'];

function acceptsImages(input: HTMLInputElement) {
  const rules = input.accept
    .split(',')
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean);
  return (
    rules.length === 0 ||
    rules.some((rule) => rule.startsWith('image/') || IMAGE_EXTENSIONS.includes(rule))
  );
}

function imageInputFromTarget(target: EventTarget | null): HTMLInputElement | null {
  if (!(target instanceof Element)) return null;
  if (target.matches(FILE_INPUT_SELECTOR) && acceptsImages(target as HTMLInputElement))
    return target as HTMLInputElement;
  const label = target.closest('label');
  const labelledInput = Array.from(
    label?.querySelectorAll<HTMLInputElement>(FILE_INPUT_SELECTOR) ?? [],
  ).find(acceptsImages);
  return labelledInput ?? null;
}

function acceptsFile(input: HTMLInputElement, file: File) {
  if (!file.type.startsWith('image/')) return false;
  const rules = input.accept
    .split(',')
    .map((rule) => rule.trim().toLowerCase())
    .filter(Boolean);
  if (rules.length === 0 || rules.includes('image/*')) return true;
  return rules.some(
    (rule) =>
      rule === file.type.toLowerCase() ||
      (rule.startsWith('.') && file.name.toLowerCase().endsWith(rule)),
  );
}

function availableImageInputs() {
  return Array.from(document.querySelectorAll<HTMLInputElement>(FILE_INPUT_SELECTOR)).filter(
    (input) => acceptsImages(input) && !input.disabled && !input.closest('[hidden]'),
  );
}

function deliverFiles(input: HTMLInputElement, files: File[]) {
  const accepted = files.filter((file) => acceptsFile(input, file));
  const selected = input.multiple ? accepted : accepted.slice(0, 1);
  if (selected.length === 0) return false;
  const transfer = new DataTransfer();
  selected.forEach((file) => transfer.items.add(file));
  try {
    input.files = transfer.files;
  } catch {
    // Test DOMs and older embedded browsers may not expose a writable FileList.
    Object.defineProperty(input, 'files', { configurable: true, value: transfer.files });
  }
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function dropSurface(input: HTMLInputElement) {
  return input.closest('label') ?? input;
}

/**
 * Adds drag/drop and clipboard-paste support to every image file input,
 * including inputs mounted later inside dialogs. The most recently hovered or
 * focused image control receives a paste; when a page has only one image
 * control, users can paste anywhere on that page.
 */
export function ImageDropPasteManager() {
  const activeInput = useRef<HTMLInputElement | null>(null);
  const activeSurface = useRef<Element | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let noticeTimer: number | undefined;
    const rememberInput = (event: Event) => {
      const input = imageInputFromTarget(event.target);
      if (input && !input.disabled) {
        activeInput.current = input;
        if (!input.title) input.title = 'Choose, drop, or paste an image';
      }
    };
    const clearDragSurface = () => {
      activeSurface.current?.removeAttribute('data-image-drop-active');
      activeSurface.current = null;
    };
    const onDragOver = (event: DragEvent) => {
      const available = availableImageInputs();
      const input =
        imageInputFromTarget(event.target) ?? (available.length === 1 ? available[0]! : null);
      const hasImage = Array.from(event.dataTransfer?.items ?? []).some(
        (item) => item.kind === 'file' && item.type.startsWith('image/'),
      );
      if (!input || input.disabled || !hasImage) return;
      event.preventDefault();
      event.dataTransfer!.dropEffect = 'copy';
      activeInput.current = input;
      const surface = dropSurface(input);
      if (activeSurface.current !== surface) clearDragSurface();
      activeSurface.current = surface;
      surface.setAttribute('data-image-drop-active', 'true');
    };
    const showNotice = (message: string) => {
      window.clearTimeout(noticeTimer);
      setNotice(message);
      noticeTimer = window.setTimeout(() => setNotice(''), 2200);
    };
    const onDrop = (event: DragEvent) => {
      const input =
        imageInputFromTarget(event.target) ?? (activeSurface.current ? activeInput.current : null);
      clearDragSurface();
      if (!input || input.disabled) return;
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      if (deliverFiles(input, files)) showNotice('Image added');
      else showNotice('This image format is not accepted here');
    };
    const onPaste = (event: ClipboardEvent) => {
      const clipboardFiles = Array.from(event.clipboardData?.files ?? []);
      const itemFiles = Array.from(event.clipboardData?.items ?? [])
        .map((item) => (item.kind === 'file' ? item.getAsFile() : null))
        .filter((file): file is File => Boolean(file));
      const images = (clipboardFiles.length ? clipboardFiles : itemFiles).filter((file) =>
        file.type.startsWith('image/'),
      );
      if (images.length === 0) return;
      const directInput = imageInputFromTarget(event.target);
      const remembered =
        activeInput.current &&
        document.contains(activeInput.current) &&
        !activeInput.current.disabled
          ? activeInput.current
          : null;
      const available = availableImageInputs();
      const input = directInput ?? remembered ?? (available.length === 1 ? available[0]! : null);
      if (!input) {
        showNotice('Point to an image upload area, then paste again');
        return;
      }
      event.preventDefault();
      if (deliverFiles(input, images)) showNotice('Clipboard image added');
      else showNotice('This clipboard image format is not accepted here');
    };

    document.addEventListener('pointerover', rememberInput, true);
    document.addEventListener('focusin', rememberInput, true);
    document.addEventListener('dragover', onDragOver, true);
    document.addEventListener('dragleave', clearDragSurface, true);
    document.addEventListener('drop', onDrop, true);
    document.addEventListener('paste', onPaste, true);
    return () => {
      window.clearTimeout(noticeTimer);
      clearDragSurface();
      document.removeEventListener('pointerover', rememberInput, true);
      document.removeEventListener('focusin', rememberInput, true);
      document.removeEventListener('dragover', onDragOver, true);
      document.removeEventListener('dragleave', clearDragSurface, true);
      document.removeEventListener('drop', onDrop, true);
      document.removeEventListener('paste', onPaste, true);
    };
  }, []);

  return notice ? (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 left-1/2 z-[100] -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg"
    >
      {notice}
    </div>
  ) : null;
}

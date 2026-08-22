import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { MasterImageMeta } from '@/features/masters/masters.api';
import { MasterImageEditor } from './MasterImageEditor';

type ImageEntity = {
  id?: string;
  hasImage: boolean;
  images?: MasterImageMeta[];
  imageFileName?: string | null;
  imageMimeType?: string | null;
  imageFileSize?: number | null;
};

type ExistingItem = {
  kind: 'existing';
  key: string;
  image: MasterImageMeta;
};

type PendingItem = {
  kind: 'pending';
  key: string;
  file: File;
  previewUrl: string;
};

type GalleryItem = ExistingItem | PendingItem;

type GalleryDraft = {
  masterId: string | undefined;
  order: string[] | null;
  pending: PendingItem[];
  removedIds: Set<string>;
  confirmed: Record<string, MasterImageMeta>;
  serverImages: MasterImageMeta[] | null;
};

type ImageUploadInput = {
  fileName: string;
  mimeType: string;
  fileSize: number;
};

type GalleryApi<TEntity extends ImageEntity, TMimeType extends string = string> = {
  approve: (
    masterId: string,
    input: Omit<ImageUploadInput, 'mimeType'> & { mimeType: TMimeType },
  ) => Promise<{ uploadUrl: string; expiresInSeconds: number }>;
  confirm: (masterId: string) => Promise<TEntity>;
  download: (
    masterId: string,
    imageId?: string,
  ) => Promise<{ url: string; expiresInSeconds: number }>;
  remove: (masterId: string, imageId?: string) => Promise<{ deleted: true }>;
  reorder: (masterId: string, imageIds: string[]) => Promise<TEntity>;
};

const legacyImageMeta = (entity?: ImageEntity): MasterImageMeta[] => {
  if (entity?.images?.length) return entity.images;
  if (!entity?.hasImage) return [];
  return [
    {
      id: 'legacy',
      fileName: entity.imageFileName ?? 'Current image',
      mimeType: entity.imageMimeType ?? 'image/jpeg',
      fileSize: entity.imageFileSize ?? 0,
      isPrimary: true,
    },
  ];
};

const existingItem = (image: MasterImageMeta): ExistingItem => ({
  kind: 'existing',
  key: `existing:${image.id}`,
  image,
});

const emptyDraft = (masterId: string | undefined): GalleryDraft => ({
  masterId,
  order: null,
  pending: [],
  removedIds: new Set(),
  confirmed: {},
  serverImages: null,
});

const imageSignature = (images: MasterImageMeta[]) => images.map((image) => image.id).join('|');

const sameIds = (left: Set<string>, right: Set<string>) =>
  left.size === right.size && [...left].every((id) => right.has(id));

const imageName = (item: GalleryItem) =>
  item.kind === 'pending' ? item.file.name : item.image.fileName;

const revokePreview = (item: GalleryItem) => {
  if (item.kind === 'pending' && item.previewUrl) URL.revokeObjectURL?.(item.previewUrl);
};

type LightboxImage = {
  id: string;
  src: string;
  alt: string;
  isPrimary: boolean;
};

function MasterImageLightbox({
  images,
  index,
  onClose,
  onPrev,
  onNext,
}: {
  images: LightboxImage[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const current = images[index];
  const hasMultiple = images.length > 1;
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && hasMultiple) onPrev();
      else if (e.key === 'ArrowRight' && hasMultiple) onNext();
    };
    window.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, onPrev, onNext, hasMultiple]);

  if (!current) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={handleBackdropClick}
    >
      <button
        type="button"
        aria-label="Close preview"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-black/60 p-2 text-white hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white"
      >
        <X className="h-5 w-5" />
      </button>
      {hasMultiple && (
        <>
          <button
            type="button"
            aria-label="Previous image"
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-3 text-white hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white md:left-4"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            aria-label="Next image"
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/60 p-3 text-white hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white md:right-4"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}
      <div
        className="relative flex max-h-[85vh] max-w-[90vw] flex-col items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={current.src}
          alt={current.alt}
          className="max-h-[80vh] max-w-[90vw] object-contain"
          decoding="async"
        />
        <div className="flex items-center gap-2 text-sm text-white/90">
          {current.isPrimary && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold">
              Primary
            </span>
          )}
          {hasMultiple && (
            <span className="text-xs text-white/70">
              {index + 1} / {images.length}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export type MasterImageGalleryController<TEntity extends ImageEntity> = {
  items: GalleryItem[];
  urls: Record<string, string>;
  error: string;
  isBusy: boolean;
  pendingCount: number;
  addFiles: (files: FileList | File[]) => void;
  move: (index: number, direction: -1 | 1) => void;
  remove: (item: GalleryItem) => Promise<void>;
  beginEdit: (item: PendingItem) => void;
  cancelEdit: () => void;
  applyEdit: (file: File) => void;
  editingItem: PendingItem | null;
  persist: (masterId: string) => Promise<TEntity | null>;
  clearError: () => void;
};

export function useMasterImageGallery<TEntity extends ImageEntity, TMimeType extends string>({
  masterId,
  entity,
  allowedMimeTypes,
  maxSizeMb,
  api,
  onExistingChange,
}: {
  masterId: string | undefined;
  entity: TEntity | undefined;
  allowedMimeTypes: readonly TMimeType[];
  maxSizeMb: number;
  api: GalleryApi<TEntity, TMimeType>;
  onExistingChange: (() => Promise<unknown> | unknown) | undefined;
}): MasterImageGalleryController<TEntity> {
  const entityImages = useMemo(() => {
    if (entity === undefined) return undefined;
    if (masterId && entity.id && entity.id !== masterId) return undefined;
    return legacyImageMeta(entity);
  }, [entity, masterId]);
  const persistedRef = useRef<{ masterId: string | undefined; images: MasterImageMeta[] }>({
    masterId,
    images: entityImages ?? [],
  });
  if (persistedRef.current.masterId !== masterId) {
    persistedRef.current = { masterId, images: entityImages ?? [] };
  } else if (entityImages !== undefined) {
    persistedRef.current.images = entityImages;
  }

  const [draft, setDraft] = useState<GalleryDraft>(() => emptyDraft(masterId));
  const activeDraft = draft.masterId === masterId ? draft : emptyDraft(masterId);
  const persistedImages = activeDraft.serverImages ?? persistedRef.current.images;
  const entitySignature = entityImages === undefined ? undefined : imageSignature(entityImages);
  const sequence = useRef(0);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const urlsRef = useRef<Record<string, string>>({});
  const urlsMasterId = useRef(masterId);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [editingKey, setEditingKey] = useState('');

  const existingById = new Map(persistedImages.map((image) => [image.id, image]));
  Object.values(activeDraft.confirmed).forEach((image) => {
    if (!existingById.has(image.id)) existingById.set(image.id, image);
  });
  const naturalItems: GalleryItem[] = [
    ...[...existingById.values()]
      .filter((image) => !activeDraft.removedIds.has(image.id))
      .map(existingItem),
    ...activeDraft.pending,
  ];
  const naturalByKey = new Map(naturalItems.map((item) => [item.key, item]));
  const locallyOrderedKeys = new Set(activeDraft.order ?? []);
  const orderedKeys = activeDraft.order
    ? [
        ...activeDraft.order.filter((key) => naturalByKey.has(key)),
        ...naturalItems.map((item) => item.key).filter((key) => !locallyOrderedKeys.has(key)),
      ]
    : naturalItems.map((item) => item.key);
  const items = orderedKeys.flatMap((key) => {
    const item = naturalByKey.get(key);
    return item ? [item] : [];
  });
  const itemsRef = useRef<GalleryItem[]>(items);
  itemsRef.current = items;

  const updateDraft = (update: (current: GalleryDraft) => GalleryDraft) => {
    setDraft((current) => update(current.masterId === masterId ? current : emptyDraft(masterId)));
  };

  useEffect(() => {
    setDraft((current) => {
      if (current.masterId === masterId) return current;
      current.pending.forEach(revokePreview);
      return emptyDraft(masterId);
    });
    setEditingKey('');
    setError('');
  }, [masterId]);

  useEffect(() => {
    if (entityImages === undefined) return;
    const entityIds = new Set(entityImages.map((image) => image.id));
    setDraft((current) => {
      if (current.masterId !== masterId) return current;
      const removedIds = new Set([...current.removedIds].filter((id) => entityIds.has(id)));
      const serverImages =
        current.serverImages && imageSignature(current.serverImages) === entitySignature
          ? null
          : current.serverImages;
      if (sameIds(removedIds, current.removedIds) && serverImages === current.serverImages)
        return current;
      return { ...current, removedIds, serverImages };
    });
  }, [entityImages, entitySignature, masterId]);

  const existingIds = items
    .filter((item): item is ExistingItem => item.kind === 'existing')
    .map((item) => item.image.id);
  const existingSignature = existingIds.join('|');

  useEffect(() => {
    if (urlsMasterId.current !== masterId) {
      urlsMasterId.current = masterId;
      urlsRef.current = {};
    }
    const wantedIds = new Set(existingIds);
    const retained = Object.fromEntries(
      Object.entries(urlsRef.current).filter(([imageId]) => wantedIds.has(imageId)),
    );
    urlsRef.current = retained;
    setUrls(retained);
    if (!masterId || existingIds.length === 0) return;

    const missingIds = existingIds.filter((imageId) => !urlsRef.current[imageId]);
    if (!missingIds.length) return;
    let active = true;
    const load = async () => {
      const entries = await Promise.all(
        missingIds.map(async (imageId) => {
          try {
            const result = await api.download(masterId, imageId === 'legacy' ? undefined : imageId);
            return [imageId, result.url] as const;
          } catch {
            return [imageId, ''] as const;
          }
        }),
      );
      if (!active || urlsMasterId.current !== masterId) return;
      setUrls((current) => {
        const next = Object.fromEntries(
          Object.entries(current).filter(([imageId]) => wantedIds.has(imageId)),
        );
        entries.forEach(([imageId, url]) => {
          if (wantedIds.has(imageId)) next[imageId] = url;
        });
        urlsRef.current = next;
        return next;
      });
    };
    void load();
    return () => {
      active = false;
    };
    // The joined ID signature is the stable dependency for the ordered image set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.download, existingSignature, masterId]);

  useEffect(
    () => () => {
      itemsRef.current.forEach(revokePreview);
    },
    [],
  );

  const addFiles = (files: FileList | File[]) => {
    setError('');
    const accepted: PendingItem[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(files)) {
      if (!allowedMimeTypes.includes(file.type as TMimeType)) {
        rejected.push(`${file.name}: unsupported format`);
        continue;
      }
      if (file.size > maxSizeMb * 1024 * 1024) {
        rejected.push(`${file.name}: larger than ${maxSizeMb} MB`);
        continue;
      }
      const previewUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '';
      accepted.push({
        kind: 'pending',
        key: `pending:${Date.now()}:${sequence.current++}`,
        file,
        previewUrl,
      });
    }
    if (accepted.length)
      updateDraft((current) => ({
        ...current,
        pending: [...current.pending, ...accepted],
        order: current.order ? [...current.order, ...accepted.map((item) => item.key)] : null,
      }));
    if (rejected.length) setError(rejected.join(' '));
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    updateDraft((current) => {
      const order = items.map((item) => item.key);
      [order[index], order[target]] = [order[target]!, order[index]!];
      return { ...current, order };
    });
  };

  const remove = async (item: GalleryItem) => {
    setError('');
    if (item.kind === 'pending') {
      revokePreview(item);
      updateDraft((current) => ({
        ...current,
        pending: current.pending.filter((candidate) => candidate.key !== item.key),
        order: current.order?.filter((key) => key !== item.key) ?? null,
      }));
      if (editingKey === item.key) setEditingKey('');
      return;
    }
    if (!masterId) return;
    if (!window.confirm(`Remove ${item.image.fileName}?`)) return;
    setBusyKey(item.key);
    try {
      await api.remove(masterId, item.image.id);
      updateDraft((current) => ({
        ...current,
        removedIds: new Set(current.removedIds).add(item.image.id),
        order: (current.order ?? items.map((candidate) => candidate.key)).filter(
          (key) => key !== item.key,
        ),
      }));
      setUrls((current) => {
        const next = { ...current };
        delete next[item.image.id];
        urlsRef.current = next;
        return next;
      });
      await onExistingChange?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The image could not be removed.');
    } finally {
      setBusyKey('');
    }
  };

  const editingItem =
    items.find((item): item is PendingItem => item.kind === 'pending' && item.key === editingKey) ??
    null;

  const applyEdit = (file: File) => {
    if (!editingItem) return;
    if (file.size > maxSizeMb * 1024 * 1024) {
      setError(`Edited image must be ${maxSizeMb} MB or smaller.`);
      return;
    }
    const previewUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : '';
    revokePreview(editingItem);
    updateDraft((current) => ({
      ...current,
      pending: current.pending.map((item) =>
        item.key === editingItem.key ? { ...item, file, previewUrl } : item,
      ),
    }));
    setEditingKey('');
  };

  const persist = async (id: string): Promise<TEntity | null> => {
    setError('');
    setBusyKey('persist');
    const snapshot = [...itemsRef.current];
    let working = snapshot;
    const pending = snapshot.filter((item): item is PendingItem => item.kind === 'pending');
    const assignedIds = new Map<string, string>();
    const knownIds = new Set(
      snapshot
        .filter((item): item is ExistingItem => item.kind === 'existing')
        .map((item) => item.image.id),
    );
    let latest: TEntity | null = null;
    try {
      for (const item of pending) {
        const approval = await api.approve(id, {
          fileName: item.file.name,
          mimeType: item.file.type as TMimeType,
          fileSize: item.file.size,
        });
        if (!approval.uploadUrl.startsWith('http')) {
          throw new Error(
            'Local memory storage has no browser upload transport. Configure S3 to upload images.',
          );
        }
        const response = await fetch(approval.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': item.file.type },
          body: item.file,
        });
        if (!response.ok) throw new Error(`The upload failed for ${item.file.name}.`);
        latest = await api.confirm(id);
        const appended = legacyImageMeta(latest).find((image) => !knownIds.has(image.id));
        if (!appended) throw new Error(`The uploaded image ${item.file.name} was not confirmed.`);
        assignedIds.set(item.key, appended.id);
        knownIds.add(appended.id);
        revokePreview(item);
        working = working.map((candidate) =>
          candidate.key === item.key ? existingItem(appended) : candidate,
        );
        updateDraft((current) => ({
          ...current,
          pending: current.pending.filter((candidate) => candidate.key !== item.key),
          confirmed: { ...current.confirmed, [appended.id]: appended },
          order: (current.order ?? snapshot.map((candidate) => candidate.key)).map((key) =>
            key === item.key ? existingItem(appended).key : key,
          ),
        }));
      }

      const orderedIds = working.flatMap((item) => {
        if (item.kind === 'existing') return [item.image.id];
        const assigned = assignedIds.get(item.key);
        return assigned ? [assigned] : [];
      });
      if (orderedIds.length) latest = await api.reorder(id, orderedIds);
      else if (!pending.length) latest = (entity as TEntity | null) ?? null;

      working.forEach(revokePreview);
      const finalImages = latest ? legacyImageMeta(latest) : [];
      if (latest) {
        if (masterId === id) persistedRef.current = { masterId, images: finalImages };
        updateDraft((current) => ({
          ...current,
          order: null,
          pending: [],
          removedIds: new Set(),
          confirmed: {},
          serverImages: finalImages,
        }));
        await onExistingChange?.();
      }
      setEditingKey('');
      return latest;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'The images could not be saved.';
      setError(message);
      throw cause;
    } finally {
      setBusyKey('');
    }
  };

  return {
    items,
    urls,
    error,
    isBusy: Boolean(busyKey),
    pendingCount: items.filter((item) => item.kind === 'pending').length,
    addFiles,
    move,
    remove,
    beginEdit: (item) => setEditingKey(item.key),
    cancelEdit: () => setEditingKey(''),
    applyEdit,
    editingItem,
    persist,
    clearError: () => setError(''),
  };
}

export function MasterImageGalleryField<TEntity extends ImageEntity>({
  label,
  controller,
  accept,
  maxSizeMb,
  renderEditor,
}: {
  label: string;
  controller: MasterImageGalleryController<TEntity>;
  accept: string;
  maxSizeMb: number;
  renderEditor?: (input: {
    file: File;
    imageUrl: string;
    onCancel: () => void;
    onApply: (file: File) => void;
  }) => React.ReactNode;
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightboxImages = useMemo<LightboxImage[]>(
    () =>
      controller.items
        .map((item, idx) => {
          const src =
            item.kind === 'pending' ? item.previewUrl : (controller.urls[item.image.id] ?? '');
          if (!src) return null;
          return { id: item.key, src, alt: imageName(item), isPrimary: idx === 0 };
        })
        .filter((v): v is LightboxImage => Boolean(v)),
    [controller.items, controller.urls],
  );
  const openLightbox = useCallback(
    (itemKey: string) => {
      const idx = lightboxImages.findIndex((img) => img.id === itemKey);
      if (idx >= 0) setLightboxIndex(idx);
    },
    [lightboxImages],
  );
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const prevLightbox = useCallback(() => {
    if (lightboxIndex === null) return;
    setLightboxIndex((prev) => {
      if (prev === null) return prev;
      return (prev - 1 + lightboxImages.length) % lightboxImages.length;
    });
  }, [lightboxIndex, lightboxImages.length]);
  const nextLightbox = useCallback(() => {
    if (lightboxIndex === null) return;
    setLightboxIndex((prev) => {
      if (prev === null) return prev;
      return (prev + 1) % lightboxImages.length;
    });
  }, [lightboxIndex, lightboxImages.length]);

  return (
    <div className="space-y-3">
      <div>
        <span className="block text-sm font-medium text-slate-700">{label}</span>
        <label className="mt-1 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-600 hover:bg-slate-50">
          <ImagePlus className="h-5 w-5" />
          Add Images
          <input
            className="sr-only"
            type="file"
            multiple
            accept={accept}
            aria-label={`Add ${label.toLowerCase()}`}
            onChange={(event) => {
              if (event.target.files?.length) controller.addFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </label>
        <p className="mt-1 text-xs text-slate-500">
          Select one or more images. The first image is the primary image. Maximum {maxSizeMb} MB
          per image.
        </p>
      </div>

      {controller.error && (
        <p role="alert" className="text-xs font-medium text-red-600">
          {controller.error}
        </p>
      )}

      {controller.items.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {controller.items.map((item, index) => {
            const src =
              item.kind === 'pending' ? item.previewUrl : (controller.urls[item.image.id] ?? '');
            const name = imageName(item);
            return (
              <div key={item.key} className="overflow-hidden rounded-lg border bg-slate-50">
                <div
                  className={`relative flex h-32 items-center justify-center bg-slate-100 ${src ? 'cursor-pointer' : ''}`}
                  role={src ? 'button' : undefined}
                  tabIndex={src ? 0 : undefined}
                  aria-label={src ? `Preview ${name}` : undefined}
                  onClick={() => {
                    if (src) openLightbox(item.key);
                  }}
                  onKeyDown={(e) => {
                    if (src && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      openLightbox(item.key);
                    }
                  }}
                >
                  {src ? (
                    <img
                      src={src}
                      alt={name}
                      className="max-h-full max-w-full object-contain"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        if (item.kind !== 'existing') return;
                        // For persisted S3 images, a single load failure must not break the field – fallback to placeholder for that tile.
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                        const placeholder = (e.currentTarget as HTMLImageElement)
                          .nextElementSibling as HTMLElement | null;
                        if (placeholder) {
                          placeholder.classList.remove('hidden');
                          placeholder.classList.add('flex');
                        }
                      }}
                    />
                  ) : null}
                  {/* Fallback shown only when src missing or onError hides the img */}
                  <div
                    className={`${src ? 'hidden' : 'flex'} h-full w-full items-center justify-center`}
                  >
                    <ImagePlus className="h-8 w-8 text-slate-300" />
                  </div>
                  {index === 0 && (
                    <span className="absolute left-2 top-2 rounded-full bg-brand-700 px-2 py-1 text-[10px] font-semibold text-white">
                      Primary
                    </span>
                  )}
                  {item.kind === 'pending' && (
                    <span className="absolute right-2 top-2 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800">
                      New
                    </span>
                  )}
                </div>
                <div className="space-y-2 p-2">
                  <p className="truncate text-xs text-slate-600" title={name}>
                    {name}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={index === 0 || controller.isBusy}
                      aria-label={`Move ${name} left`}
                      title="Move left"
                      onClick={() => controller.move(index, -1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={index === controller.items.length - 1 || controller.isBusy}
                      aria-label={`Move ${name} right`}
                      title="Move right"
                      onClick={() => controller.move(index, 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    {item.kind === 'pending' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={controller.isBusy}
                        aria-label={`Edit ${name}`}
                        title="Edit image"
                        onClick={() => controller.beginEdit(item)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      disabled={controller.isBusy}
                      aria-label={`Remove ${name}`}
                      title="Remove image"
                      onClick={() => void controller.remove(item)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {controller.editingItem?.previewUrl &&
        (renderEditor ? (
          renderEditor({
            file: controller.editingItem.file,
            imageUrl: controller.editingItem.previewUrl,
            onCancel: controller.cancelEdit,
            onApply: controller.applyEdit,
          })
        ) : (
          <MasterImageEditor
            file={controller.editingItem.file}
            imageUrl={controller.editingItem.previewUrl}
            isOpen
            title={`Edit ${controller.editingItem.file.name}`}
            onCancel={controller.cancelEdit}
            onApply={controller.applyEdit}
          />
        ))}
      {lightboxIndex !== null && (
        <MasterImageLightbox
          images={lightboxImages}
          index={lightboxIndex}
          onClose={closeLightbox}
          onPrev={prevLightbox}
          onNext={nextLightbox}
        />
      )}
    </div>
  );
}

export function MasterImageGalleryView({
  masterId,
  entity,
  download,
  alt,
  className = '',
}: {
  masterId: string;
  entity: ImageEntity;
  download: GalleryApi<ImageEntity>['download'];
  alt: string;
  className?: string;
}) {
  const images = useMemo(() => legacyImageMeta(entity), [entity]);
  const signature = images.map((image) => image.id).join('|');
  const [urls, setUrls] = useState<Record<string, string>>({});
  const urlsRef = useRef<Record<string, string>>({});
  const urlsMasterId = useRef(masterId);
  const [failedIds, setFailedIds] = useState<Set<string>>(() => new Set());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightboxImages = useMemo<LightboxImage[]>(
    () =>
      images
        .map((image, idx) => {
          const src = urls[image.id] ?? '';
          if (!src || failedIds.has(image.id)) return null;
          return {
            id: image.id,
            src,
            alt: `${alt}${images.length > 1 ? ` ${idx + 1}` : ''}`,
            isPrimary: idx === 0,
          };
        })
        .filter((v): v is LightboxImage => Boolean(v)),
    [images, urls, alt, failedIds],
  );
  const openViewLightbox = useCallback(
    (imageId: string) => {
      const idx = lightboxImages.findIndex((img) => img.id === imageId);
      if (idx >= 0) setLightboxIndex(idx);
    },
    [lightboxImages],
  );
  const closeViewLightbox = useCallback(() => setLightboxIndex(null), []);
  const prevViewLightbox = useCallback(() => {
    setLightboxIndex((prev) => {
      if (prev === null) return prev;
      return (prev - 1 + lightboxImages.length) % lightboxImages.length;
    });
  }, [lightboxImages.length]);
  const nextViewLightbox = useCallback(() => {
    setLightboxIndex((prev) => {
      if (prev === null) return prev;
      return (prev + 1) % lightboxImages.length;
    });
  }, [lightboxImages.length]);

  useEffect(() => {
    if (urlsMasterId.current !== masterId) {
      urlsMasterId.current = masterId;
      urlsRef.current = {};
    }
    const wantedIds = new Set(images.map((image) => image.id));
    const retained = Object.fromEntries(
      Object.entries(urlsRef.current).filter(([imageId]) => wantedIds.has(imageId)),
    );
    urlsRef.current = retained;
    setUrls(retained);
    setFailedIds((current) => new Set([...current].filter((imageId) => wantedIds.has(imageId))));
    if (!images.length) return;

    const missing = images.filter((image) => !urlsRef.current[image.id]);
    if (!missing.length) return;
    let active = true;
    void Promise.all(
      missing.map(async (image) => {
        try {
          const result = await download(masterId, image.id === 'legacy' ? undefined : image.id);
          return [image.id, result.url] as const;
        } catch {
          return [image.id, ''] as const;
        }
      }),
    ).then((entries) => {
      if (!active || urlsMasterId.current !== masterId) return;
      setUrls((current) => {
        const next = Object.fromEntries(
          Object.entries(current).filter(([imageId]) => wantedIds.has(imageId)),
        );
        entries.forEach(([imageId, url]) => {
          if (wantedIds.has(imageId)) next[imageId] = url;
        });
        urlsRef.current = next;
        return next;
      });
    });
    return () => {
      active = false;
    };
    // The joined ID signature is the stable dependency for the ordered image set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [download, masterId, signature]);

  if (!images.length) return null;

  return (
    <div className={`grid gap-2 ${images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} ${className}`}>
      {images.map((image, index) => {
        const url = urls[image.id];
        const isFailed = failedIds.has(image.id) || !url;
        if (isFailed) {
          // Single failed image must not break the whole gallery – show placeholder for that tile only.
          if (!url) {
            return (
              <div
                key={image.id}
                className="flex h-40 items-center justify-center rounded-lg border bg-slate-50"
              >
                <ImagePlus className="h-8 w-8 text-slate-300" />
              </div>
            );
          }
          return (
            <figure
              key={image.id}
              className="relative flex h-40 items-center justify-center overflow-hidden rounded-lg border bg-slate-50"
            >
              <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center">
                <ImagePlus className="h-8 w-8 text-slate-300" />
                <span className="line-clamp-2 text-xs text-slate-500">{image.fileName}</span>
              </div>
              {index === 0 && images.length > 1 && (
                <figcaption className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-white">
                  Primary
                </figcaption>
              )}
            </figure>
          );
        }
        return (
          <figure
            key={image.id}
            className="relative flex h-40 cursor-pointer items-center justify-center overflow-hidden rounded-lg border bg-slate-50"
            role="button"
            tabIndex={0}
            aria-label={`Preview ${alt}${images.length > 1 ? ` ${index + 1}` : ''}`}
            onClick={() => openViewLightbox(image.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openViewLightbox(image.id);
              }
            }}
          >
            <img
              src={url}
              alt={`${alt}${images.length > 1 ? ` ${index + 1}` : ''}`}
              className="max-h-full max-w-full object-contain"
              loading="lazy"
              decoding="async"
              onError={() =>
                setFailedIds((prev) => {
                  if (prev.has(image.id)) return prev;
                  const next = new Set(prev);
                  next.add(image.id);
                  return next;
                })
              }
            />
            {index === 0 && images.length > 1 && (
              <figcaption className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-white">
                Primary
              </figcaption>
            )}
          </figure>
        );
      })}
      {lightboxIndex !== null && (
        <MasterImageLightbox
          images={lightboxImages}
          index={lightboxIndex}
          onClose={closeViewLightbox}
          onPrev={prevViewLightbox}
          onNext={nextViewLightbox}
        />
      )}
    </div>
  );
}

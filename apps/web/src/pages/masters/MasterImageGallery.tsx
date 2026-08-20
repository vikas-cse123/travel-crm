import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ImagePlus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { MasterImageMeta } from '@/features/masters/masters.api';
import { MasterImageEditor } from './MasterImageEditor';

type ImageEntity = {
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

const imageName = (item: GalleryItem) =>
  item.kind === 'pending' ? item.file.name : item.image.fileName;

const revokePreview = (item: GalleryItem) => {
  if (item.kind === 'pending' && item.previewUrl) URL.revokeObjectURL?.(item.previewUrl);
};

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
  const persistedImages = useMemo(() => legacyImageMeta(entity), [entity]);
  const persistedSignature = persistedImages.map((image) => image.id).join('|');
  const [items, setItems] = useState<GalleryItem[]>([]);
  const itemsRef = useRef<GalleryItem[]>([]);
  const activeMasterId = useRef(masterId);
  const sequence = useRef(0);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [editingKey, setEditingKey] = useState('');

  const setGalleryItems = (next: GalleryItem[] | ((current: GalleryItem[]) => GalleryItem[])) => {
    setItems((current) => {
      const value = typeof next === 'function' ? next(current) : next;
      itemsRef.current = value;
      return value;
    });
  };

  useEffect(() => {
    const fresh = persistedImages.map(existingItem);
    if (activeMasterId.current !== masterId) {
      itemsRef.current.forEach(revokePreview);
      activeMasterId.current = masterId;
      setGalleryItems(fresh);
      setUrls({});
      setEditingKey('');
      setError('');
      return;
    }
    const byId = new Map(fresh.map((item) => [item.image.id, item]));
    setGalleryItems((current) => {
      const merged: GalleryItem[] = [];
      for (const item of current) {
        if (item.kind === 'pending') {
          merged.push(item);
          continue;
        }
        const updated = byId.get(item.image.id);
        if (!updated) continue;
        byId.delete(item.image.id);
        merged.push(updated);
      }
      return [...merged, ...byId.values()];
    });
    // The ID signature deliberately ignores fresh object identities from query refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterId, persistedSignature]);

  const existingIds = items
    .filter((item): item is ExistingItem => item.kind === 'existing')
    .map((item) => item.image.id);
  const existingSignature = existingIds.join('|');

  useEffect(() => {
    if (!masterId || existingIds.length === 0) {
      setUrls({});
      return;
    }
    let active = true;
    const load = async () => {
      const entries = await Promise.all(
        existingIds.map(async (imageId) => {
          try {
            const result = await api.download(masterId, imageId === 'legacy' ? undefined : imageId);
            return [imageId, result.url] as const;
          } catch {
            return [imageId, ''] as const;
          }
        }),
      );
      if (active) setUrls(Object.fromEntries(entries));
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
    if (accepted.length) setGalleryItems((current) => [...current, ...accepted]);
    if (rejected.length) setError(rejected.join(' '));
  };

  const move = (index: number, direction: -1 | 1) => {
    setGalleryItems((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const remove = async (item: GalleryItem) => {
    setError('');
    if (item.kind === 'pending') {
      revokePreview(item);
      setGalleryItems((current) => current.filter((candidate) => candidate.key !== item.key));
      if (editingKey === item.key) setEditingKey('');
      return;
    }
    if (!masterId) return;
    if (!window.confirm(`Remove ${item.image.fileName}?`)) return;
    setBusyKey(item.key);
    try {
      await api.remove(masterId, item.image.id);
      setGalleryItems((current) => current.filter((candidate) => candidate.key !== item.key));
      setUrls((current) => {
        const next = { ...current };
        delete next[item.image.id];
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
    setGalleryItems((current) =>
      current.map((item) =>
        item.key === editingItem.key && item.kind === 'pending'
          ? { ...item, file, previewUrl }
          : item,
      ),
    );
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
    let latest: TEntity | null = entity ?? null;
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
        setGalleryItems(working);
      }

      const orderedIds = working.flatMap((item) => {
        if (item.kind === 'existing') return [item.image.id];
        const assigned = assignedIds.get(item.key);
        return assigned ? [assigned] : [];
      });
      if (orderedIds.length) latest = await api.reorder(id, orderedIds);

      working.forEach(revokePreview);
      const finalImages = latest ? legacyImageMeta(latest) : [];
      setGalleryItems(finalImages.map(existingItem));
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
                <div className="relative flex h-32 items-center justify-center bg-slate-100">
                  {src ? (
                    <img src={src} alt={name} className="h-full w-full object-cover" />
                  ) : (
                    <ImagePlus className="h-8 w-8 text-slate-300" />
                  )}
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

  useEffect(() => {
    let active = true;
    if (!images.length) {
      setUrls({});
      return;
    }
    void Promise.all(
      images.map(async (image) => {
        try {
          const result = await download(masterId, image.id === 'legacy' ? undefined : image.id);
          return [image.id, result.url] as const;
        } catch {
          return [image.id, ''] as const;
        }
      }),
    ).then((entries) => {
      if (active) setUrls(Object.fromEntries(entries));
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
      {images.map((image, index) =>
        urls[image.id] ? (
          <figure key={image.id} className="relative overflow-hidden rounded-lg border bg-slate-50">
            <img
              src={urls[image.id]}
              alt={`${alt}${images.length > 1 ? ` ${index + 1}` : ''}`}
              className="h-40 w-full object-cover"
            />
            {index === 0 && images.length > 1 && (
              <figcaption className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-semibold text-white">
                Primary
              </figcaption>
            )}
          </figure>
        ) : (
          <div
            key={image.id}
            className="flex h-40 items-center justify-center rounded-lg border bg-slate-50"
          >
            <ImagePlus className="h-8 w-8 text-slate-300" />
          </div>
        ),
      )}
    </div>
  );
}

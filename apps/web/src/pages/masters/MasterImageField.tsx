import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * The image control shared by the Cruise and Vehicle forms.
 *
 * The reference CRM shows the same block on both — file picker, size/format
 * hint, and a royalty-free disclaimer — so it lives in one place rather than
 * being copied into each form.
 */
export function MasterImageField({
  label,
  accept,
  maxSizeMb,
  error,
  hasExisting,
  editing,
  onSelect,
  onDelete,
}: {
  label: string;
  accept: string;
  maxSizeMb: number;
  error: string;
  hasExisting: boolean;
  editing: boolean;
  onSelect: (file?: File) => void;
  onDelete?: () => void;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">
        {label}
        <input
          type="file"
          accept={accept}
          aria-label={label}
          onChange={(event) => onSelect(event.target.files?.[0])}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm"
        />
      </label>
      <p className="text-xs text-slate-500">
        {editing ? 'Leave empty to keep the current image. ' : ''}
        Recommended 800×600 pixels. Max file size: {maxSizeMb} MB. Allowed formats: JPG, JPEG, PNG,
        WebP, GIF.
      </p>
      <p className="text-xs text-amber-700">
        Upload only royalty-free or owned images. Interscale is not liable for copyright issues.
      </p>
      {error && (
        <p role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      )}
      {editing && hasExisting && onDelete && (
        <Button size="sm" variant="danger" onClick={onDelete}>
          <Trash2 className="h-4 w-4" /> Delete image
        </Button>
      )}
    </div>
  );
}

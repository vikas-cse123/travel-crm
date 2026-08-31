import { useEffect, useId, useRef } from 'react';
import {
  AlignLeft,
  Bold,
  Code2,
  Eraser,
  Globe2,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  Underline,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { SETTINGS_CURRENCIES } from '@interscale/shared';
import { cn } from '@/utils/cn';

export const fieldClass =
  'mt-1 w-full rounded-lg border border-slate-300 bg-card px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

/** Narrow currency select used beside master price fields. Defaults to INR. */
export function CurrencySelect({
  value,
  onChange,
  className,
  'aria-label': ariaLabel,
}: {
  value: string;
  onChange: (currency: string) => void;
  className?: string;
  'aria-label'?: string;
}) {
  const normalized = value?.trim().toUpperCase() || 'INR';
  const options = (SETTINGS_CURRENCIES as readonly string[]).includes(normalized)
    ? SETTINGS_CURRENCIES
    : ([normalized, ...SETTINGS_CURRENCIES] as const);
  return (
    <select
      className={cn(fieldClass, 'w-auto', className)}
      value={normalized}
      aria-label={ariaLabel ?? 'Currency'}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((code) => (
        <option key={code} value={code}>
          {code}
        </option>
      ))}
    </select>
  );
}

const masterDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

export function formatMasterDate(value: string | number | Date | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return masterDateFormatter.format(date);
}

/** Shared confirmation copy for hiding a global record for one company. */
export const HIDE_GLOBAL_CONFIRM =
  'Hide this global record?\n\nIt will be hidden only for your company. Other companies will continue to see it. Existing records already using it will not be changed.';

export function Breadcrumbs({ current }: { current: string }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
      <Link to="/dashboard" className="hover:text-brand-700">
        Home
      </Link>
      <span className="mx-2">/</span>
      <span>Masters</span>
      <span className="mx-2">/</span>
      <span className="font-medium text-slate-800">{current}</span>
    </nav>
  );
}

export function MasterHeader({
  title,
  description,
  current,
  action,
}: {
  title: string;
  description?: string;
  current: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Breadcrumbs current={current} />
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </header>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const style =
    value === 'ACTIVE' || value === 'DOMESTIC'
      ? 'bg-emerald-100 text-emerald-800'
      : value === 'INTERNATIONAL'
        ? 'bg-amber-100 text-amber-800'
        : value === 'ARCHIVED'
          ? 'bg-slate-200 text-slate-600'
          : 'bg-blue-100 text-blue-800';
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>
      {value.replaceAll('_', ' ')}
    </span>
  );
}

/**
 * Marks a record owned by the System Global Masters company. It is visible to
 * every tenant, and tenants can only hide it — never edit or archive it.
 */
export function GlobalBadge({ withTooltip = true }: { withTooltip?: boolean }) {
  const label = 'Global master record shared with every company';
  return (
    <span
      title={withTooltip ? label : undefined}
      aria-label={label}
      className="ml-2 inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-indigo-700"
    >
      <Globe2 className="h-3 w-3" aria-hidden="true" />
      Global
    </span>
  );
}

/** Shared pagination footer (also used by the Leads table). */
export { Pagination } from '@/components/ui/Pagination';

/** Escape plain text and preserve line breaks as <br> so values stored as
 *  plain text (e.g. Excel imports) display their original line structure. */
function plainTextToHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n|\r|\n/g, '<br>');
}

export function RichTextEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const editor = useRef<HTMLDivElement>(null);
  const labelId = useId();
  useEffect(() => {
    if (!editor.current) return;
    const html = value.includes('<') ? value : plainTextToHtml(value);
    if (editor.current.innerHTML !== html) editor.current.innerHTML = html;
  }, [value]);
  const command = (name: string, argument?: string) => {
    editor.current?.focus();
    document.execCommand(name, false, argument);
    onChange(editor.current?.innerHTML ?? '');
  };
  const resetFormatting = () => {
    editor.current?.focus();
    document.execCommand('removeFormat');
    document.execCommand('foreColor', false, '#334155');
    document.execCommand('hiliteColor', false, 'transparent');
    document.execCommand('backColor', false, 'transparent');
    onChange(editor.current?.innerHTML ?? '');
  };
  const buttonClass = 'rounded p-1.5 hover:bg-card';
  const keepEditorSelection = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };
  return (
    <div className="block text-sm font-medium text-slate-700">
      <span id={labelId}>{label}</span>
      <div className="mt-1 overflow-hidden rounded-lg border border-slate-300 bg-card focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
        <div className="flex flex-wrap items-center gap-1 border-b bg-slate-50 p-1.5">
          <select
            className="h-8 rounded border border-slate-200 bg-card px-2 text-sm font-medium"
            aria-label={`${label} text style`}
            defaultValue="p"
            onChange={(event) => command('formatBlock', event.target.value)}
          >
            <option value="p">Normal</option>
            <option value="h2">Heading</option>
            <option value="h3">Subheading</option>
          </select>
          <button
            type="button"
            className={buttonClass}
            aria-label={`${label} bold`}
            onMouseDown={keepEditorSelection}
            onClick={() => command('bold')}
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={buttonClass}
            aria-label={`${label} italic`}
            onMouseDown={keepEditorSelection}
            onClick={() => command('italic')}
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={buttonClass}
            aria-label={`${label} underline`}
            onMouseDown={keepEditorSelection}
            onClick={() => command('underline')}
          >
            <Underline className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={buttonClass}
            aria-label={`${label} strikethrough`}
            onMouseDown={keepEditorSelection}
            onClick={() => command('strikeThrough')}
          >
            <Strikethrough className="h-4 w-4" />
          </button>
          <label className="relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-card">
            <span className="sr-only">{label} text color</span>
            <span className="border-b-2 border-slate-700">
              <Bold className="h-4 w-4" />
            </span>
            <input
              type="color"
              className="absolute inset-0 opacity-0"
              onChange={(event) => command('foreColor', event.target.value)}
            />
          </label>
          <label className="relative inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-card">
            <span className="sr-only">{label} highlight color</span>
            <Highlighter className="h-4 w-4" />
            <input
              type="color"
              className="absolute inset-0 opacity-0"
              onChange={(event) => command('hiliteColor', event.target.value)}
            />
          </label>
          <button
            type="button"
            className={buttonClass}
            aria-label={`${label} align left`}
            onMouseDown={keepEditorSelection}
            onClick={() => command('justifyLeft')}
          >
            <AlignLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={buttonClass}
            aria-label={`${label} numbered list`}
            onMouseDown={keepEditorSelection}
            onClick={() => command('insertOrderedList')}
          >
            <ListOrdered className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={buttonClass}
            aria-label={`${label} list`}
            onMouseDown={keepEditorSelection}
            onClick={() => command('insertUnorderedList')}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={buttonClass}
            aria-label={`${label} quote`}
            onMouseDown={keepEditorSelection}
            onClick={() => command('formatBlock', 'blockquote')}
          >
            <Quote className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={buttonClass}
            aria-label={`${label} code`}
            onMouseDown={keepEditorSelection}
            onClick={() => command('formatBlock', 'pre')}
          >
            <Code2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={buttonClass}
            aria-label={`${label} link`}
            onMouseDown={keepEditorSelection}
            onClick={() => {
              const href = window.prompt('Enter an https:// link');
              if (href?.startsWith('https://')) command('createLink', href);
            }}
          >
            <Link2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={buttonClass}
            aria-label={`${label} clear formatting and use normal text`}
            title="Clear formatting and use normal text"
            onMouseDown={keepEditorSelection}
            onClick={resetFormatting}
          >
            <Eraser className="h-4 w-4" />
          </button>
        </div>
        <div
          ref={editor}
          role="textbox"
          aria-labelledby={labelId}
          contentEditable
          suppressContentEditableWarning
          onInput={(event) => onChange(event.currentTarget.innerHTML)}
          onBlur={(event) => onChange(event.currentTarget.innerHTML)}
          className="prose prose-sm min-h-32 max-w-none p-3 outline-none"
        />
      </div>
    </div>
  );
}

export function SafeRichText({
  html,
  empty = 'No information added.',
}: {
  html: string | null;
  empty?: string;
}) {
  if (!html) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <div
      className="prose prose-sm max-w-none whitespace-pre-line text-slate-700"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function RichTextPreview({
  html,
  empty = '—',
  lines = 2,
  className,
}: {
  html: string | null;
  empty?: string;
  lines?: number;
  className?: string;
}) {
  if (!html) return <span className={cn('text-slate-400', className)}>{empty}</span>;
  return (
    <div
      className={cn(
        'master-rich-text-preview overflow-hidden text-slate-600 [&_*]:m-0 [&_br]:hidden [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5',
        className,
      )}
      style={{
        display: '-webkit-box',
        WebkitLineClamp: lines,
        WebkitBoxOrient: 'vertical',
      }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function TextPreview({
  children,
  empty = '—',
  lines = 2,
  className,
}: {
  children: string | null;
  empty?: string;
  lines?: number;
  className?: string;
}) {
  if (!children) return <span className={cn('text-slate-400', className)}>{empty}</span>;
  return (
    <span
      className={cn('overflow-hidden', className)}
      style={{
        display: '-webkit-box',
        WebkitLineClamp: lines,
        WebkitBoxOrient: 'vertical',
      }}
    >
      {children}
    </span>
  );
}

export function LoadingCard() {
  return <div className="h-64 animate-pulse rounded-xl border bg-slate-100" />;
}

export function Stars({ value }: { value: number | null }) {
  if (!value) return <span className="text-sm text-slate-400">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-500" aria-label={`${value} star`}>
      {Array.from({ length: 5 }, (_, index) => (
        <span key={index} className={index < value ? 'text-amber-500' : 'text-slate-300'}>
          ★
        </span>
      ))}
    </span>
  );
}

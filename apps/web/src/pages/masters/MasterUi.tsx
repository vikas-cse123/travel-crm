import { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, List, Bold, Italic, Link2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

export const fieldClass =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

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
  description: string;
  current: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Breadcrumbs current={current} />
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
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

export function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
      <span>
        {total} record{total === 1 ? '' : 's'}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span>
          Page {page} of {Math.max(totalPages, 1)}
        </span>
        <Button
          variant="secondary"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
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
  useEffect(() => {
    if (editor.current && editor.current.innerHTML !== value) editor.current.innerHTML = value;
  }, [value]);
  const command = (name: string, argument?: string) => {
    editor.current?.focus();
    document.execCommand(name, false, argument);
    onChange(editor.current?.innerHTML ?? '');
  };
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      <div className="mt-1 overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100">
        <div className="flex gap-1 border-b bg-slate-50 p-1.5">
          <button
            type="button"
            className="rounded p-1.5 hover:bg-white"
            aria-label={`${label} bold`}
            onClick={() => command('bold')}
          >
            <Bold className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded p-1.5 hover:bg-white"
            aria-label={`${label} italic`}
            onClick={() => command('italic')}
          >
            <Italic className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded p-1.5 hover:bg-white"
            aria-label={`${label} list`}
            onClick={() => command('insertUnorderedList')}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded p-1.5 hover:bg-white"
            aria-label={`${label} link`}
            onClick={() => {
              const href = window.prompt('Enter an https:// link');
              if (href?.startsWith('https://')) command('createLink', href);
            }}
          >
            <Link2 className="h-4 w-4" />
          </button>
        </div>
        <div
          ref={editor}
          role="textbox"
          aria-label={label}
          contentEditable
          suppressContentEditableWarning
          onInput={(event) => onChange(event.currentTarget.innerHTML)}
          className="prose prose-sm min-h-32 max-w-none p-3 outline-none"
        />
      </div>
    </label>
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
      className="prose prose-sm max-w-none text-slate-700"
      dangerouslySetInnerHTML={{ __html: html }}
    />
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

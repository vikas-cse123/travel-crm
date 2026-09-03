import { useEffect, useRef } from 'react';
import { Bold, Italic, Underline, Link as LinkIcon, List, ListOrdered } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  ariaLabel: string;
  placeholder?: string;
}

/**
 * A dependency-free rich-text editor matching the reference quotation editors
 * (bold / italic / underline / lists / link). It stores HTML and stays
 * uncontrolled internally — the DOM is only rewritten when `value` changes from
 * the outside (e.g. loading a saved draft), never while the user is typing, so
 * the caret never jumps.
 */
function decodeHtmlEntities(value: string): string {
  if (typeof document !== 'undefined') {
    let prev = '';
    let cur = value;
    let iterations = 0;
    while (cur !== prev && iterations < 10) {
      prev = cur;
      const txt = document.createElement('textarea');
      txt.innerHTML = cur;
      cur = txt.value;
      iterations++;
      if (!cur.includes('&')) break;
    }
    return cur;
  }
  let cur = value;
  let prev = '';
  let iterations = 0;
  while (cur !== prev && iterations < 10) {
    prev = cur;
    cur = cur
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(/&#(\d+);/g, (_, code) => {
        const c = Number(code);
        return Number.isFinite(c) ? String.fromCharCode(c) : _;
      })
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => {
        const c = parseInt(code, 16);
        return Number.isFinite(c) ? String.fromCharCode(c) : _;
      });
    iterations++;
  }
  return cur;
}

function plainTextToHtml(value: string): string {
  const decoded = decodeHtmlEntities(value);
  return decoded
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n|\r|\n/g, '<br>');
}

function richTextToDisplayHtml(value: string): string {
  const decoded = decodeHtmlEntities(value ?? '');
  return decoded.includes('<') ? decoded : plainTextToHtml(decoded);
}

export function RichTextEditor({ value, onChange, ariaLabel, placeholder }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  // HTML last emitted from this editor instance. The parent echoes it back
  // via `value`; that echo must never rewrite the DOM. Rewriting would run
  // entity/whitespace normalization (e.g. `&nbsp;` vs a raw space) whose
  // output differs textually from `innerHTML`, resetting the caret on every
  // keystroke — notably after SPACE — and corrupting typed text.
  const lastEmitted = useRef<string | null>(null);

  useEffect(() => {
    const next = value ?? '';
    // Own echo of what the user just typed: leave the DOM (and caret) alone.
    if (next === lastEmitted.current) return;
    const el = ref.current;
    if (!el) return;
    // External change (initial load, saved content, section switch): display it.
    const html = richTextToDisplayHtml(next);
    if (el.innerHTML !== html) el.innerHTML = html;
    lastEmitted.current = next;
  }, [value]);

  const emit = () => {
    if (!ref.current) return;
    const html = ref.current.innerHTML;
    lastEmitted.current = html;
    onChange(html);
  };
  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };
  const addLink = () => {
    const url = window.prompt('Link URL');
    if (url) exec('createLink', url);
  };

  const btn = 'rounded p-1.5 text-slate-600 hover:bg-slate-100';
  return (
    <div className="overflow-hidden rounded-lg border border-slate-300 focus-within:border-brand-500">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-slate-50 px-2 py-1">
        <button
          type="button"
          className={btn}
          aria-label="Bold"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec('bold')}
        >
          <Bold className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={btn}
          aria-label="Italic"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec('italic')}
        >
          <Italic className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={btn}
          aria-label="Underline"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec('underline')}
        >
          <Underline className="h-4 w-4" />
        </button>
        <span className="mx-1 h-4 w-px bg-slate-300" />
        <button
          type="button"
          className={btn}
          aria-label="Bulleted list"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec('insertUnorderedList')}
        >
          <List className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={btn}
          aria-label="Numbered list"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec('insertOrderedList')}
        >
          <ListOrdered className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={btn}
          aria-label="Insert link"
          onMouseDown={(e) => e.preventDefault()}
          onClick={addLink}
        >
          <LinkIcon className="h-4 w-4" />
        </button>
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label={ariaLabel}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        className="min-h-[8rem] px-3 py-2 text-sm leading-relaxed outline-none empty:before:text-slate-400 empty:before:content-[attr(data-placeholder)] [&_a]:text-brand-600 [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
      />
    </div>
  );
}

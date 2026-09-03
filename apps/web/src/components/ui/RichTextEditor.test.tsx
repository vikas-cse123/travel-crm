import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RichTextEditor as SharedEditor } from './RichTextEditor';
import { RichTextEditor as MastersEditor } from '../../pages/masters/MasterUi';

/**
 * Regression: typing SPACE must not move the caret or corrupt text.
 *
 * Root cause: both shared editors rewrote `innerHTML` on every echoed
 * `value` change. Entity/whitespace normalization (`&nbsp;` vs a raw space)
 * differs textually from the browser's `innerHTML`, so each keystroke reset
 * the DOM and the caret jumped to the start, scrambling typed text.
 * The editors now skip their own echo and only write external changes.
 *
 * Flight → Additional Notes uses the shared ui editor; Hotel → Description
 * uses the masters editor, so covering both editors covers both fields.
 */

function ControlledShared({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <SharedEditor ariaLabel="notes" value={value} onChange={setValue} />
      <output data-testid="mirror">{value}</output>
    </>
  );
}

function ControlledMasters({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <MastersEditor label="Description" value={value} onChange={setValue} />
      <output data-testid="mirror">{value}</output>
    </>
  );
}

/** Counts direct `innerHTML` assignments on an element (i.e. editor resets). */
function countInnerHtmlWrites(el: Element) {
  let proto: object | null = Object.getPrototypeOf(el);
  let descriptor: PropertyDescriptor | undefined;
  while (proto && !descriptor) {
    descriptor = Object.getOwnPropertyDescriptor(proto, 'innerHTML');
    proto = Object.getPrototypeOf(proto);
  }
  if (!descriptor?.get || !descriptor?.set) throw new Error('innerHTML accessor not found');
  let writes = 0;
  const get = descriptor.get!.bind(el);
  const set = descriptor.set!.bind(el);
  Object.defineProperty(el, 'innerHTML', {
    configurable: true,
    get,
    set(next: string) {
      writes += 1;
      set(next);
    },
  });
  return () => writes;
}

function suite(
  name: string,
  renderControlled: (initial: string) => ReturnType<typeof render>,
  role: { name: RegExp; label: string },
) {
  describe(name, () => {
    it('types text, inserts a space in the middle, and keeps content order without resetting', () => {
      const ui = renderControlled('');
      const editor = screen.getByRole('textbox', { name: role.name });
      const writes = countInnerHtmlWrites(editor);
      // Simulate one browser keystroke: the DOM already holds the typed
      // content; firing `input` lets the editor echo it. The sync effect must
      // not perform an additional rewrite (which would reset the caret).
      const type = (html: string) => {
        editor.innerHTML = html;
        const baseline = writes();
        fireEvent.input(editor);
        expect(writes()).toBe(baseline);
      };

      // 1. Type text normally.
      type('Pleasearrange the flight');
      expect(screen.getByTestId('mirror').textContent).toBe('Pleasearrange the flight');

      // 2. Insert a space in the middle. Browsers serialize the preserved
      // space as `&nbsp;`, whose normalized form differs textually and used
      // to trigger a DOM rewrite (caret jump + corrupted order).
      const before = editor;
      type('Please&nbsp;arrange the flight');
      // The emitted value is the browser's serialization, byte-identical.
      expect(screen.getByTestId('mirror').textContent).toBe('Please&nbsp;arrange the flight');

      // 3. Continue typing after the space.
      type('Please&nbsp;arrange the flight for tomorrow');
      const mirror = screen.getByTestId('mirror').textContent;
      expect(mirror).toBe('Please&nbsp;arrange the flight for tomorrow');
      expect(mirror?.indexOf('Please')).toBeLessThan(mirror?.indexOf('tomorrow') ?? 0);

      // 4. No remount/reset on any keystroke: same node, zero effect rewrites.
      expect(screen.getByRole('textbox', { name: role.name })).toBe(before);
      expect(editor.isConnected).toBe(true);
      // Caret-affecting content is byte-stable: no normalization churn.
      expect(editor.innerHTML).toBe('Please&nbsp;arrange the flight for tomorrow');
      ui.unmount();
    });

    it('still displays externally loaded and switched content', () => {
      // Initial load of saved content renders as-is.
      const first = renderControlled('<p>Saved note</p>');
      expect(screen.getByRole('textbox', { name: role.name }).innerHTML).toBe(
        '<p>Saved note</p>',
      );
      first.unmount();

      // Switching sections (a genuinely new external value) updates the editor.
      const second = renderControlled('<p>Other section</p>');
      expect(screen.getByRole('textbox', { name: role.name }).innerHTML).toBe(
        '<p>Other section</p>',
      );
      second.unmount();
    });

    it('keeps formatting controls available', () => {
      renderControlled('');
      expect(screen.getByRole('button', { name: /bold/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /italic/i })).toBeInTheDocument();
    });
  });
}

suite('shared ui RichTextEditor (Flight Additional Notes)', (initial: string) =>
  render(<ControlledShared initial={initial} />),
{ name: /notes/i, label: 'notes' },
);

suite('masters RichTextEditor (Hotel Description)', (initial: string) =>
  render(<ControlledMasters initial={initial} />),
{ name: /description/i, label: 'Description' },
);

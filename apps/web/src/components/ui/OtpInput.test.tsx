import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OtpInput } from './OtpInput';

/** Controlled wrapper mirroring how the verify page drives the input. */
function ControlledOtp({ onComplete }: { onComplete?: (value: string) => void }) {
  const [value, setValue] = useState('');
  return <OtpInput value={value} onChange={setValue} {...(onComplete ? { onComplete } : {})} />;
}

describe('OtpInput', () => {
  it('renders six accessible digit inputs', () => {
    render(<ControlledOtp />);
    const boxes = screen.getAllByRole('textbox');
    expect(boxes).toHaveLength(6);
    expect(boxes[0]).toHaveAccessibleName('Digit 1 of 6');
  });

  it('accepts typed digits and advances focus', async () => {
    const user = userEvent.setup();
    render(<ControlledOtp />);
    const boxes = screen.getAllByRole('textbox');

    await user.click(boxes[0] as HTMLElement);
    await user.keyboard('12');

    expect(boxes[0]).toHaveValue('1');
    expect(boxes[1]).toHaveValue('2');
  });

  it('ignores non-numeric input', async () => {
    const user = userEvent.setup();
    render(<ControlledOtp />);
    const boxes = screen.getAllByRole('textbox');

    await user.click(boxes[0] as HTMLElement);
    await user.keyboard('a');
    expect(boxes[0]).toHaveValue('');
  });

  it('distributes a pasted code across all boxes', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(<ControlledOtp onComplete={onComplete} />);
    const boxes = screen.getAllByRole('textbox');

    await user.click(boxes[0] as HTMLElement);
    await user.paste('123456');

    expect(boxes.map((box) => (box as HTMLInputElement).value)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ]);
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('strips separators from a pasted code', async () => {
    const user = userEvent.setup();
    render(<ControlledOtp />);
    const boxes = screen.getAllByRole('textbox');

    await user.click(boxes[0] as HTMLElement);
    await user.paste('12 34-56');

    expect((boxes[5] as HTMLInputElement).value).toBe('6');
  });

  it('clears the current digit on backspace', async () => {
    const user = userEvent.setup();
    render(<ControlledOtp />);
    const boxes = screen.getAllByRole('textbox');

    await user.click(boxes[0] as HTMLElement);
    await user.keyboard('12');
    await user.keyboard('{Backspace}');

    // Second box was focused after typing; backspace clears it.
    expect(boxes[1]).toHaveValue('');
  });
});

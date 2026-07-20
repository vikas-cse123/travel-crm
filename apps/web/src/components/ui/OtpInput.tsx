import { useEffect, useRef } from 'react';
import { OTP_LENGTH } from '@interscale/shared';
import { cn } from '@/utils/cn';

interface OtpInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired when the last digit is filled, so the form can auto-submit. */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  hasError?: boolean;
  autoFocus?: boolean;
  label?: string;
}

/**
 * Segmented numeric code input.
 *
 * Accessibility notes, since a row of single-character boxes is easy to get
 * wrong:
 *  - The boxes are wrapped in a labelled `group`, so a screen reader announces
 *    the field's purpose rather than six unlabelled inputs.
 *  - Each box has its own position label ("Digit 3 of 6").
 *  - `inputMode="numeric"` and `autoComplete="one-time-code"` let mobile
 *    keyboards and OS-level SMS/email autofill work.
 *  - Paste is handled on any box and distributes across all of them, because
 *    pasting a code from an email is the common path.
 *  - Backspace on an empty box steps back, which is what users expect.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = OTP_LENGTH,
  disabled = false,
  hasError = false,
  autoFocus = false,
  label = 'Verification code',
}: OtpInputProps) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (autoFocus) inputsRef.current[0]?.focus();
  }, [autoFocus]);

  const digits = Array.from({ length }, (_, index) => value[index] ?? '');

  const commit = (next: string) => {
    const trimmed = next.slice(0, length);
    onChange(trimmed);
    if (trimmed.length === length) onComplete?.(trimmed);
  };

  const focusAt = (index: number) => {
    const target = inputsRef.current[Math.max(0, Math.min(index, length - 1))];
    target?.focus();
    target?.select();
  };

  const handleChange = (index: number, raw: string) => {
    const numeric = raw.replace(/\D/g, '');
    if (!numeric) return;

    // Typing into a box mid-code replaces from that position onward, and a
    // multi-character value (some keyboards send the whole code) spreads out.
    const chars = value.split('');
    for (let offset = 0; offset < numeric.length && index + offset < length; offset += 1) {
      chars[index + offset] = numeric[offset] as string;
    }

    const next = chars.join('').slice(0, length);
    commit(next);
    focusAt(index + numeric.length);
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const chars = value.split('');

      if (chars[index]) {
        chars[index] = '';
        commit(chars.join(''));
        return;
      }

      // Empty box: clear the previous one and step back.
      if (index > 0) {
        chars[index - 1] = '';
        commit(chars.join('').slice(0, index - 1));
        focusAt(index - 1);
      }
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      focusAt(index - 1);
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      focusAt(index + 1);
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    // Strip spaces and hyphens so "123 456" and "123-456" both work.
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;

    commit(pasted);
    focusAt(pasted.length >= length ? length - 1 : pasted.length);
  };

  return (
    <div
      role="group"
      aria-label={label}
      className="flex justify-center gap-2 sm:gap-3"
      data-testid="otp-input"
    >
      {digits.map((digit, index) => (
        <input
          // Fixed positions in a fixed-length list; index is a stable identity.
          key={index}
          ref={(element) => {
            inputsRef.current[index] = element;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={length}
          value={digit}
          disabled={disabled}
          aria-label={`Digit ${index + 1} of ${length}`}
          aria-invalid={hasError}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={(event) => event.target.select()}
          className={cn(
            'h-12 w-11 rounded-lg border bg-white text-center text-lg font-semibold text-slate-900 shadow-sm sm:h-14 sm:w-12 sm:text-xl',
            'disabled:cursor-not-allowed disabled:bg-slate-50',
            hasError
              ? 'border-red-400 focus:border-red-500'
              : 'border-slate-300 focus:border-brand-500',
          )}
        />
      ))}
    </div>
  );
}

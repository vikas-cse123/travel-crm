import type { EmailMessage, EmailProvider } from './email.types.js';

/**
 * Test provider: keeps messages in process so a test can assert on them.
 *
 * This exists so tests can read an OTP or reset link WITHOUT the API ever
 * exposing one in a response. `env.ts` rejects this provider unless
 * NODE_ENV=test, so production cannot silently swallow real mail.
 */
export class MemoryEmailProvider implements EmailProvider {
  readonly name = 'memory';

  private readonly messages: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.messages.push(message);
    return Promise.resolve();
  }

  /** Every message sent so far, oldest first. */
  all(): readonly EmailMessage[] {
    return this.messages;
  }

  /** The most recent message, optionally filtered by recipient. */
  last(to?: string): EmailMessage | undefined {
    const candidates = to
      ? this.messages.filter((message) => message.to.toLowerCase() === to.toLowerCase())
      : this.messages;
    return candidates[candidates.length - 1];
  }

  /** Pull the six-digit OTP out of the most recent verification email. */
  lastOtp(to?: string): string | undefined {
    const message = this.last(to);
    if (!message) return undefined;
    return /\b(\d{6})\b/.exec(message.text)?.[1];
  }

  /** Pull the reset URL out of the most recent password-reset email. */
  lastResetUrl(to?: string): string | undefined {
    const message = this.last(to);
    if (!message) return undefined;
    return /(https?:\/\/\S+)/.exec(message.text)?.[1];
  }

  clear(): void {
    this.messages.length = 0;
  }
}

import { env, isTest } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import {
  buildPasswordChangedMessage,
  buildPasswordResetMessage,
  buildVerificationOtpMessage,
} from './email.templates.js';
import { ConsoleEmailProvider } from './console-email.provider.js';
import { MemoryEmailProvider } from './memory-email.provider.js';
import { SmtpEmailProvider } from './smtp-email.provider.js';
import type {
  EmailProvider,
  EmailService,
  PasswordChangedEmail,
  PasswordResetEmail,
  VerificationOtpEmail,
} from './email.types.js';

/**
 * Provider selection and the service facade the auth flows depend on.
 *
 * Auth services never touch a provider directly, so switching to Resend or SES
 * is a new `EmailProvider` implementation and one line here.
 */

function createProvider(): EmailProvider {
  switch (env.EMAIL_PROVIDER) {
    case 'smtp':
      return new SmtpEmailProvider();
    case 'memory':
      // Unreachable outside tests: env validation rejects `memory` when
      // NODE_ENV !== 'test'. Re-checked here so a future refactor of the env
      // schema cannot quietly make production discard all mail.
      if (!isTest) {
        throw new Error('The in-memory email provider is only available under NODE_ENV=test.');
      }
      return new MemoryEmailProvider();
    case 'console':
    default:
      return new ConsoleEmailProvider();
  }
}

class ProviderEmailService implements EmailService {
  constructor(private readonly provider: EmailProvider) {}

  async sendVerificationOtp(input: VerificationOtpEmail): Promise<void> {
    await this.provider.send(buildVerificationOtpMessage(input));
  }

  async sendPasswordResetEmail(input: PasswordResetEmail): Promise<void> {
    await this.provider.send(buildPasswordResetMessage(input));
  }

  async sendPasswordChangedNotification(input: PasswordChangedEmail): Promise<void> {
    await this.provider.send(buildPasswordChangedMessage(input));
  }
}

const provider = createProvider();

export const emailService: EmailService = new ProviderEmailService(provider);

/**
 * The active provider, for tests that need to read a delivered OTP or reset
 * link. Returns undefined unless the in-memory provider is active, so there is
 * no way to reach message contents in a real environment.
 */
export function getMemoryEmailProvider(): MemoryEmailProvider | undefined {
  return provider instanceof MemoryEmailProvider ? provider : undefined;
}

/**
 * Send without letting a delivery failure break the caller's flow.
 *
 * Used after a committed transaction: a registration must not roll back
 * because an SMTP host was briefly unreachable. The user can resend.
 */
export async function sendEmailSafely(
  operation: () => Promise<void>,
  context: { action: string; to: string },
): Promise<boolean> {
  try {
    await operation();
    return true;
  } catch (error) {
    // Recipient and action only. The body carries the credential.
    logger.error(
      { err: error, action: context.action, to: context.to },
      'Email delivery failed; the user can retry',
    );
    return false;
  }
}

export type { EmailService } from './email.types.js';

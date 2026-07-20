import { logger } from '../../config/logger.js';
import { isProduction } from '../../config/env.js';
import type { EmailMessage, EmailProvider } from './email.types.js';

/**
 * Development provider: prints the message to the log instead of sending it.
 *
 * This is the ONLY place an OTP or reset link is ever rendered to an operator,
 * and the production guard below is what keeps it that way. `env.ts`
 * independently refuses to boot in production unless EMAIL_PROVIDER=smtp, so
 * this is defence in depth rather than the only check.
 */
export class ConsoleEmailProvider implements EmailProvider {
  readonly name = 'console';

  async send(message: EmailMessage): Promise<void> {
    if (isProduction) {
      // Should be unreachable: env validation rejects this provider in
      // production. Refuse loudly rather than print a credential to a log sink.
      throw new Error('ConsoleEmailProvider must never be used in production.');
    }

    const banner = '─'.repeat(64);
    logger.info(
      `\n${banner}\n[DEV EMAIL] to: ${message.to}\n[DEV EMAIL] subject: ${message.subject}\n${banner}\n${message.text}\n${banner}\n`,
    );

    return Promise.resolve();
  }
}

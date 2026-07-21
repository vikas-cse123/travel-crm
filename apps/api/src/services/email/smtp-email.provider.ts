import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { EmailMessage, EmailProvider } from './email.types.js';

/**
 * Production provider: any SMTP-compatible service (Amazon SES, Postmark,
 * Mailgun, Resend's SMTP bridge).
 *
 * The transporter is created lazily so importing this module does not open a
 * connection in environments that never send mail.
 */
export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';

  private transporter: Transporter | undefined;

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;

    if (!env.SMTP_HOST) {
      throw new Error('SMTP_HOST is required when EMAIL_PROVIDER=smtp.');
    }

    const port = env.SMTP_PORT ?? 587;

    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      // 465 is implicit TLS; other ports upgrade via STARTTLS.
      secure: port === 465,
      ...(env.SMTP_USER && env.SMTP_PASSWORD
        ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }
        : {}),
    });

    return this.transporter;
  }

  async send(message: EmailMessage): Promise<void> {
    await this.getTransporter().sendMail({
      from: env.EMAIL_FROM,
      to: message.to,
      cc: message.cc,
      subject: message.subject,
      text: message.text,
      html: message.html,
      attachments: message.attachments?.map((attachment) => ({
        filename: attachment.fileName,
        content: attachment.content,
        contentType: attachment.contentType,
      })),
    });

    // Recipient and subject only — never the body, which carries the code.
    logger.debug({ to: message.to, subject: message.subject }, 'SMTP message sent');
  }
}

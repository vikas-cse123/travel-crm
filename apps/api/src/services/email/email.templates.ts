import { APP_NAME } from '@interscale/shared';
import type {
  EmailMessage,
  PasswordChangedEmail,
  PasswordResetEmail,
  VerificationOtpEmail,
} from './email.types.js';

/**
 * Message bodies, kept separate from delivery so every provider sends
 * identical content and the copy can be reviewed in one place.
 */

/** Minimal escaping for values interpolated into the HTML bodies. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function layout(heading: string, body: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f6f8;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#0f172a">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:32px">
    <p style="margin:0 0 24px;font-size:14px;font-weight:600;color:#2563eb">${escapeHtml(APP_NAME)}</p>
    <h1 style="margin:0 0 16px;font-size:20px;font-weight:600">${escapeHtml(heading)}</h1>
    ${body}
    <p style="margin:32px 0 0;font-size:12px;color:#64748b">
      If you did not expect this email you can safely ignore it.
    </p>
  </div>
</body></html>`;
}

export function buildVerificationOtpMessage(input: VerificationOtpEmail): EmailMessage {
  const text = [
    `Hello ${input.fullName},`,
    '',
    `Your ${APP_NAME} verification code for ${input.companyName} is:`,
    '',
    input.otp,
    '',
    `This code expires in ${input.expiryMinutes} minutes and can be used once.`,
    'If you did not create this account, you can ignore this email.',
  ].join('\n');

  const html = layout(
    'Verify your email address',
    `<p style="margin:0 0 16px;font-size:14px;line-height:1.6">Hello ${escapeHtml(input.fullName)},</p>
     <p style="margin:0 0 24px;font-size:14px;line-height:1.6">
       Use this code to finish setting up <strong>${escapeHtml(input.companyName)}</strong>.
     </p>
     <p style="margin:0 0 24px;font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;background:#eff6ff;border-radius:8px;padding:16px;color:#1d4ed8">
       ${escapeHtml(input.otp)}
     </p>
     <p style="margin:0;font-size:13px;color:#475569">
       This code expires in ${input.expiryMinutes} minutes and can be used once.
     </p>`,
  );

  return { to: input.to, subject: `Your ${APP_NAME} verification code`, text, html };
}

export function buildPasswordResetMessage(input: PasswordResetEmail): EmailMessage {
  const text = [
    `Hello ${input.fullName},`,
    '',
    `We received a request to reset your ${APP_NAME} password.`,
    '',
    input.resetUrl,
    '',
    `This link expires in ${input.expiryMinutes} minutes and can be used once.`,
    'If you did not request this, no action is needed and your password is unchanged.',
  ].join('\n');

  const html = layout(
    'Reset your password',
    `<p style="margin:0 0 16px;font-size:14px;line-height:1.6">Hello ${escapeHtml(input.fullName)},</p>
     <p style="margin:0 0 24px;font-size:14px;line-height:1.6">
       We received a request to reset your password.
     </p>
     <p style="margin:0 0 24px;text-align:center">
       <a href="${escapeHtml(input.resetUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:600">
         Reset password
       </a>
     </p>
     <p style="margin:0;font-size:13px;color:#475569">
       This link expires in ${input.expiryMinutes} minutes and can be used once.
       If you did not request it, your password is unchanged.
     </p>`,
  );

  return { to: input.to, subject: `Reset your ${APP_NAME} password`, text, html };
}

export function buildPasswordChangedMessage(input: PasswordChangedEmail): EmailMessage {
  const text = [
    `Hello ${input.fullName},`,
    '',
    `Your ${APP_NAME} password was just changed and all active sessions were signed out.`,
    '',
    'If this was not you, reset your password immediately and contact your administrator.',
  ].join('\n');

  const html = layout(
    'Your password was changed',
    `<p style="margin:0 0 16px;font-size:14px;line-height:1.6">Hello ${escapeHtml(input.fullName)},</p>
     <p style="margin:0 0 16px;font-size:14px;line-height:1.6">
       Your password was just changed and all active sessions were signed out.
     </p>
     <p style="margin:0;font-size:13px;color:#b91c1c">
       If this was not you, reset your password immediately and contact your administrator.
     </p>`,
  );

  return { to: input.to, subject: `Your ${APP_NAME} password was changed`, text, html };
}

/**
 * Provider-agnostic email contract.
 *
 * Callers describe *what* to send; the selected provider decides how. Swapping
 * SMTP for Resend or SES later means adding one implementation, with no change
 * to the auth services.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

export interface VerificationOtpEmail {
  to: string;
  fullName: string;
  companyName: string;
  otp: string;
  expiryMinutes: number;
}

export interface PasswordResetEmail {
  to: string;
  fullName: string;
  resetUrl: string;
  expiryMinutes: number;
}

export interface PasswordChangedEmail {
  to: string;
  fullName: string;
}

export interface EmailService {
  sendVerificationOtp(input: VerificationOtpEmail): Promise<void>;
  sendPasswordResetEmail(input: PasswordResetEmail): Promise<void>;
  sendPasswordChangedNotification(input: PasswordChangedEmail): Promise<void>;
}

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OTP_LENGTH, maskEmail } from '@interscale/shared';
import { ApiError } from '@/api/client';
import { useAuth } from '@/features/auth/AuthProvider';
import { useLogout, useResendOtp, useVerifyEmail } from '@/features/auth/auth.api';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { OtpInput } from '@/components/ui/OtpInput';

const RESEND_COOLDOWN_SECONDS = 60;

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const verify = useVerifyEmail();
  const resend = useResendOtp();
  const logout = useLogout();

  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  // A code is sent on registration, so the cooldown starts running immediately.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const submit = useCallback(
    async (code: string) => {
      setError(null);
      setNotice(null);
      try {
        await verify.mutateAsync(code);
        navigate('/dashboard', { replace: true });
      } catch (caught) {
        setError(
          caught instanceof ApiError ? caught.message : 'Something went wrong. Please try again.',
        );
        // Clear so the next attempt starts from an empty field.
        setOtp('');
      }
    },
    [navigate, verify],
  );

  const handleResend = async () => {
    setError(null);
    setNotice(null);
    try {
      const result = await resend.mutateAsync();
      setCooldown(result.cooldownSeconds);
      setNotice('A new verification code has been sent.');
      setOtp('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not send a new code.');
    }
  };

  const handleStartOver = async () => {
    await logout.mutateAsync();
    navigate('/signup', { replace: true });
  };

  const masked = user?.email ? maskEmail(user.email) : 'your email address';

  return (
    <AuthLayout
      title="Verify your email"
      subtitle={`Enter the ${OTP_LENGTH}-digit code we sent to ${masked}.`}
    >
      <div className="space-y-5">
        {error && <Alert tone="error">{error}</Alert>}
        {notice && <Alert tone="success">{notice}</Alert>}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (otp.length === OTP_LENGTH) void submit(otp);
          }}
          className="space-y-5"
        >
          <OtpInput
            value={otp}
            onChange={setOtp}
            // Submit as soon as the last digit lands — no extra click needed.
            onComplete={(code) => void submit(code)}
            disabled={verify.isPending}
            hasError={Boolean(error)}
            autoFocus
          />

          <Button
            type="submit"
            fullWidth
            isLoading={verify.isPending}
            disabled={otp.length !== OTP_LENGTH}
          >
            Verify email
          </Button>
        </form>

        <div className="text-center text-sm">
          {cooldown > 0 ? (
            <p className="text-slate-500" aria-live="polite">
              Didn&apos;t get it? You can request another code in{' '}
              <span className="font-medium text-slate-700">{cooldown}s</span>
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={resend.isPending}
              className="font-medium text-brand-600 hover:text-brand-700 disabled:opacity-60"
            >
              {resend.isPending ? 'Sending…' : 'Resend code'}
            </button>
          )}
        </div>

        <div className="border-t border-slate-200 pt-4 text-center">
          <button
            type="button"
            onClick={() => void handleStartOver()}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Use a different email address
          </button>
        </div>
      </div>
    </AuthLayout>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ForgotPasswordInput,
  LoginInput,
  LoginResponse,
  MeResponse,
  RegisterInput,
  RegisterResponse,
  ResendOtpResponse,
  ResetPasswordInput,
  ResetTokenValidationResponse,
  VerifyEmailResponse,
} from '@interscale/shared';
import { ApiError, apiClient } from '@/api/client';

/** Query keys for anything derived from the current session. */
export const authKeys = {
  all: ['auth'] as const,
  me: () => [...authKeys.all, 'me'] as const,
  resetToken: (token: string) => [...authKeys.all, 'reset-token', token] as const,
};

/**
 * The current session.
 *
 * A 401 is an expected answer ("nobody is signed in"), not an error to retry,
 * so it resolves to null and leaves the app in a clean signed-out state.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: async ({ signal }) => {
      try {
        return await apiClient.get<MeResponse>('/auth/me', signal);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: RegisterInput) => apiClient.post<RegisterResponse>('/auth/register', input),
    onSuccess: (data) => {
      // Seed the cache so the verify-email screen renders without a refetch.
      queryClient.setQueryData(authKeys.me(), {
        user: data.user,
        session: { expiresAt: '', rememberMe: false },
      } satisfies MeResponse);
    },
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: LoginInput) => apiClient.post<LoginResponse>('/auth/login', input),
    onSuccess: (data) => {
      queryClient.setQueryData(authKeys.me(), {
        user: data.user,
        session: data.session,
      } satisfies MeResponse);
    },
  });
}

export function useVerifyEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (otp: string) => apiClient.post<VerifyEmailResponse>('/auth/verify-email', { otp }),
    onSuccess: (data) => {
      queryClient.setQueryData(authKeys.me(), {
        user: data.user,
        session: data.session,
      } satisfies MeResponse);
    },
  });
}

export function useResendOtp() {
  return useMutation({
    mutationFn: () => apiClient.post<ResendOtpResponse>('/auth/resend-verification-otp'),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.post<{ signedOut: boolean }>('/auth/logout'),
    onSettled: () => {
      // Clear on failure too: the cookie may already be gone, and leaving a
      // stale user in the cache would show a signed-in UI to nobody.
      queryClient.setQueryData(authKeys.me(), null);
      void queryClient.clear();
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (input: ForgotPasswordInput) =>
      apiClient.post<{ requested: boolean }>('/auth/forgot-password', input),
  });
}

export function useValidateResetToken(token: string) {
  return useQuery({
    queryKey: authKeys.resetToken(token),
    queryFn: ({ signal }) =>
      apiClient.get<ResetTokenValidationResponse>(
        `/auth/reset-password/${encodeURIComponent(token)}/validate`,
        signal,
      ),
    enabled: token.length > 0,
    retry: false,
    staleTime: 0,
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (input: ResetPasswordInput) =>
      apiClient.post<{ reset: boolean }>('/auth/reset-password', input),
  });
}

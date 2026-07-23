import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/api/client';
import type {
  CompanyBankAccountInput,
  LogoUploadRequestInput,
  SettingsBrandingInput,
  SettingsDefaultTermsInput,
  SettingsPreferencesInput,
  SettingsProfileInput,
  SettingsTaxInput,
} from '@interscale/shared';

export interface CompanySettings {
  profile: {
    name: string;
    email: string;
    phone: string | null;
    website: string | null;
    address: string | null;
  };
  branding: {
    primaryColor: string;
    hasLogo: boolean;
    logoUrl?: string;
    logoMimeType: string | null;
    logoFileSize: number | null;
  };
  tax: { taxRegistrationNumber: string | null };
  preferences: { timezone: string; defaultCurrency: string };
  defaultTerms: { quotationTerms: string | null; bookingTerms: string | null };
  bankAccount: {
    exists: boolean;
    accountHolderName?: string;
    bankName?: string;
    branchName?: string | null;
    accountNumberLast4?: string;
    accountNumberMasked?: string;
    ifscCode?: string | null;
    swiftCode?: string | null;
    accountType?: string | null;
  };
  numbering: Record<string, string | number>;
  capabilities: { canView: boolean; canUpdate: boolean };
}

const key = ['settings'] as const;

export function useSettings() {
  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) => apiClient.get<CompanySettings>('/settings', signal),
  });
}

function useSettingsMutation<TInput>(fn: (input: TInput) => Promise<CompanySettings>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => qc.setQueryData(key, data),
  });
}

export const useUpdateProfile = () =>
  useSettingsMutation((input: SettingsProfileInput) =>
    apiClient.patch<CompanySettings>('/settings/profile', input),
  );
export const useUpdateBranding = () =>
  useSettingsMutation((input: SettingsBrandingInput) =>
    apiClient.patch<CompanySettings>('/settings/branding', input),
  );
export const useUpdateTax = () =>
  useSettingsMutation((input: SettingsTaxInput) =>
    apiClient.patch<CompanySettings>('/settings/tax', input),
  );
export const useUpdatePreferences = () =>
  useSettingsMutation((input: SettingsPreferencesInput) =>
    apiClient.patch<CompanySettings>('/settings/preferences', input),
  );
export const useUpdateDefaultTerms = () =>
  useSettingsMutation((input: SettingsDefaultTermsInput) =>
    apiClient.patch<CompanySettings>('/settings/default-terms', input),
  );

export function useSaveBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CompanyBankAccountInput) =>
      apiClient.put<CompanySettings['bankAccount']>('/settings/bank-account', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}

/** Two-phase logo upload: request a signed URL, PUT the file, then confirm. */
export function useUploadLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const request: LogoUploadRequestInput = {
        fileName: file.name,
        mimeType: file.type as LogoUploadRequestInput['mimeType'],
        fileSize: file.size,
      };
      const approval = await apiClient.post<{ uploadUrl: string; expiresInSeconds: number }>(
        '/settings/logo/upload',
        request,
      );
      if (!approval.uploadUrl.startsWith('http'))
        throw new Error(
          'Local memory storage has no browser upload transport. Configure S3 to upload logos.',
        );
      const response = await fetch(approval.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!response.ok) throw new Error('The logo upload failed. Please try again.');
      return apiClient.post<CompanySettings>('/settings/logo/confirm');
    },
    onSuccess: (data) => qc.setQueryData(key, data),
  });
}

export function useRemoveLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.delete<CompanySettings>('/settings/logo'),
    onSuccess: (data) => qc.setQueryData(key, data),
  });
}

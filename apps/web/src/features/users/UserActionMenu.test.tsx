import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { UserActionMenu } from './UserActionMenu';

const authState = vi.hoisted(() => ({
  user: { id: 'owner-1', role: { name: 'Owner', hierarchyLevel: 100 } },
  permissions: new Set<string>(),
}));
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: authState.user,
    hasPermission: (k: string) => authState.permissions.has(k),
  }),
}));

const managerUser = {
  id: 'u-2',
  fullName: 'Asha Agent',
  username: 'asha',
  email: 'asha@test.local',
  phone: null,
  status: 'ACTIVE' as const,
  lastLoginAt: null,
  createdAt: '2026-01-01',
  role: { id: 'r2', name: 'Manager', hierarchyLevel: 80 },
  permissionTemplate: null,
};

const response = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;

describe('UserActionMenu Set New Password', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    authState.user = { id: 'owner-1', role: { name: 'Owner', hierarchyLevel: 100 } };
    authState.permissions = new Set([
      'users.view',
      'users.update',
      'users.change_status',
      'users.reset_password',
    ]);
    vi.stubGlobal('fetch', vi.fn(async () => response({ updated: true })));
  });

  it('shows Set New Password for an Owner targeting another user', async () => {
    renderWithProviders(<UserActionMenu user={managerUser} />);
    await userEvent.click(screen.getByRole('button', { name: /Actions for Asha Agent/i }));
    expect(screen.getByRole('button', { name: /Set New Password/i })).toBeInTheDocument();
  });

  it('hides Set New Password from a non-Owner', async () => {
    authState.user = { id: 'mgr-1', role: { name: 'Manager', hierarchyLevel: 80 } };
    renderWithProviders(<UserActionMenu user={managerUser} />);
    await userEvent.click(screen.getByRole('button', { name: /Actions for Asha Agent/i }));
    expect(screen.queryByRole('button', { name: /Set New Password/i })).not.toBeInTheDocument();
  });

  it('hides Set New Password when the Owner views their own row', async () => {
    const ownerRow = { ...managerUser, id: 'owner-1', fullName: 'Owner Name' };
    renderWithProviders(<UserActionMenu user={ownerRow} />);
    await userEvent.click(screen.getByRole('button', { name: /Actions for Owner Name/i }));
    expect(screen.queryByRole('button', { name: /Set New Password/i })).not.toBeInTheDocument();
  });

  it('opens the modal and submits a valid password, then closes', async () => {
    renderWithProviders(<UserActionMenu user={managerUser} />);
    await userEvent.click(screen.getByRole('button', { name: /Actions for Asha Agent/i }));
    await userEvent.click(screen.getByRole('button', { name: /Set New Password/i }));

    const dialog = await screen.findByRole('dialog', { name: 'Set New Password' });
    expect(screen.getByText('Asha Agent')).toBeInTheDocument();

    const [newPassword, confirmPassword] = dialog.querySelectorAll<HTMLInputElement>(
      'input[type="password"]',
    );
    await userEvent.type(newPassword, 'NewPass@2026');
    await userEvent.type(confirmPassword, 'NewPass@2026');

    const setButton = screen.getByRole('button', { name: 'Set Password' });
    await waitFor(() => expect(setButton).toBeEnabled());
    await userEvent.click(setButton);

    // Success message from the backend is surfaced, then the modal closes.
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Set New Password' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('shows a confirmation-mismatch message and disables the submit button', async () => {
    renderWithProviders(<UserActionMenu user={managerUser} />);
    await userEvent.click(screen.getByRole('button', { name: /Actions for Asha Agent/i }));
    await userEvent.click(screen.getByRole('button', { name: /Set New Password/i }));

    const dialog = await screen.findByRole('dialog', { name: 'Set New Password' });
    const [newPassword, confirmPassword] = dialog.querySelectorAll<HTMLInputElement>(
      'input[type="password"]',
    );
    await userEvent.type(newPassword, 'NewPass@2026');
    await userEvent.type(confirmPassword, 'Different@2026');

    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Set Password' })).toBeDisabled();
  });
});

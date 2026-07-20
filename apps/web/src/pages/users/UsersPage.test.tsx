import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import { UsersPage } from './UsersPage';
import { UserDetailsPage } from './UserDetailsPage';
import { NewUserPage } from './NewUserPage';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me' }, hasPermission: (k: string) => k !== 'users.archive' }),
}));
const response = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;
const empty = { data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } };
describe('Phase 4 user pages', () => {
  beforeEach(() => vi.unstubAllGlobals());
  it('validates the add-user form before submission', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ roles: [], permissionTemplates: [] })),
    );
    renderWithProviders(<NewUserPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Create user' }));
    expect(await screen.findByText('Full name must be at least 2 characters')).toBeInTheDocument();
    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
  });
  it('shows users loading state', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    renderWithProviders(<UsersPage />);
    expect(screen.getByLabelText('Loading users')).toBeInTheDocument();
  });
  it('shows users error state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: false,
            status: 500,
            json: async () => ({
              success: false,
              error: { code: 'INTERNAL_ERROR', message: 'no' },
            }),
          }) as Response,
      ),
    );
    renderWithProviders(<UsersPage />);
    expect(await screen.findByText('Users could not be loaded.')).toBeInTheDocument();
  });
  it('shows users empty state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        response(
          String(input).includes('lookups') ? { roles: [], permissionTemplates: [] } : empty,
        ),
      ),
    );
    renderWithProviders(<UsersPage />);
    expect(await screen.findByText('No users found')).toBeInTheDocument();
  });
  it('renders user details and hides forbidden archive action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        response(
          String(input).includes('activity')
            ? { data: [] }
            : {
                id: 'u1',
                fullName: 'Priya Nair',
                username: 'priya',
                email: 'p@test.local',
                phone: null,
                status: 'ACTIVE',
                emailVerified: true,
                emailVerifiedAt: '2026-01-01',
                lastLoginAt: null,
                mustChangePassword: true,
                createdAt: '2026-01-01',
                updatedAt: '2026-01-01',
                role: { id: 'r', name: 'Manager', hierarchyLevel: 80 },
                permissionTemplate: null,
                effectivePermissions: ['users.view'],
                recentActivity: [],
              },
        ),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/users/:userId" element={<UserDetailsPage />} />
      </Routes>,
      { route: '/users/u1' },
    );
    expect(await screen.findByRole('heading', { name: 'Priya Nair' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
  });
});

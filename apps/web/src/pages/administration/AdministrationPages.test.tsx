import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { RolesPage } from './RolesPage';
import { TemplatesPage } from './TemplatesPage';
import { ActivityLogsPage } from './ActivityLogsPage';
import { PermissionPicker } from '@/features/administration/PermissionPicker';
vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'me' }, hasPermission: () => true }),
}));
const ok = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;
const page = (data: unknown[]) => ({
  data,
  pagination: { page: 1, pageSize: 20, total: data.length, totalPages: data.length ? 1 : 0 },
});
describe('administration pages', () => {
  beforeEach(() => vi.unstubAllGlobals());
  it('shows role loading', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
    renderWithProviders(<RolesPage />);
    expect(screen.getByLabelText('Loading roles')).toBeInTheDocument();
  });
  it('shows role empty state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(page([]))),
    );
    renderWithProviders(<RolesPage />);
    expect(await screen.findByText('No roles found.')).toBeInTheDocument();
  });
  it('shows role error state', async () => {
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
    renderWithProviders(<RolesPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Roles could not be loaded');
  });
  it('filters templates through URL-synchronized controls', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(page([]))),
    );
    renderWithProviders(<TemplatesPage />);
    await screen.findByText('No templates found.');
    await userEvent.selectOptions(screen.getByLabelText('Template status'), 'ACTIVE');
    expect(screen.getByLabelText('Template status')).toHaveValue('ACTIVE');
  });
  it('expands safe activity metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ok(
          page([
            {
              id: 'a',
              action: 'ROLE_UPDATED',
              entityType: 'Role',
              entityId: '12345678-x',
              metadata: { safe: 'visible' },
              ipAddress: '127.0.0.1',
              userAgent: null,
              createdAt: '2026-01-01T00:00:00Z',
              actorUser: { id: 'u', fullName: 'Owner', username: 'owner' },
              targetUser: null,
            },
          ]),
        ),
      ),
    );
    renderWithProviders(<ActivityLogsPage />);
    await userEvent.click(await screen.findByText('View'));
    expect(screen.getByText(/visible/)).toBeInTheDocument();
  });
  it('groups permissions, disables unavailable keys and warns on sensitive grants', () => {
    renderWithProviders(
      <PermissionPicker
        groups={[
          {
            module: 'roles',
            label: 'Roles',
            permissions: [
              {
                id: '1',
                key: 'roles.create',
                module: 'roles',
                action: 'create',
                description: 'Create',
                isAvailable: true,
              },
              {
                id: '2',
                key: 'future.x',
                module: 'roles',
                action: 'x',
                description: 'Future',
                isAvailable: false,
              },
            ],
          },
        ]}
        value={['roles.create']}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText('Roles')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /future.x/i })).toBeDisabled();
    expect(screen.getByText(/Sensitive administration/)).toBeInTheDocument();
  });
  it('permission search hides non-matching permissions', async () => {
    renderWithProviders(
      <PermissionPicker
        groups={[
          {
            module: 'x',
            label: 'Module',
            permissions: [
              {
                id: '1',
                key: 'alpha.view',
                module: 'x',
                action: 'view',
                description: 'Alpha',
                isAvailable: true,
              },
              {
                id: '2',
                key: 'beta.view',
                module: 'x',
                action: 'view',
                description: 'Beta',
                isAvailable: true,
              },
            ],
          },
        ]}
        value={[]}
        onChange={() => {}}
      />,
    );
    await userEvent.type(screen.getByLabelText('Search permissions'), 'beta');
    expect(screen.queryByText('alpha.view')).not.toBeInTheDocument();
    expect(screen.getByText('beta.view')).toBeInTheDocument();
  });
});

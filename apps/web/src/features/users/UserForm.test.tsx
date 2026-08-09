import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import { updateUserSchema } from '@interscale/shared';
import { UserForm } from './UserForm';

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

const response = (data: unknown) =>
  ({ ok: true, status: 200, json: async () => ({ success: true, data }) }) as Response;

const ROLE_OWNER = '10000000-0000-4000-8000-000000000000';
const ROLE_MANAGER = '20000000-0000-4000-8000-000000000000';
const ROLE_SALES = '30000000-0000-4000-8000-000000000000';
const TEMPLATE = '40000000-0000-4000-8000-000000000000';

const lookups = {
  roles: [
    { id: ROLE_OWNER, name: 'Owner', hierarchyLevel: 100 },
    { id: ROLE_MANAGER, name: 'Manager', hierarchyLevel: 80 },
    { id: ROLE_SALES, name: 'Sales Executive', hierarchyLevel: 50 },
  ],
  permissionTemplates: [{ id: TEMPLATE, name: 'Manager' }],
};

const editingUser = {
  id: '50000000-0000-4000-8000-000000000000',
  fullName: 'Sara Agent',
  username: 'sara',
  email: 'sara@alpha.test',
  phone: '+919999999999',
  status: 'ACTIVE' as const,
  emailVerified: true,
  emailVerifiedAt: '2026-01-01',
  lastLoginAt: null,
  mustChangePassword: false,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  role: { id: ROLE_SALES, name: 'Sales Executive', hierarchyLevel: 50 },
  permissionTemplate: { id: TEMPLATE, name: 'Manager' },
  effectivePermissions: ['users.view'],
  recentActivity: [],
};

describe('UserForm edit does not send password', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    authState.permissions = new Set(['users.view', 'users.update', 'users.assign_role']);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        response(String(input).includes('/lookups') ? lookups : editingUser),
      ),
    );
  });

  it('the update contract (updateUserSchema) never carries password fields', async () => {
    // The backend update schema is the contract for the role-edit PATCH. Even
    // if a client somehow attached password keys, zod strips them — so a role
    // change can never alter passwordHash. This is the defence-in-depth proof
    // behind the UI (which also never renders password inputs in edit mode).
    const parsed = updateUserSchema.parse({
      fullName: 'Sara Agent',
      roleId: ROLE_MANAGER,
      password: 'hacked',
      passwordHash: 'h',
      confirmPassword: 'c',
      temporaryPassword: 't',
      confirmTemporaryPassword: 'c',
    });
    expect(parsed.roleId).toBe(ROLE_MANAGER);
    expect(parsed).not.toHaveProperty('password');
    expect(parsed).not.toHaveProperty('passwordHash');
    expect(parsed).not.toHaveProperty('confirmPassword');
    expect(parsed).not.toHaveProperty('temporaryPassword');
    expect(parsed).not.toHaveProperty('confirmTemporaryPassword');
  });

  it('does not render password fields while editing an existing user', () => {
    renderWithProviders(
      <UserForm user={editingUser} onSubmit={() => {}} isLoading={false} />,
    );
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Confirm password')).not.toBeInTheDocument();
  });
});

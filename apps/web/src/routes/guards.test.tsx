import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { ProtectedRoute, PublicOnlyRoute, VerificationRoute } from './guards';

/**
 * The guards are a UX layer over the server's real checks, so these tests
 * assert redirect behaviour for each session state rather than security.
 */

type MeState = 'anonymous' | 'verified' | 'pending';

function stubMe(state: MeState) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      if (state === 'anonymous') {
        return {
          ok: false,
          status: 401,
          json: async () => ({ success: false, error: { code: 'UNAUTHORIZED', message: 'no' } }),
        } as Response;
      }

      const user = {
        id: 'u1',
        fullName: 'Test User',
        username: 'test',
        email: 'test@example.com',
        phone: null,
        status: state === 'verified' ? 'ACTIVE' : 'PENDING_VERIFICATION',
        emailVerified: state === 'verified',
        emailVerifiedAt: state === 'verified' ? '2026-01-01T00:00:00Z' : null,
        lastLoginAt: null,
        mustChangePassword: false,
        company: { id: 'c1', name: 'Co', slug: 'co' },
        role: { id: 'r1', name: 'Owner', hierarchyLevel: 100 },
        permissions: ['dashboard.view'],
      };

      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { user, session: { expiresAt: '', rememberMe: false } },
        }),
      } as Response;
    }),
  );
}

function renderGuards(route: string) {
  return renderWithProviders(
    <AuthProvider>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<div>Dashboard content</div>} />
        </Route>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<div>Login content</div>} />
        </Route>
        <Route element={<VerificationRoute />}>
          <Route path="/verify-email" element={<div>Verify content</div>} />
        </Route>
      </Routes>
    </AuthProvider>,
    { route },
  );
}

describe('Route guards', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('redirects an unauthenticated visitor away from a protected route', async () => {
    stubMe('anonymous');
    renderGuards('/dashboard');

    // Bounced to /login, so the dashboard never renders.
    await waitFor(() => {
      expect(screen.getByText('Login content')).toBeInTheDocument();
    });
    expect(screen.queryByText('Dashboard content')).not.toBeInTheDocument();
  });

  it('lets a verified user into a protected route', async () => {
    stubMe('verified');
    renderGuards('/dashboard');

    await waitFor(() => {
      expect(screen.getByText('Dashboard content')).toBeInTheDocument();
    });
  });

  it('redirects a pending-verification user to /verify-email', async () => {
    stubMe('pending');
    renderGuards('/dashboard');

    await waitFor(() => {
      expect(screen.getByText('Verify content')).toBeInTheDocument();
    });
  });

  it('redirects an authenticated user away from a public-only route', async () => {
    stubMe('verified');
    renderGuards('/login');

    // A signed-in user on /login is sent to /dashboard.
    await waitFor(() => {
      expect(screen.getByText('Dashboard content')).toBeInTheDocument();
    });
    expect(screen.queryByText('Login content')).not.toBeInTheDocument();
  });

  it('redirects a verified user away from /verify-email', async () => {
    stubMe('verified');
    renderGuards('/verify-email');

    await waitFor(() => {
      expect(screen.getByText('Dashboard content')).toBeInTheDocument();
    });
  });
});

import { Navigate, Route, Routes } from 'react-router-dom';
import { SystemStatusPage } from '@/pages/SystemStatusPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

/**
 * Phase 1 route table.
 *
 * Phase 3 introduces ProtectedRoute plus /signup, /verify-email, /login,
 * /forgot-password, /reset-password/:token and the authenticated CRM shell.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<SystemStatusPage />} />
      <Route path="/status" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

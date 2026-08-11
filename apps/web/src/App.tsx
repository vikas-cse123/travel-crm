import { BrowserRouter } from 'react-router-dom';
import { QueryProvider } from '@/providers/QueryProvider';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { AppRoutes } from '@/routes/AppRoutes';
import { RouteErrorBoundary } from '@/components/feedback/AppErrorBoundary';
import { ImageDropPasteManager } from '@/components/media/ImageDropPasteManager';

/**
 * Provider order matters: AuthProvider reads the session through TanStack
 * Query, and the route guards read AuthProvider — so Query wraps Auth, and
 * Auth wraps the router. ThemeProvider is purely presentational and wraps the
 * whole tree so any screen can read or change the appearance mode.
 */
export function App() {
  return (
    <ThemeProvider>
      <ImageDropPasteManager />
      <QueryProvider>
        <AuthProvider>
          <BrowserRouter>
            <RouteErrorBoundary>
              <AppRoutes />
            </RouteErrorBoundary>
          </BrowserRouter>
        </AuthProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}

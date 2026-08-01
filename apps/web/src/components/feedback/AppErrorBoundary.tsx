import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

interface Props {
  children: ReactNode;
  resetKey?: string;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidUpdate(previous: Props) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Travel CRM UI crashed', { error, componentStack: info.componentStack });
  }

  override render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div
          role="alert"
          className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm"
        >
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-foreground">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The page could not finish loading. Refresh and try again.
          </p>
          {import.meta.env.DEV && (
            <p className="mt-3 rounded-lg bg-muted p-3 text-left font-mono text-xs text-muted-foreground">
              {this.state.error.message}
            </p>
          )}
          <Button className="mt-5" onClick={() => window.location.reload()}>
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Refresh
          </Button>
        </div>
      </div>
    );
  }
}

export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <AppErrorBoundary resetKey={`${location.pathname}${location.search}`}>
      {children}
    </AppErrorBoundary>
  );
}

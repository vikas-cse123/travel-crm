import type { ReactElement } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { QueryProvider } from '@/providers/QueryProvider';

/**
 * Render a component inside the providers it expects.
 *
 * A retry-free query client keeps tests fast and deterministic, and
 * MemoryRouter supplies routing context without a real browser history.
 */
export function renderWithProviders(
  ui: ReactElement,
  options: { route?: string; renderOptions?: RenderOptions } = {},
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryProvider client={client}>
      <MemoryRouter initialEntries={[options.route ?? '/']}>{ui}</MemoryRouter>
    </QueryProvider>,
    options.renderOptions,
  );
}

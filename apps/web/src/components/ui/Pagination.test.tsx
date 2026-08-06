import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Pagination } from './Pagination';

describe('Pagination (shared Masters/Leads footer)', () => {
  it('shows the correct entries summary', () => {
    render(<Pagination page={2} pageSize={10} totalPages={3} total={25} onPage={vi.fn()} />);
    expect(screen.getByText('Showing 11 to 20 of 25 entries')).toBeInTheDocument();
  });

  it('renders numbered page buttons with the active page marked', () => {
    render(<Pagination page={2} pageSize={10} totalPages={3} total={25} onPage={vi.fn()} />);
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    const current = screen.getByRole('button', { name: '2' });
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: '3' })).toBeInTheDocument();
  });

  it('disables Previous on the first page and Next on the last page', () => {
    const first = render(
      <Pagination page={1} pageSize={10} totalPages={3} total={25} onPage={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    first.unmount();

    render(<Pagination page={3} pageSize={10} totalPages={3} total={25} onPage={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('calls onPage for Previous, Next and numbered pages', () => {
    const onPage = vi.fn();
    render(<Pagination page={2} pageSize={10} totalPages={3} total={25} onPage={onPage} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onPage).toHaveBeenLastCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPage).toHaveBeenLastCalledWith(3);
    fireEvent.click(screen.getByRole('button', { name: '1' }));
    expect(onPage).toHaveBeenLastCalledWith(1);
  });

  it('shows a single active page for one-page results', () => {
    render(<Pagination page={1} pageSize={10} totalPages={1} total={4} onPage={vi.fn()} />);
    expect(screen.getByText('Showing 1 to 4 of 4 entries')).toBeInTheDocument();
    const current = screen.getByRole('button', { name: '1' });
    expect(current).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('shows the safe empty range for zero results', () => {
    render(<Pagination page={1} pageSize={10} totalPages={0} total={0} onPage={vi.fn()} />);
    expect(screen.getByText('Showing 0 to 0 of 0 entries')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('never lets the end row exceed the total on the final page', () => {
    render(<Pagination page={3} pageSize={10} totalPages={3} total={25} onPage={vi.fn()} />);
    expect(screen.getByText('Showing 21 to 25 of 25 entries')).toBeInTheDocument();
  });

  it('elides large page ranges with a non-interactive ellipsis', () => {
    render(<Pagination page={7} pageSize={10} totalPages={20} total={200} onPage={vi.fn()} />);
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '20' })).toBeInTheDocument();
    expect(screen.getAllByText('…').length).toBeGreaterThan(0);
  });
});

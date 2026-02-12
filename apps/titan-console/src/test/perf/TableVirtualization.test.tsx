import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VirtualizedTable } from '@/components/ui/virtualized-table';

describe('VirtualizedTable Perf', () => {
  it('renders only visible rows for large datasets', async () => {
    const data = Array.from({ length: 10000 }, (_, i) => ({ id: i, name: `Item ${i}` }));
    const columns = [
      { key: 'id', header: 'ID', cell: (item: { id: number; name: string }) => item.id },
      { key: 'name', header: 'Name', cell: (item: { id: number; name: string }) => item.name },
    ];

    render(<VirtualizedTable data={data} columns={columns} height={400} rowHeight={40} />);

    // Only ~10-20 items should be in the DOM (visible + overscan)
    const rows = screen.getAllByRole('row');
    expect(rows.length).toBeLessThan(50); // Header + ~10 visible + ~10 buffer
    expect(rows.length).toBeGreaterThan(0);
  });
});

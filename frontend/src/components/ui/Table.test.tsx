import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Table, Column } from './Table';

describe('Table', () => {
  const columns: Column<{ id: number; name: string; value: number }>[] = [
    { key: 'name', header: 'Name', render: (item) => item.name },
    { key: 'value', header: 'Value', render: (item) => item.value },
  ];

  const data = [
    { id: 1, name: 'Item A', value: 100 },
    { id: 2, name: 'Item B', value: 200 },
  ];

  it('renders table with headers', () => {
    render(<Table columns={columns} data={data} />);
    // Table renders both desktop and mobile views, so use getAllByText
    const nameHeaders = screen.getAllByText('Name');
    expect(nameHeaders.length).toBeGreaterThan(0);
    const valueHeaders = screen.getAllByText('Value');
    expect(valueHeaders.length).toBeGreaterThan(0);
  });

  it('renders table rows with data', () => {
    render(<Table columns={columns} data={data} />);
    // Desktop table + mobile card view both render the data
    const itemAs = screen.getAllByText('Item A');
    expect(itemAs.length).toBeGreaterThan(0);
    const itemBs = screen.getAllByText('Item B');
    expect(itemBs.length).toBeGreaterThan(0);
  });

  it('calls onSort when sortable column header clicked', async () => {
    const onSort = vi.fn();
    render(
      <Table
        columns={columns.map((c) => ({ ...c, sortable: true }))}
        data={data}
        onSort={onSort}
      />
    );
    // Click the button in the header (desktop table view)
    const sortButtons = screen.getAllByText('Name').filter(el => el.tagName === 'BUTTON' || el.closest('button'));
    await userEvent.click(sortButtons[0]);
    expect(onSort).toHaveBeenCalled();
  });

  it('calls onRowClick when row clicked', async () => {
    const onRowClick = vi.fn();
    render(<Table columns={columns} data={data} onRowClick={onRowClick} />);
    // Click on the first Item A in the table body (not mobile view)
    const itemAs = screen.getAllByText('Item A');
    await userEvent.click(itemAs[0]);
    expect(onRowClick).toHaveBeenCalledWith(data[0]);
  });

  it('shows empty state when no data', () => {
    render(<Table columns={columns} data={[]} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('shows loading skeleton rows when loading', () => {
    render(<Table columns={columns} data={[]} loading />);
    const skeletons = document.querySelectorAll('.animate-shimmer');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});

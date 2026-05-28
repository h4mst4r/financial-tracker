import { ReactNode, useState } from 'react';
import { Icon } from './Icon';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render: (item: T) => ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  onSort?: (key: string, direction: 'asc' | 'desc') => void;
  onRowClick?: (item: T) => void;
  loading?: boolean;
  emptyMessage?: string;
}

export const Table = <T,>({
  columns,
  data,
  onSort,
  onRowClick,
  loading = false,
  emptyMessage = 'No data',
}: TableProps<T>) => {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (key: string) => {
    if (!onSort) return;

    if (sortKey !== key) {
      setSortKey(key);
      setSortDirection('asc');
      onSort(key, 'asc');
    } else if (sortDirection === 'asc') {
      setSortDirection('desc');
      onSort(key, 'desc');
    } else {
      setSortKey(null);
      // Pass empty to signal clear sort — consumer should handle
      onSort(key, 'asc');
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} shape="table-row" />
        ))}
      </div>
    );
  }

  if (data.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }

  return (
    <div className="w-full overflow-x-auto">
      {/* Desktop table */}
      <table className="hidden md:w-full md:table">
        <thead className="sticky top-0 bg-surface z-sticky">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3 text-left text-sm font-medium text-text-secondary">
                {col.sortable ? (
                  <button
                    type="button"
                    className="flex items-center gap-1.5 hover:text-text-primary transition-colors group"
                    onClick={() => handleSort(col.key)}
                  >
                    {col.header}
                    <Icon
                      icon={sortKey === col.key ? (sortDirection === 'asc' ? ChevronUp : ChevronDown) : ChevronUp}
                      size="xs"
                      className={`transition-opacity ${sortKey === col.key ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'}`}
                    />
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((item, index) => (
            <tr
              key={index}
              className={`hover:bg-surface-hover transition-colors ${
                onRowClick ? 'cursor-pointer' : ''
              }`}
              onClick={() => onRowClick?.(item)}
            >
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-3 text-sm text-text">
                  {col.render(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile card view */}
      <div className="md:hidden space-y-2">
        {data.map((item, index) => (
          <div
            key={index}
            className={`bg-surface border border-border rounded-lg p-4 space-y-2 ${
              onRowClick ? 'cursor-pointer hover:bg-surface-hover' : ''
            }`}
            onClick={() => onRowClick?.(item)}
          >
            {columns.map((col) => (
              <div key={col.key} className="flex justify-between">
                <span className="text-sm text-text-secondary">{col.header}</span>
                <span className="text-sm text-text">{col.render(item)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

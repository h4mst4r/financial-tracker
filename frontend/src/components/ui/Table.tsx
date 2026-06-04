import { type ReactNode, useState } from 'react';
import { Icon } from './Icon';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render: (item: T) => ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  onSort?: (key: string, direction: 'asc' | 'desc' | null) => void;
  onRowClick?: (item: T) => void;
  loading?: boolean;
  emptyMessage?: string;
  /** Derive a stable row key from each item (falls back to array index) */
  rowKey?: (item: T) => string | number;
  /** Set of selected row keys for visual highlight */
  selectedKeys?: Set<string | number>;
  /** Per-row context menu items — never use inline action buttons per spec §4.7 */
  rowActions?: (item: T) => ContextMenuItem[];
}

export const Table = <T,>({
  columns,
  data,
  onSort,
  onRowClick,
  loading = false,
  emptyMessage = 'No data',
  rowKey,
  selectedKeys,
  rowActions,
}: TableProps<T>) => {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const getRowKey = (item: T, index: number): string | number => {
    if (rowKey) return rowKey(item);
    return (item as Record<string, unknown>).id as string | number ?? `row-${index}`;
  };

  // Three-state sort cycle: asc → desc → clear (null)
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
      onSort(key, null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} shape="table-row" />)}
      </div>
    );
  }

  if (data.length === 0) {
    return <EmptyState title={emptyMessage} />;
  }

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border bg-surface">
      {/* Desktop table */}
      <table className="hidden md:w-full md:table">
        <thead className="sticky top-0 bg-surface-raised z-sticky border-b-2 border-border-light">
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
            {rowActions && <th className="w-10" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((item, index) => {
            const key = getRowKey(item, index);
            const isSelected = selectedKeys?.has(key) ?? false;
            return (
              <tr
                key={key}
                className={`transition-colors duration-fast ${
                  isSelected
                    ? 'bg-primary-muted'
                    : 'even:bg-surface-raised hover:bg-surface-hover'
                } ${onRowClick ? 'cursor-pointer' : ''}`}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-sm text-text-primary">
                    {col.render(item)}
                  </td>
                ))}
                {rowActions && (
                  <td
                    className="px-2 py-2 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ContextMenu items={rowActions(item)} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile card view */}
      <div className="md:hidden space-y-2">
        {data.map((item, index) => {
          const key = getRowKey(item, index);
          const isSelected = selectedKeys?.has(key) ?? false;
          return (
            <div
              key={key}
              className={`bg-surface border rounded-lg p-4 space-y-2 ${
                isSelected ? 'border-primary bg-primary-muted' : 'border-border'
              } ${onRowClick ? 'cursor-pointer hover:bg-surface-hover' : ''}`}
              onClick={() => onRowClick?.(item)}
            >
              {rowActions && (
                <div
                  className="flex justify-end"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ContextMenu items={rowActions(item)} />
                </div>
              )}
              {columns.map((col) => (
                <div key={col.key} className="flex justify-between">
                  <span className="text-sm text-text-secondary">{col.header}</span>
                  <span className="text-sm text-text-primary">{col.render(item)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

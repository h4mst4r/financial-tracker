import { type ReactNode } from 'react';

export const SkeletonShapes = {
  card: 'card',
  tableRow: 'table-row',
  chart: 'chart',
  stat: 'stat',
} as const;

export type SkeletonShape = (typeof SkeletonShapes)[keyof typeof SkeletonShapes];

interface SkeletonProps {
  shape?: SkeletonShape;
  className?: string;
}

const shimmerBase = `shimmer-gradient animate-shimmer`;

const CardSkeleton = () => (
  <div className="w-full rounded-lg border border-border bg-surface p-4 space-y-3">
    <div className={`h-4 rounded w-3/4 ${shimmerBase}`} />
    <div className={`h-3 rounded w-full ${shimmerBase}`} />
    <div className={`h-3 rounded w-2/3 ${shimmerBase}`} />
  </div>
);

const TableRowSkeleton = () => (
  <div className="flex gap-4 w-full px-4 py-3">
    <div className={`h-4 rounded flex-col-half ${shimmerBase}`} />
    <div className={`h-4 rounded flex-1 ${shimmerBase}`} />
    <div className={`h-4 rounded flex-1 ${shimmerBase}`} />
    <div className={`h-4 rounded flex-col-4-5 ${shimmerBase}`} />
    <div className={`h-4 rounded flex-col-7-10 ${shimmerBase}`} />
  </div>
);

const ChartSkeleton = () => (
  <div className="w-full rounded-lg border border-border bg-surface p-3 space-y-2">
    <div className={`h-48 rounded w-full ${shimmerBase}`} />
    <div className="flex justify-between">
      <div className={`h-3 rounded w-1/5 ${shimmerBase}`} />
      <div className={`h-3 rounded w-1/5 ${shimmerBase}`} />
      <div className={`h-3 rounded w-1/5 ${shimmerBase}`} />
    </div>
  </div>
);

const StatSkeleton = () => (
  <div className="w-full rounded-lg border border-border bg-surface p-4 space-y-2">
    <div className={`h-10 rounded w-1/2 ${shimmerBase}`} />
    <div className={`h-4 rounded w-2/3 ${shimmerBase}`} />
  </div>
);

const shapeComponents: Record<SkeletonShape, ReactNode> = {
  card: <CardSkeleton />,
  'table-row': <TableRowSkeleton />,
  chart: <ChartSkeleton />,
  stat: <StatSkeleton />,
};

export const Skeleton = ({ shape = 'card', className = '' }: SkeletonProps) => {
  return <div className={className}>{shapeComponents[shape]}</div>;
};

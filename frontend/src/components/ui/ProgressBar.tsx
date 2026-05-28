interface ProgressBarProps {
  value: number;
  max?: number;
  variant?: 'default' | 'budget';
  height?: 'sm' | 'md';
  showLabel?: boolean;
}

const heightClasses = {
  sm: 'h-1',
  md: 'h-2',
};

export const ProgressBar = ({
  value,
  max = 100,
  variant = 'default',
  height = 'md',
  showLabel = false,
}: ProgressBarProps) => {
  const percentage = Math.min((value / max) * 100, 100);

  let fillColor = 'bg-primary';
  if (variant === 'budget') {
    const pct = (value / max) * 100;
    if (pct >= 100) {
      fillColor = 'bg-error';
    } else if (pct >= 80) {
      fillColor = 'bg-warning';
    } else {
      fillColor = 'bg-success';
    }
  }

  return (
    <div className="w-full">
      <div className="w-full bg-border rounded-full overflow-hidden">
        <div
          className={`${heightClasses[height]} ${fillColor} rounded-full transition-all duration-slow ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-text-secondary mt-1 block">
          {Math.round((value / max) * 100)}%
        </span>
      )}
    </div>
  );
};

import { useEffect, useState } from 'react';

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
  const [animatedPercentage, setAnimatedPercentage] = useState(0);
  const targetPercentage = Math.min((value / max) * 100, 100);

  // Set width after first paint so CSS transition animates from 0 → value (E65)
  useEffect(() => {
    setAnimatedPercentage(targetPercentage);
  }, [targetPercentage]);

  let fillColor = 'bg-primary';
  if (variant === 'budget') {
    if (targetPercentage >= 100) {
      fillColor = 'bg-error';
    } else if (targetPercentage >= 80) {
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
          style={{ width: `${animatedPercentage}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-text-secondary mt-1 block">
          {Math.round(animatedPercentage)}%
        </span>
      )}
    </div>
  );
};

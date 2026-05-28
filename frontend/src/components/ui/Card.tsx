import { ReactNode } from 'react';

export const CardVariants = {
  default: 'default',
  stat: 'stat',
  elevated: 'elevated',
  ghost: 'ghost',
} as const;

export type CardVariant = (typeof CardVariants)[keyof typeof CardVariants];

interface CardProps {
  variant?: CardVariant;
  entityAccent?: string;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

const variantClasses: Record<CardVariant, string> = {
  default: 'card-default bg-surface border border-border',
  stat: 'card-stat bg-surface border border-border text-center hover:shadow-lg',
  elevated: 'card-elevated bg-surface-raised border border-border shadow-md',
  ghost: 'card-ghost',
};

export const Card = ({
  variant = 'default',
  entityAccent,
  children,
  className = '',
  style,
  onClick,
}: CardProps) => {
  const baseClasses = `rounded-lg p-4 transition-all duration-normal ease-out`;

  const hoverClasses = onClick
    ? 'cursor-pointer hover:shadow-md hover:lift'
    : variant === 'elevated'
      ? ''
      : 'hover:shadow-md hover:lift';

  const variantClass = variantClasses[variant];

  const mergedStyle = entityAccent
    ? {
        '--accent': `var(${entityAccent})`,
        borderLeft: '4px solid var(--accent)',
        ...style,
      } as React.CSSProperties
    : style;

  return (
    <div
      className={`${baseClasses} ${hoverClasses} ${variantClass} ${className}`}
      style={mergedStyle}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

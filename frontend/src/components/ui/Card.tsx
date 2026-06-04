import type React from 'react';
import { type ReactNode } from 'react';

export const CardVariants = {
  default:  'default',
  stat:     'stat',
  elevated: 'elevated',
  ghost:    'ghost',
} as const;

export type CardVariant = (typeof CardVariants)[keyof typeof CardVariants];

interface CardProps {
  variant?: CardVariant;
  entityAccent?: string;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
}

const variantClasses: Record<CardVariant, string> = {
  default:  'bg-surface border border-border',
  stat:     'bg-surface border border-border text-center',
  elevated: 'bg-surface-raised border border-border shadow-card',
  ghost:    '',
};

const hoverClasses: Record<CardVariant, string> = {
  default:  'hover:shadow-card hover:lift',
  stat:     'hover:shadow-card hover:lift',
  elevated: 'hover:shadow-elevated hover:lift',
  ghost:    'hover:bg-surface-hover',
};

export const Card = ({
  variant = 'default',
  entityAccent,
  children,
  className = '',
  style,
  onClick,
}: CardProps) => {
  const baseClasses = 'rounded-lg p-4 transition-all duration-normal ease-out';
  const variantClass = variantClasses[variant];
  // default/stat/elevated always get hover depth; ghost only when explicitly clickable
  const alwaysInteractive = variant !== 'ghost';
  const interactionClass = (onClick || alwaysInteractive)
    ? `${hoverClasses[variant]} ${onClick ? 'cursor-pointer' : ''}`
    : '';

  // Entity accent bar: inline style wins over any class (specificity 1-0-0-0),
  // so it is immune to cascade conflicts with Tailwind's border shorthand.
  // --entity-accent CSS var is also set so bg-entity-accent-muted / text-entity-accent
  // utilities on child elements can read the same value without prop drilling.
  const mergedStyle: React.CSSProperties | undefined = entityAccent
    ? ({
        '--entity-accent': entityAccent,
        borderLeft: '4px solid var(--entity-accent)',
        ...style,
      } as React.CSSProperties)
    : style;

  return (
    <div
      className={`${baseClasses} ${variantClass} ${interactionClass} ${className}`}
      style={mergedStyle}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(e as unknown as React.MouseEvent); } }
          : undefined
      }
    >
      {children}
    </div>
  );
};

import React from 'react';
import type { LucideIcon } from 'lucide-react';

const sizeMap = {
	xs: 12,
	sm: 16,
	md: 20,
	lg: 24,
	xl: 32,
} as const;

export type IconSize = keyof typeof sizeMap;

interface IconProps {
	icon: LucideIcon;
	size?: IconSize;
	decorative?: boolean;
	'aria-label'?: string;
	className?: string;
}

export const Icon: React.FC<IconProps> = ({
	icon: IconComponent,
	size = 'md',
	decorative = true,
	'aria-label': ariaLabel,
	className = '',
}) => {
	const dimension = sizeMap[size];

	return (
		<IconComponent
			size={dimension}
			className={`inline-flex currentColor ${className}`}
			aria-hidden={decorative ? 'true' : undefined}
			aria-label={decorative ? undefined : ariaLabel}
			strokeWidth={1.5}
		/>
	);
};

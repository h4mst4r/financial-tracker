import React, { useState } from 'react';

const sizeMap = {
	sm: 24,
	md: 32,
	lg: 40,
	xl: 56,
} as const;

export type AvatarSize = keyof typeof sizeMap;

interface AvatarProps {
	size?: AvatarSize;
	pictureUrl?: string;
	name?: string;
	archived?: boolean;
	className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
	size = 'md',
	pictureUrl,
	name,
	archived = false,
	className = '',
}) => {
	const [imgError, setImgError] = useState(false);
	const dimension = sizeMap[size];
	const fontSize = size === 'sm' ? 8 : size === 'md' ? 10 : size === 'lg' ? 12 : 16;

	const getInitials = (name: string): string => {
		const parts = name.trim().split(/\s+/);
		if (parts.length >= 2) {
			return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
		}
		return parts[0]?.slice(0, 2).toUpperCase() ?? '?';
	};

	const initials = name ? getInitials(name) : '?';

	const stateClasses = archived ? 'grayscale opacity-50' : '';

	if (pictureUrl && !imgError) {
		return (
			<img
				src={pictureUrl}
				alt={name ?? 'Avatar'}
				width={dimension}
				height={dimension}
				className={`rounded-full object-cover ${stateClasses} ${className}`}
				onError={() => setImgError(true)}
			/>
		);
	}

	return (
		<div
			className={`rounded-full flex items-center justify-center ${stateClasses} ${className}`}
			style={{
				width: dimension,
				height: dimension,
				fontSize: `${fontSize}px`,
				backgroundColor: 'var(--color-entity-person, var(--color-primary))',
				color: 'var(--color-text-inverse)',
				fontWeight: 600,
			}}
			role="img"
			aria-label={name ?? 'Avatar'}
		>
			{initials}
		</div>
	);
};

interface AvatarStackProps {
	avatars: Array<{ url?: string; name?: string }>;
	maxVisible?: number;
	size?: AvatarSize;
	className?: string;
}

export const AvatarStack: React.FC<AvatarStackProps> = ({
	avatars,
	maxVisible = 3,
	size = 'md',
	className = '',
}) => {
	const visible = avatars.slice(0, maxVisible);
	const overflow = avatars.length - maxVisible;

	return (
		<div className={`flex items-center ${className}`}>
			{visible.map((avatar, i) => (
				<div key={i} className={i > 0 ? '-ml-1.5 first:ml-0' : ''}>
					<Avatar size={size} pictureUrl={avatar.url} name={avatar.name} />
				</div>
			))}
			{overflow > 0 && (
				<div
					className="-ml-1.5 flex items-center justify-center rounded-full bg-surface-hover border border-border text-xs font-medium text-text-secondary"
					style={{
						width: sizeMap[size],
						height: sizeMap[size],
					}}
					role="img"
					aria-label={`${overflow} more`}
				>
					+{overflow}
				</div>
			)}
		</div>
	);
};

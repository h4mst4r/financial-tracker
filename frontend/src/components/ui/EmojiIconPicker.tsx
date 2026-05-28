import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import * as LucideIcons from 'lucide-react';

const EMOJI_GROUPS: Array<{ name: string; emojis: Array<{ char: string; name: string }> }> = [
	{
		name: 'Smileys',
		emojis: [
			{ char: '😀', name: 'grinning' },
			{ char: '😃', name: 'smiley' },
			{ char: '😄', name: 'smile' },
			{ char: '😁', name: 'grin' },
			{ char: '😆', name: 'laughing' },
			{ char: '😅', name: 'sweat smile' },
			{ char: '🤣', name: 'rofl' },
			{ char: '😂', name: 'joy' },
			{ char: '🙂', name: 'slight smile' },
			{ char: '😉', name: 'wink' },
			{ char: '😊', name: 'blush' },
			{ char: '😇', name: 'angel' },
			{ char: '🥰', name: 'hearts' },
			{ char: '😍', name: 'love' },
			{ char: '🤩', name: 'star struck' },
			{ char: '😘', name: 'kiss' },
			{ char: '😗', name: 'kissing' },
			{ char: '😚', name: 'kissing blush' },
			{ char: '😙', name: 'kissing smile' },
			{ char: '😋', name: 'yum' },
			{ char: '😛', name: 'stuck out tongue' },
			{ char: '😜', name: 'wink tongue' },
			{ char: '🤪', name: 'zany' },
			{ char: '😝', name: 'squint tongue' },
			{ char: '🤑', name: 'money mouth' },
			{ char: '🤗', name: 'hugs' },
			{ char: '🤭', name: 'hand over mouth' },
			{ char: '🤫', name: 'shh' },
			{ char: '🤔', name: 'thinking' },
			{ char: '🤐', name: 'zipper mouth' },
		],
	},
	{
		name: ' Gestures',
		emojis: [
			{ char: '👍', name: 'thumbs up' },
			{ char: '👎', name: 'thumbs down' },
			{ char: '👏', name: 'clap' },
			{ char: '🙌', name: 'raised hands' },
			{ char: '🤝', name: 'handshake' },
			{ char: '👏', name: 'pray' },
			{ char: '💪', name: 'muscle' },
			{ char: '✌️', name: 'victory' },
			{ char: '🤞', name: 'crossed fingers' },
			{ char: '👌', name: 'ok hand' },
		],
	},
	{
		name: 'Objects',
		emojis: [
			{ char: '💰', name: 'money bag' },
			{ char: '💵', name: 'dollar' },
			{ char: '💳', name: 'credit card' },
			{ char: '📊', name: 'chart increasing' },
			{ char: '📈', name: 'chart' },
			{ char: '🎯', name: 'dart' },
			{ char: '⚡', name: 'zap' },
			{ char: '🔥', name: 'fire' },
			{ char: '⭐', name: 'star' },
			{ char: '❤️', name: 'heart' },
		],
	},
];

// Curated subset of commonly used Lucide icons for the picker
const LUCIDE_SUBSET: Array<{ name: string; icon: LucideIcon }> = [
	{ name: 'Home', icon: LucideIcons.Home },
	{ name: 'User', icon: LucideIcons.User },
	{ name: 'Settings', icon: LucideIcons.Settings },
	{ name: 'Search', icon: LucideIcons.Search },
	{ name: 'Heart', icon: LucideIcons.Heart },
	{ name: 'Star', icon: LucideIcons.Star },
	{ name: 'Bell', icon: LucideIcons.Bell },
	{ name: 'Mail', icon: LucideIcons.Mail },
	{ name: 'Calendar', icon: LucideIcons.Calendar },
	{ name: 'Camera', icon: LucideIcons.Camera },
	{ name: 'Image', icon: LucideIcons.Image },
	{ name: 'Video', icon: LucideIcons.Video },
	{ name: 'Music', icon: LucideIcons.Music },
	{ name: 'Book', icon: LucideIcons.Book },
	{ name: 'Gift', icon: LucideIcons.Gift },
	{ name: 'Flag', icon: LucideIcons.Flag },
	{ name: 'Map', icon: LucideIcons.Map },
	{ name: 'Clock', icon: LucideIcons.Clock },
	{ name: 'Check', icon: LucideIcons.Check },
	{ name: 'X', icon: LucideIcons.X },
	{ name: 'Plus', icon: LucideIcons.Plus },
	{ name: 'Minus', icon: LucideIcons.Minus },
	{ name: 'ArrowUp', icon: LucideIcons.ArrowUp },
	{ name: 'ArrowDown', icon: LucideIcons.ArrowDown },
	{ name: 'ChevronRight', icon: LucideIcons.ChevronRight },
	{ name: 'ChevronLeft', icon: LucideIcons.ChevronLeft },
	{ name: 'Download', icon: LucideIcons.Download },
	{ name: 'Upload', icon: LucideIcons.Upload },
	{ name: 'Trash', icon: LucideIcons.Trash },
	{ name: 'Edit', icon: LucideIcons.Edit },
	{ name: 'Eye', icon: LucideIcons.Eye },
	{ name: 'Lock', icon: LucideIcons.Lock },
	{ name: 'Unlock', icon: LucideIcons.Unlock },
	{ name: 'AlertCircle', icon: LucideIcons.AlertCircle },
	{ name: 'AlertTriangle', icon: LucideIcons.AlertTriangle },
	{ name: 'Info', icon: LucideIcons.Info },
	{ name: 'HelpCircle', icon: LucideIcons.HelpCircle },
	{ name: 'Shield', icon: LucideIcons.Shield },
	{ name: 'Zap', icon: LucideIcons.Zap },
];

interface EmojiIconPickerOwnProps {
	value?: string;
	onChange: (value: string, type: 'emoji' | 'icon') => void;
	disabled?: boolean;
	className?: string;
}

export type EmojiIconPickerProps = EmojiIconPickerOwnProps &
	Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'size'>;

export const EmojiIconPicker: React.FC<EmojiIconPickerProps> = ({
	value,
	onChange,
	disabled = false,
	className = '',
	...rest
}) => {
	const [open, setOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const [mode, setMode] = useState<'emoji' | 'icon'>('emoji');
	const [recentlyUsed, setRecentlyUsed] = useState<Array<{ value: string; type: 'emoji' | 'icon' }>>([]);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);

	const handleOpen = useCallback(() => {
		if (disabled) return;
		setOpen(true);
	}, [disabled]);

	const handleClose = useCallback(() => {
		setOpen(false);
		setSearchQuery('');
	}, []);

	const handleSelect = useCallback(
		(selectedValue: string, type: 'emoji' | 'icon') => {
			onChange(selectedValue, type);
			setRecentlyUsed((prev) => {
				const filtered = prev.filter((r) => r.value !== selectedValue);
				return [{ value: selectedValue, type }, ...filtered].slice(0, 10);
			});
			setOpen(false);
			setSearchQuery('');
		},
		[onChange]
	);

	useEffect(() => {
		if (!open) return;

		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (
				buttonRef.current &&
				!buttonRef.current.contains(target) &&
				panelRef.current &&
				!panelRef.current.contains(target)
			) {
				setOpen(false);
				setSearchQuery('');
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [open]);

	// Filter based on search
	const filteredGroups = EMOJI_GROUPS.map((group) => ({
		...group,
		emojis: group.emojis.filter(
			(e) => !searchQuery || e.name.toLowerCase().includes(searchQuery.toLowerCase())
		),
	})).filter((g) => g.emojis.length > 0);

	const filteredIcons = LUCIDE_SUBSET.filter(
		(i) => !searchQuery || i.name.toLowerCase().includes(searchQuery.toLowerCase())
	);

	const getDisplayContent = () => {
		if (!value) return null;
		// Check if it's an emoji (single character or known emoji)
		const isEmoji = recentlyUsed.some((r) => r.value === value && r.type === 'emoji');
		if (isEmoji) return <span className="text-lg">{value}</span>;

		// Check if it's a Lucide icon name
		const lucideMatch = LUCIDE_SUBSET.find((i) => i.name === value);
		if (lucideMatch) {
			const IconComponent = lucideMatch.icon;
			return <IconComponent size={16} />;
		}

		// Default: render as text
		return value;
	};

	return (
		<div className={`relative w-full ${className}`}>
			{/* Trigger button */}
			<button
				ref={buttonRef}
				type="button"
				className={`
					h-10 px-3 rounded-md text-sm
					bg-surface-raised border border-border text-text-primary
					transition-colors duration-150
					inline-flex items-center gap-2 min-w-emoji-btn
					${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-border-light'}
					${open ? 'border-accent ring-2 ring-accent/20' : ''}
				`}
				onClick={handleOpen}
				disabled={disabled}
				{...rest}
			>
				{getDisplayContent() || <span className="text-text-muted">Select</span>}
			</button>

			{/* Picker panel */}
			{open && createPortal(
				<div
					ref={panelRef}
					className="fixed z-dropdown"
					style={{
						left: buttonRef.current?.getBoundingClientRect().left,
						top: buttonRef.current?.getBoundingClientRect().bottom + 4,
					}}
				>
					<div className="w-emoji-picker bg-surface-raised border border-border rounded-md shadow-lg p-3">
						{/* Search */}
						<div className="relative mb-2">
						<Search
							size={14}
							className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
						/>
						<input
							type="text"
							className="w-full h-8 pl-8 pr-3 rounded text-xs bg-surface border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/20 focus:border-accent"
							placeholder="Search..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
					</div>

					{/* Tabs */}
					<div className="flex gap-1 mb-2">
						<button
							type="button"
							className={`
								flex-1 text-xs py-1.5 rounded transition-colors
								${mode === 'emoji'
									? 'bg-accent/20 text-accent font-medium'
									: 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
								}
							`}
							onClick={() => setMode('emoji')}
						>
							Emojis
						</button>
						<button
							type="button"
							className={`
								flex-1 text-xs py-1.5 rounded transition-colors
								${mode === 'icon'
									? 'bg-accent/20 text-accent font-medium'
									: 'text-text-muted hover:text-text-primary hover:bg-surface-hover'
								}
							`}
							onClick={() => setMode('icon')}
						>
							Icons
						</button>
					</div>

					{/* Recently used */}
					{recentlyUsed.length > 0 && !searchQuery && (
						<div className="mb-2 pb-2 border-b border-border">
							<div className="flex gap-1 flex-wrap">
								{recentlyUsed.map((item) => {
									const isEmoji = item.type === 'emoji';
									const lucideMatch = LUCIDE_SUBSET.find((i) => i.name === item.value);
									return (
										<button
											key={item.value}
											type="button"
											className="w-8 h-8 rounded hover:bg-surface-hover flex items-center justify-center transition-colors text-lg"
											onClick={() => handleSelect(item.value, item.type)}
										>
											{isEmoji ? (
												item.value
											) : lucideMatch ? (
												<lucideMatch.icon size={16} />
											) : (
												item.value
											)}
										</button>
									);
								})}
							</div>
						</div>
					)}

					{/* Content grid */}
					<div className="max-h-48 overflow-auto">
						{mode === 'emoji' ? (
							filteredGroups.map((group) => (
								<div key={group.name} className="mb-2">
									<div className="text-xs font-medium text-text-muted mb-1">{group.name}</div>
									<div className="grid grid-cols-10 gap-0">
										{group.emojis.map((emoji) => (
											<button
												key={emoji.char}
												type="button"
												className="w-10 h-10 rounded hover:bg-surface-hover flex items-center justify-center transition-colors text-lg"
												title={emoji.name}
												onClick={() => handleSelect(emoji.char, 'emoji')}
											>
												{emoji.char}
											</button>
										))}
									</div>
								</div>
							))
						) : (
						<div className="grid grid-cols-8 gap-0">
								{filteredIcons.map((item) => (
									<button
										key={item.name}
										type="button"
										className="w-10 h-10 rounded hover:bg-surface-hover flex items-center justify-center transition-colors text-text-primary"
										title={item.name}
										onClick={() => handleSelect(item.name, 'icon')}
									>
										<item.icon size={16} />
									</button>
								))}
							</div>
						)}
						</div>
					</div>
				</div>,
				document.body
			)}
		</div>
	);
};

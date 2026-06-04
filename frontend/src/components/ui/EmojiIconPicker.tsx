import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useFloatingPosition } from '../../hooks/useFloatingPosition';
import { Search, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import * as LucideIcons from 'lucide-react';

const EMOJI_GROUPS: Array<{ name: string; emojis: Array<{ char: string; name: string }> }> = [
	{
		name: 'Finance',
		emojis: [
			{ char: '💰', name: 'money bag' },
			{ char: '💵', name: 'dollar bill' },
			{ char: '💴', name: 'yen bill' },
			{ char: '💶', name: 'euro bill' },
			{ char: '💷', name: 'pound bill' },
			{ char: '💳', name: 'credit card' },
			{ char: '🏦', name: 'bank' },
			{ char: '🏧', name: 'atm' },
			{ char: '💹', name: 'chart increasing with yen' },
			{ char: '📈', name: 'chart increasing' },
			{ char: '📉', name: 'chart decreasing' },
			{ char: '📊', name: 'bar chart' },
			{ char: '🪙', name: 'coin' },
			{ char: '💸', name: 'money with wings' },
			{ char: '🤑', name: 'money mouth' },
			{ char: '🏆', name: 'trophy' },
			{ char: '🎯', name: 'dart' },
			{ char: '📑', name: 'document' },
			{ char: '🧾', name: 'receipt' },
			{ char: '📋', name: 'clipboard' },
		],
	},
	{
		name: 'Food & Drink',
		emojis: [
			{ char: '🍕', name: 'pizza' },
			{ char: '🍔', name: 'burger' },
			{ char: '🍜', name: 'noodles' },
			{ char: '🍱', name: 'bento box' },
			{ char: '🥗', name: 'salad' },
			{ char: '🍣', name: 'sushi' },
			{ char: '🥩', name: 'steak' },
			{ char: '🍳', name: 'cooking' },
			{ char: '🥦', name: 'broccoli' },
			{ char: '🍎', name: 'apple' },
			{ char: '🍺', name: 'beer' },
			{ char: '🍷', name: 'wine' },
			{ char: '☕', name: 'coffee' },
			{ char: '🧃', name: 'juice' },
			{ char: '🧋', name: 'bubble tea' },
			{ char: '🛒', name: 'shopping cart' },
			{ char: '🏪', name: 'convenience store' },
			{ char: '🍰', name: 'cake' },
			{ char: '🍩', name: 'doughnut' },
			{ char: '🍫', name: 'chocolate' },
		],
	},
	{
		name: 'Home & Utilities',
		emojis: [
			{ char: '🏠', name: 'house' },
			{ char: '🏡', name: 'house with garden' },
			{ char: '🏢', name: 'office building' },
			{ char: '🏗️', name: 'construction' },
			{ char: '🔑', name: 'key' },
			{ char: '🪑', name: 'chair' },
			{ char: '🛋️', name: 'couch' },
			{ char: '🛏️', name: 'bed' },
			{ char: '🚿', name: 'shower' },
			{ char: '💡', name: 'lightbulb' },
			{ char: '🔌', name: 'plug' },
			{ char: '📱', name: 'phone' },
			{ char: '💻', name: 'laptop' },
			{ char: '📺', name: 'tv' },
			{ char: '🌊', name: 'water wave' },
			{ char: '♻️', name: 'recycle' },
			{ char: '🧹', name: 'broom' },
			{ char: '🧺', name: 'basket' },
			{ char: '🪴', name: 'plant' },
			{ char: '🌡️', name: 'thermometer' },
		],
	},
	{
		name: 'Transport',
		emojis: [
			{ char: '🚗', name: 'car' },
			{ char: '🚕', name: 'taxi' },
			{ char: '🚙', name: 'suv' },
			{ char: '🚌', name: 'bus' },
			{ char: '🚇', name: 'metro' },
			{ char: '🚂', name: 'train' },
			{ char: '✈️', name: 'airplane' },
			{ char: '🚢', name: 'ship' },
			{ char: '🚲', name: 'bicycle' },
			{ char: '🛵', name: 'scooter' },
			{ char: '⛽', name: 'fuel pump' },
			{ char: '🅿️', name: 'parking' },
			{ char: '🛣️', name: 'highway' },
			{ char: '🗺️', name: 'map' },
		],
	},
	{
		name: 'Health & Fitness',
		emojis: [
			{ char: '🏥', name: 'hospital' },
			{ char: '💊', name: 'pill' },
			{ char: '🩺', name: 'stethoscope' },
			{ char: '🩹', name: 'bandage' },
			{ char: '🧬', name: 'dna' },
			{ char: '🏋️', name: 'weightlifting' },
			{ char: '🏃', name: 'running' },
			{ char: '🧘', name: 'yoga' },
			{ char: '🚴', name: 'cycling' },
			{ char: '⚽', name: 'soccer' },
			{ char: '🎾', name: 'tennis' },
			{ char: '🏊', name: 'swimming' },
			{ char: '💪', name: 'muscle' },
			{ char: '❤️', name: 'heart' },
			{ char: '🧠', name: 'brain' },
		],
	},
	{
		name: 'Shopping & Lifestyle',
		emojis: [
			{ char: '🛍️', name: 'shopping bags' },
			{ char: '👗', name: 'dress' },
			{ char: '👟', name: 'sneaker' },
			{ char: '👔', name: 'shirt' },
			{ char: '💄', name: 'lipstick' },
			{ char: '💍', name: 'ring' },
			{ char: '⌚', name: 'watch' },
			{ char: '👜', name: 'handbag' },
			{ char: '🧴', name: 'lotion' },
			{ char: '💈', name: 'barber' },
			{ char: '✂️', name: 'scissors' },
			{ char: '📦', name: 'package' },
			{ char: '🎁', name: 'gift' },
			{ char: '🏷️', name: 'tag' },
			{ char: '💎', name: 'gem' },
		],
	},
	{
		name: 'Entertainment',
		emojis: [
			{ char: '🎬', name: 'film' },
			{ char: '🎮', name: 'game controller' },
			{ char: '🎵', name: 'music note' },
			{ char: '🎸', name: 'guitar' },
			{ char: '🎤', name: 'microphone' },
			{ char: '🎭', name: 'theater' },
			{ char: '📚', name: 'books' },
			{ char: '🎨', name: 'art' },
			{ char: '🎪', name: 'circus' },
			{ char: '🏖️', name: 'beach' },
			{ char: '🏕️', name: 'camping' },
			{ char: '🎲', name: 'dice' },
			{ char: '🎡', name: 'ferris wheel' },
			{ char: '🎟️', name: 'ticket' },
			{ char: '🎰', name: 'slot machine' },
		],
	},
	{
		name: 'Education & Work',
		emojis: [
			{ char: '🎓', name: 'graduation cap' },
			{ char: '📖', name: 'open book' },
			{ char: '✏️', name: 'pencil' },
			{ char: '📝', name: 'memo' },
			{ char: '🖊️', name: 'pen' },
			{ char: '💼', name: 'briefcase' },
			{ char: '🗂️', name: 'file folder' },
			{ char: '📌', name: 'pin' },
			{ char: '🔬', name: 'microscope' },
			{ char: '🔭', name: 'telescope' },
			{ char: '🖥️', name: 'desktop' },
			{ char: '⌨️', name: 'keyboard' },
			{ char: '🖨️', name: 'printer' },
			{ char: '📡', name: 'satellite' },
			{ char: '🏫', name: 'school' },
		],
	},
];

// Curated Lucide icon groups — finance/lifestyle focused for category usage
const LUCIDE_ICON_GROUPS: Array<{ name: string; icons: Array<{ name: string; icon: LucideIcon }> }> = [
	{
		name: 'Finance',
		icons: [
			{ name: 'Wallet', icon: LucideIcons.Wallet },
			{ name: 'CreditCard', icon: LucideIcons.CreditCard },
			{ name: 'Banknote', icon: LucideIcons.Banknote },
			{ name: 'PiggyBank', icon: LucideIcons.PiggyBank },
			{ name: 'DollarSign', icon: LucideIcons.DollarSign },
			{ name: 'TrendingUp', icon: LucideIcons.TrendingUp },
			{ name: 'TrendingDown', icon: LucideIcons.TrendingDown },
			{ name: 'BarChart2', icon: LucideIcons.BarChart2 },
			{ name: 'LineChart', icon: LucideIcons.LineChart },
			{ name: 'PieChart', icon: LucideIcons.PieChart },
			{ name: 'Receipt', icon: LucideIcons.Receipt },
			{ name: 'Calculator', icon: LucideIcons.Calculator },
			{ name: 'Percent', icon: LucideIcons.Percent },
			{ name: 'Landmark', icon: LucideIcons.Landmark },
			{ name: 'Building2', icon: LucideIcons.Building2 },
			{ name: 'Briefcase', icon: LucideIcons.Briefcase },
		],
	},
	{
		name: 'Home & Utilities',
		icons: [
			{ name: 'Home', icon: LucideIcons.Home },
			{ name: 'Lightbulb', icon: LucideIcons.Lightbulb },
			{ name: 'Wifi', icon: LucideIcons.Wifi },
			{ name: 'Phone', icon: LucideIcons.Phone },
			{ name: 'Tv', icon: LucideIcons.Tv },
			{ name: 'Thermometer', icon: LucideIcons.Thermometer },
			{ name: 'Droplets', icon: LucideIcons.Droplets },
			{ name: 'Flame', icon: LucideIcons.Flame },
			{ name: 'Printer', icon: LucideIcons.Printer },
		],
	},
	{
		name: 'Food & Drink',
		icons: [
			{ name: 'Utensils', icon: LucideIcons.Utensils },
			{ name: 'UtensilsCrossed', icon: LucideIcons.UtensilsCrossed },
			{ name: 'Coffee', icon: LucideIcons.Coffee },
			{ name: 'Wine', icon: LucideIcons.Wine },
			{ name: 'ChefHat', icon: LucideIcons.ChefHat },
			{ name: 'Pizza', icon: LucideIcons.Pizza },
			{ name: 'Apple', icon: LucideIcons.Apple },
			{ name: 'ShoppingCart', icon: LucideIcons.ShoppingCart },
		],
	},
	{
		name: 'Transport',
		icons: [
			{ name: 'Car', icon: LucideIcons.Car },
			{ name: 'Bus', icon: LucideIcons.Bus },
			{ name: 'Train', icon: LucideIcons.Train },
			{ name: 'Plane', icon: LucideIcons.Plane },
			{ name: 'Bike', icon: LucideIcons.Bike },
			{ name: 'Fuel', icon: LucideIcons.Fuel },
		],
	},
	{
		name: 'Health',
		icons: [
			{ name: 'Activity', icon: LucideIcons.Activity },
			{ name: 'Heart', icon: LucideIcons.Heart },
			{ name: 'HeartPulse', icon: LucideIcons.HeartPulse },
			{ name: 'Stethoscope', icon: LucideIcons.Stethoscope },
			{ name: 'Pill', icon: LucideIcons.Pill },
			{ name: 'Dumbbell', icon: LucideIcons.Dumbbell },
		],
	},
	{
		name: 'Shopping',
		icons: [
			{ name: 'ShoppingBag', icon: LucideIcons.ShoppingBag },
			{ name: 'Package', icon: LucideIcons.Package },
			{ name: 'Tag', icon: LucideIcons.Tag },
			{ name: 'Store', icon: LucideIcons.Store },
			{ name: 'Gift', icon: LucideIcons.Gift },
		],
	},
	{
		name: 'Entertainment',
		icons: [
			{ name: 'Gamepad2', icon: LucideIcons.Gamepad2 },
			{ name: 'Headphones', icon: LucideIcons.Headphones },
			{ name: 'Music', icon: LucideIcons.Music },
			{ name: 'Film', icon: LucideIcons.Film },
			{ name: 'BookOpen', icon: LucideIcons.BookOpen },
			{ name: 'GraduationCap', icon: LucideIcons.GraduationCap },
		],
	},
	{
		name: 'Work',
		icons: [
			{ name: 'Laptop', icon: LucideIcons.Laptop },
			{ name: 'Monitor', icon: LucideIcons.Monitor },
			{ name: 'Globe', icon: LucideIcons.Globe },
			{ name: 'Mail', icon: LucideIcons.Mail },
			{ name: 'Bell', icon: LucideIcons.Bell },
		],
	},
	{
		name: 'General',
		icons: [
			{ name: 'Star', icon: LucideIcons.Star },
			{ name: 'Flag', icon: LucideIcons.Flag },
			{ name: 'Map', icon: LucideIcons.Map },
			{ name: 'Clock', icon: LucideIcons.Clock },
			{ name: 'Calendar', icon: LucideIcons.Calendar },
			{ name: 'User', icon: LucideIcons.User },
			{ name: 'Users', icon: LucideIcons.Users },
			{ name: 'Settings', icon: LucideIcons.Settings },
			{ name: 'Lock', icon: LucideIcons.Lock },
			{ name: 'Shield', icon: LucideIcons.Shield },
		],
	},
];

// Flat list derived from groups — used for icon lookup and search
const LUCIDE_SUBSET = LUCIDE_ICON_GROUPS.flatMap((g) => g.icons);

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
	const panelPos = useFloatingPosition(buttonRef, open);

	const handleOpen = useCallback(() => {
		if (disabled) return;
		setOpen(true);
	}, [disabled]);

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
	const filteredEmojiGroups = EMOJI_GROUPS.map((group) => ({
		...group,
		emojis: group.emojis.filter(
			(e) => !searchQuery || e.name.toLowerCase().includes(searchQuery.toLowerCase())
		),
	})).filter((g) => g.emojis.length > 0);

	const filteredIconGroups = LUCIDE_ICON_GROUPS.map((group) => ({
		...group,
		icons: group.icons.filter(
			(i) => !searchQuery || i.name.toLowerCase().includes(searchQuery.toLowerCase())
		),
	})).filter((g) => g.icons.length > 0);

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

	const handleClear = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			onChange('', 'emoji');
		},
		[onChange]
	);

	return (
		<div className={`relative w-full ${className}`}>
			{/* Trigger button */}
			<button
				ref={buttonRef}
				type="button"
				className={`
					h-10 px-3 rounded-md text-sm
					bg-surface-raised border text-text-primary
					transition-colors duration-150
					inline-flex items-center gap-2 min-w-emoji-btn
					${disabled ? 'opacity-50 cursor-not-allowed' : open ? 'border-accent ring-2 ring-glow-accent' : 'border-border hover:border-border-light focus:ring-2 focus:ring-glow-accent focus:border-accent'}
				`}
				onClick={handleOpen}
				disabled={disabled}
				{...rest}
			>
				{getDisplayContent() || <span className="text-text-muted text-sm">Pick emoji or icon…</span>}
				{value && !open && !disabled && (
					<span
						role="button"
						tabIndex={-1}
						aria-label="Clear"
						className="ml-auto text-text-muted hover:text-text-primary cursor-pointer transition-colors"
						onClick={handleClear}
					>
						<X size={14} />
					</span>
				)}
			</button>

			{/* Picker panel */}
			{open && panelPos && createPortal(
				<div
					ref={panelRef}
					className="fixed z-dropdown"
					style={{ top: panelPos.top, left: panelPos.left }}
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
							className="w-full h-8 pl-8 pr-3 rounded text-xs bg-surface border border-border text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-glow-accent focus:border-accent"
							placeholder="Search…"
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
						/>
					</div>

					{/* Tabs */}
					<div className="flex gap-1 mb-2">
						<button
							type="button"
							className={`
								flex-1 text-xs py-1.5 rounded transition-colors focus:outline-none
								${mode === 'emoji'
									? 'bg-accent-active text-accent font-medium'
									: 'text-text-secondary hover:text-text-primary hover:bg-surface-active'
								}
							`}
							onClick={() => setMode('emoji')}
						>
							Emojis
						</button>
						<button
							type="button"
							className={`
								flex-1 text-xs py-1.5 rounded transition-colors focus:outline-none
								${mode === 'icon'
									? 'bg-accent-active text-accent font-medium'
									: 'text-text-secondary hover:text-text-primary hover:bg-surface-active'
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
											className="w-8 h-8 rounded hover:bg-surface-active flex items-center justify-center transition-colors text-lg focus:outline-none"
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
					<div className="max-h-56 overflow-auto">
						{mode === 'emoji' ? (
							filteredEmojiGroups.map((group) => (
								<div key={group.name} className="mb-3">
									<div className="text-xs font-medium text-text-muted mb-1 sticky top-0 bg-surface-raised py-0.5">
										{group.name}
									</div>
									<div className="grid grid-cols-10 gap-0">
										{group.emojis.map((emoji) => (
											<button
												key={`${emoji.char}-${emoji.name}`}
												type="button"
												className="w-10 h-10 rounded hover:bg-surface-active flex items-center justify-center transition-colors text-lg focus:outline-none"
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
							filteredIconGroups.map((group) => (
								<div key={group.name} className="mb-3">
									<div className="text-xs font-medium text-text-muted mb-1 sticky top-0 bg-surface-raised py-0.5">
										{group.name}
									</div>
									<div className="grid grid-cols-8 gap-0">
										{group.icons.map((item) => (
											<button
												key={item.name}
												type="button"
												className="w-10 h-10 rounded hover:bg-surface-active flex items-center justify-center transition-colors text-text-primary focus:outline-none"
												title={item.name}
												onClick={() => handleSelect(item.name, 'icon')}
											>
												<item.icon size={16} />
											</button>
										))}
									</div>
								</div>
							))
						)}
					</div>
					</div>
				</div>,
				document.body
			)}
		</div>
	);
};

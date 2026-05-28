import React, { useMemo } from 'react';
import { Input } from './Input';
import { Dropdown } from './Dropdown';
import type { DropdownOption } from './Dropdown';

interface Currency {
	code: string;
	symbol: string;
}

interface MonetaryValueInputOwnProps {
	currencies: Array<{ code: string; symbol: string }>;
	currency?: string;
	amount?: number | string;
	baseCurrency?: string;
	exchangeRate?: number;
	onChange: (currency: string, amount: number | string) => void;
	disabled?: boolean;
	error?: string;
	className?: string;
}

export type MonetaryValueInputProps = MonetaryValueInputOwnProps &
	Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange' | 'disabled' | 'error'>;

export const MonetaryValueInput: React.FC<MonetaryValueInputProps> = ({
	currencies,
	currency,
	amount,
	baseCurrency,
	exchangeRate,
	onChange,
	disabled = false,
	error,
	className = '',
	...rest
}) => {
	const currencyOptions: DropdownOption[] = useMemo(
		() =>
			currencies.map((c) => ({
				label: `${c.symbol} ${c.code}`,
				value: c.code,
			})),
		[currencies]
	);

	const selectedCurrency = currencies.find((c) => c.code === currency);

	const hasFxDelta =
		baseCurrency &&
		currency &&
		currency !== baseCurrency &&
		exchangeRate != null;

	const baseAmount = useMemo(() => {
		if (!hasFxDelta || exchangeRate == null) return undefined;
		const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
		return isNaN(numAmount) ? undefined : (numAmount * exchangeRate).toFixed(2);
	}, [amount, exchangeRate, hasFxDelta]);

	const handleCurrencyChange = (value: string) => {
		onChange(value, amount ?? '');
	};

	const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newAmount = e.target.value;
		onChange(currency ?? currencies[0]?.code ?? '', newAmount);
	};

	return (
		<div className={`flex gap-2 ${className}`} {...rest}>
			{/* Currency dropdown */}
			<div className="min-w-currency-select">
				<Dropdown
					options={currencyOptions}
					value={currency}
					onChange={handleCurrencyChange}
					disabled={disabled}
					placeholder="Currency"
				/>
			</div>

			{/* Amount input */}
			<div className="flex-1">
				<Input
					type="number"
					value={amount ?? ''}
					onChange={handleAmountChange}
					disabled={disabled}
					error={error}
					placeholder="0.00"
					step="0.01"
					min="0"
				/>
				{hasFxDelta && baseAmount != null && (
					<p className="mt-1 text-xs text-text-muted">≈ {baseAmount} {baseCurrency}</p>
				)}
			</div>
		</div>
	);
};

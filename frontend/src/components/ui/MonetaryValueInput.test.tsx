import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { MonetaryValueInput } from './MonetaryValueInput';

const currencies = [
	{ code: 'USD', symbol: '$' },
	{ code: 'EUR', symbol: '€' },
	{ code: 'GBP', symbol: '£' },
];

describe('MonetaryValueInput', () => {
	it('renders currency dropdown and amount input', () => {
		render(<MonetaryValueInput currencies={currencies} onChange={() => {}} />);
		expect(screen.getByText('Currency')).toBeInTheDocument();
		expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument();
	});

	it('calls onChange when currency changes', async () => {
		const user = userEvent.setup();
		const handleChange = vi.fn();
		render(<MonetaryValueInput currencies={currencies} onChange={handleChange} />);
		await user.click(screen.getByRole('button'));
		// Select EUR option
		await user.click(screen.getByText('€ EUR'));
		expect(handleChange).toHaveBeenCalledWith('EUR', '');
	});

	it('calls onChange when amount changes', async () => {
		const handleChange = vi.fn();
		render(
			<MonetaryValueInput currencies={currencies} currency="USD" onChange={handleChange} />
		);
		const amountInput = screen.getByPlaceholderText('0.00');
		// Use fireEvent.change for controlled number input
		fireEvent.change(amountInput, { target: { value: '100.50' } });
		expect(handleChange).toHaveBeenCalledWith('USD', '100.50');
	});

	it('displays fx delta when currency differs from base', () => {
		render(
			<MonetaryValueInput
				currencies={currencies}
				currency="EUR"
				amount="100"
				baseCurrency="USD"
				exchangeRate={1.1}
				onChange={() => {}}
			/>
		);
		expect(screen.getByText('≈ 110.00 USD')).toBeInTheDocument();
	});

	it('hides fx delta when currency matches base', () => {
		render(
			<MonetaryValueInput
				currencies={currencies}
				currency="USD"
				amount="100"
				baseCurrency="USD"
				exchangeRate={1.0}
				onChange={() => {}}
			/>
		);
		expect(screen.queryByText(/≈/)).not.toBeInTheDocument();
	});

	it('disables when disabled', () => {
		render(<MonetaryValueInput currencies={currencies} onChange={() => {}} disabled />);
		expect(screen.getByRole('button')).toBeDisabled();
		expect(screen.getByPlaceholderText('0.00')).toBeDisabled();
	});

	it('displays error on amount input', () => {
		render(
			<MonetaryValueInput currencies={currencies} onChange={() => {}} error="Invalid amount" />
		);
		expect(screen.getByText('Invalid amount')).toBeInTheDocument();
	});
});

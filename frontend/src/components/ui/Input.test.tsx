import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Input } from './Input';

describe('Input', () => {
	it('renders a text input by default', () => {
		render(<Input id="test" />);
		expect(screen.getByRole('textbox')).toBeInTheDocument();
	});

	it('renders a number input', () => {
		render(<Input id="num" variant="number" />);
		expect(screen.getByRole('spinbutton')).toBeInTheDocument();
	});

	it('renders a search input with clear button', () => {
		render(<Input id="search" variant="search" value="query" />);
		expect(screen.getByRole('textbox')).toBeInTheDocument();
		const clearBtn = screen.getByRole('button');
		expect(clearBtn).toBeInTheDocument();
	});

	it('clears search on button click', async () => {
		const onChange = vi.fn();
		render(<Input id="search" variant="search" value="query" onChange={onChange} />);
		await userEvent.click(screen.getByRole('button'));
		expect(onChange).toHaveBeenCalled();
	});

	it('toggles password visibility', async () => {
		render(<Input id="pass" variant="password" />);
		const input = document.getElementById('pass');
		const toggle = screen.getByRole('button');
		expect(input).toHaveAttribute('type', 'password');
		await userEvent.click(toggle);
		expect(input).toHaveAttribute('type', 'text');
	});

	it('shows error state', () => {
		render(<Input id="err" error="Error message" />);
		// Error uses --color-border-error token class [G-09]
		expect(screen.getByRole('textbox')).toHaveClass('border-border-error');
	});

	it('displays error text with AlertCircle icon', () => {
		render(<Input id="err" error="Invalid input" />);
		expect(screen.getByText('Invalid input')).toBeInTheDocument();
	});

	it('renders leading slot when not search variant', () => {
		render(<Input id="lead" leading={<span data-testid="leading">L</span>} />);
		expect(screen.getByTestId('leading')).toBeInTheDocument();
	});

	it('renders trailing slot', () => {
		render(<Input id="trail" trailing={<span data-testid="trailing">T</span>} />);
		expect(screen.getByTestId('trailing')).toBeInTheDocument();
	});

	it('forwards onChange callback', async () => {
		const onChange = vi.fn();
		render(<Input id="input" onChange={onChange} />);
		await userEvent.type(screen.getByRole('textbox'), 'a');
		expect(onChange).toHaveBeenCalled();
	});
});

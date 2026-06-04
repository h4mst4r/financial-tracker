/**
 * Tooltip tests — CSS-primary implementation.
 *
 * The tooltip bubble is always present in the DOM; visibility is driven by
 * CSS `group-hover` / `group-focus-within` classes (not JS state).
 *
 * In jsdom, CSS pseudo-class transitions are not applied, so tests verify:
 *  - The tooltip role element is always in the DOM
 *  - The base `opacity-0` class is present (hidden by default)
 *  - The `group-hover/tooltip:opacity-100` class is present (CSS hook wired)
 *  - The `transition-delay` style matches the `delay` prop
 *  - The Escape key sets `aria-hidden` (dismissed state) and removes the show classes
 *  - Re-hovering after Escape clears the dismissed state
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  it('always renders tooltip content in the DOM', () => {
    render(
      <Tooltip content="Helpful tip">
        <span>Hover me</span>
      </Tooltip>,
    );
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByText('Helpful tip')).toBeInTheDocument();
  });

  it('tooltip is hidden by default via opacity-0', () => {
    render(
      <Tooltip content="Helpful tip">
        <span>Hover me</span>
      </Tooltip>,
    );
    expect(screen.getByRole('tooltip')).toHaveClass('opacity-0');
  });

  it('CSS show classes are wired (group-hover and group-focus-within)', () => {
    render(
      <Tooltip content="Helpful tip">
        <span>Hover me</span>
      </Tooltip>,
    );
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip.className).toContain('group-hover/tooltip:opacity-100');
    expect(tooltip.className).toContain('group-focus-within/tooltip:opacity-100');
  });

  it('applies transition-delay from delay prop', () => {
    render(
      <Tooltip content="Helpful tip" delay={350}>
        <span>Hover me</span>
      </Tooltip>,
    );
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toHaveStyle({ transitionDelay: '350ms' });
  });

  it('uses default 0ms inline transition-delay when delay prop is omitted', () => {
    render(
      <Tooltip content="Helpful tip">
        <span>Hover me</span>
      </Tooltip>,
    );
    const tooltip = screen.getByRole('tooltip');
    // Default delay is 0ms; the CSS class delay-300 provides the actual show delay
    expect(tooltip).toHaveStyle({ transitionDelay: '0ms' });
  });

  it('positions above trigger by default (bottom-full)', () => {
    render(
      <Tooltip content="Helpful tip">
        <span>Hover me</span>
      </Tooltip>,
    );
    expect(screen.getByRole('tooltip')).toHaveClass('bottom-full');
  });

  it('defaults to above trigger (bottom-full class)', () => {
    render(
      <Tooltip content="Helpful tip">
        <span>Hover me</span>
      </Tooltip>,
    );
    expect(screen.getByRole('tooltip')).toHaveClass('bottom-full');
  });

  it('Escape key sets aria-hidden and removes show classes', async () => {
    render(
      <Tooltip content="Helpful tip">
        <span>Hover me</span>
      </Tooltip>,
    );
    const tooltip = screen.getByRole('tooltip');

    // Initially not dismissed
    expect(tooltip).not.toHaveAttribute('aria-hidden');
    expect(tooltip.className).toContain('group-hover/tooltip:opacity-100');

    // Press Escape
    await userEvent.keyboard('{Escape}');

    // Now dismissed — aria-hidden set, show classes removed, force-hidden class added
    expect(tooltip).toHaveAttribute('aria-hidden');
    expect(tooltip.className).not.toContain('group-hover/tooltip:opacity-100');
    expect(tooltip.className).toContain('!opacity-0');
  });

  it('re-hovering after Escape clears dismissed state', async () => {
    render(
      <Tooltip content="Helpful tip">
        <span>Hover me</span>
      </Tooltip>,
    );
    const tooltip = screen.getByRole('tooltip');
    const trigger = screen.getByText('Hover me');

    await userEvent.keyboard('{Escape}');
    expect(tooltip).toHaveAttribute('aria-hidden');

    // Hover resets dismissed
    await userEvent.hover(trigger);
    expect(tooltip).not.toHaveAttribute('aria-hidden');
    expect(tooltip.className).toContain('group-hover/tooltip:opacity-100');
  });

  it('focusing the trigger after Escape also clears dismissed state', async () => {
    render(
      <Tooltip content="Helpful tip">
        <button type="button">Focus me</button>
      </Tooltip>,
    );
    const tooltip = screen.getByRole('tooltip');

    await userEvent.keyboard('{Escape}');
    expect(tooltip).toHaveAttribute('aria-hidden');

    await userEvent.click(screen.getByRole('button')); // click focuses
    expect(tooltip).not.toHaveAttribute('aria-hidden');
  });
});

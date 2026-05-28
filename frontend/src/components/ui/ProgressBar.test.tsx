import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  it('renders with correct value', () => {
    const { container } = render(<ProgressBar value={50} />);
    const fill = container.querySelector('[style*="width: 50%"]');
    expect(fill).toBeTruthy();
  });

  it('applies green color for values below 80%', () => {
    render(<ProgressBar value={79} variant="budget" />);
    const fill = document.querySelector('[class*="bg-success"]');
    expect(fill).toBeTruthy();
  });

  it('applies amber color for values 80-99%', () => {
    render(<ProgressBar value={85} variant="budget" />);
    const fill = document.querySelector('[class*="bg-warning"]');
    expect(fill).toBeTruthy();
  });

  it('applies red color for values 100% and above', () => {
    render(<ProgressBar value={100} variant="budget" />);
    const fill = document.querySelector('[class*="bg-error"]');
    expect(fill).toBeTruthy();
  });

  it('renders with small height variant', () => {
    const { container } = render(<ProgressBar value={50} height="sm" />);
    const fill = container.querySelector('[class*="h-1"]');
    expect(fill).toBeTruthy();
  });

  it('renders label when showLabel is true', () => {
    render(<ProgressBar value={50} showLabel />);
    expect(screen.getByText('50%')).toBeInTheDocument();
  });
});

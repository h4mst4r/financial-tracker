/**
 * AUTH-005 — NotFound page tests
 *
 * Tests for 404 error page rendering and navigation.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotFound } from './NotFound';

describe('NotFound', () => {
  it('renders 404 heading', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );

    expect(screen.getByText('404 — Page Not Found')).toBeTruthy();
  });

  it('renders "Go to Dashboard" button', () => {
    render(
      <MemoryRouter>
        <NotFound />
      </MemoryRouter>
    );

    expect(screen.getByText('Go to Dashboard')).toBeTruthy();
  });
});

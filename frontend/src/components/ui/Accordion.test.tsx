import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Accordion } from './Accordion';

describe('Accordion', () => {
  it('renders collapsed by default', () => {
    render(
      <Accordion items={[{ title: 'Section 1', content: 'Content 1' }]} />
    );
    expect(screen.getByText('Section 1')).toBeInTheDocument();
    expect(screen.queryByText('Content 1')).not.toBeInTheDocument();
  });

  it('expands on click', async () => {
    render(
      <Accordion items={[{ title: 'Section 1', content: 'Content 1' }]} />
    );
    await userEvent.click(screen.getByText('Section 1'));
    expect(await screen.findByText('Content 1')).toBeInTheDocument();
  });

  it('collapses when clicked again', async () => {
    render(
      <Accordion items={[{ title: 'Section 1', content: 'Content 1' }]} />
    );
    await userEvent.click(screen.getByText('Section 1'));
    expect(screen.getByText('Content 1')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Section 1'));
    expect(screen.queryByText('Content 1')).not.toBeInTheDocument();
  });

  it('allows multiple sections open when allowMultiple is true', async () => {
    render(
      <Accordion
        allowMultiple
        items={[
          { title: 'Section 1', content: 'Content 1' },
          { title: 'Section 2', content: 'Content 2' },
        ]}
      />
    );
    await userEvent.click(screen.getByText('Section 1'));
    await userEvent.click(screen.getByText('Section 2'));
    expect(screen.getByText('Content 1')).toBeInTheDocument();
    expect(screen.getByText('Content 2')).toBeInTheDocument();
  });

  it('closes other sections when allowMultiple is false (default)', async () => {
    render(
      <Accordion
        items={[
          { title: 'Section 1', content: 'Content 1' },
          { title: 'Section 2', content: 'Content 2' },
        ]}
      />
    );
    await userEvent.click(screen.getByText('Section 1'));
    await userEvent.click(screen.getByText('Section 2'));
    expect(screen.queryByText('Content 1')).not.toBeInTheDocument();
    expect(screen.getByText('Content 2')).toBeInTheDocument();
  });
});

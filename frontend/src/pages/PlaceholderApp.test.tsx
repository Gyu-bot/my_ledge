import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlaceholderApp } from './PlaceholderApp';

describe('PlaceholderApp', () => {
  it('renders the dashboard shell', () => {
    render(<PlaceholderApp />);

    expect(
      screen.getByRole('heading', { name: /personal finance dashboard/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload data/i })).toBeEnabled();
    expect(screen.getByRole('heading', { name: /live snapshot/i })).toBeInTheDocument();
    expect(screen.getByText(/placeholder shell for banksalad imports/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /category mix/i })).toBeInTheDocument();
  });
});

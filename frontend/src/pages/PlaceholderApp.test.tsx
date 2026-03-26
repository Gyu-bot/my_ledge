import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from '../App';

describe('App shell', () => {
  it('renders the shared navigation and dashboard route by default', () => {
    render(<App />);

    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /assets/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /spending/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /data/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /skip to main content/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /personal finance dashboard/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/route shell ready for dashboard insights/i)).toBeInTheDocument();
  });
});

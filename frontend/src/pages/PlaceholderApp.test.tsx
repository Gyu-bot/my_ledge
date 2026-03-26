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

  it('renders the assets route shell', () => {
    window.history.pushState({}, '', '/assets');

    render(<App />);

    expect(screen.getByRole('heading', { level: 2, name: /assets/i })).toBeInTheDocument();
    expect(screen.getByText(/route shell ready for asset snapshots/i)).toBeInTheDocument();
  });

  it('redirects unknown routes to the dashboard shell', () => {
    window.history.pushState({}, '', '/not-found');

    render(<App />);

    expect(screen.getByRole('heading', { level: 2, name: /dashboard/i })).toBeInTheDocument();
    expect(screen.getByText(/route shell ready for dashboard insights/i)).toBeInTheDocument();
  });
});

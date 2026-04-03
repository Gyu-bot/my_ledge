import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './badge';

describe('Badge', () => {
  it('uses soft palette backgrounds for semantic variants', () => {
    const { rerender } = render(<Badge variant="secondary">보조</Badge>);
    expect(screen.getByText('보조').className).toContain('bg-[color:var(--color-secondary-soft)]');
    expect(screen.getByText('보조').className).toContain('text-[color:var(--color-secondary-strong)]');

    rerender(<Badge variant="accent">강조</Badge>);
    expect(screen.getByText('강조').className).toContain('bg-[color:var(--color-accent-soft)]');
    expect(screen.getByText('강조').className).toContain('text-[color:var(--color-accent-strong)]');

    rerender(<Badge variant="reference">기준</Badge>);
    expect(screen.getByText('기준').className).toContain('bg-[color:var(--color-surface-muted)]');
    expect(screen.getByText('기준').className).toContain('text-[color:var(--color-text-muted)]');

    rerender(<Badge variant="destructive">위험</Badge>);
    expect(screen.getByText('위험').className).toContain('bg-[color:var(--color-danger-soft)]');
    expect(screen.getByText('위험').className).toContain('text-[color:var(--color-danger)]');
  });
});

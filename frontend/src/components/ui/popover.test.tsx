import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

describe('PopoverContent', () => {
  it('uses a tighter internal padding scale', () => {
    render(
      <Popover open>
        <PopoverTrigger asChild>
          <button type="button">열기</button>
        </PopoverTrigger>
        <PopoverContent>내용</PopoverContent>
      </Popover>,
    );

    expect(screen.getByText('내용').closest('[data-side]')).toHaveClass('p-2');
  });
});

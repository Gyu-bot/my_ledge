import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { Input } from './input';
import { Select, SelectTrigger, SelectValue } from './select';

describe('control sizing', () => {
  it('uses compact default sizes for buttons, inputs, selects, and checkboxes', () => {
    render(
      <div>
        <Button>저장</Button>
        <Input aria-label="검색" />
        <Select>
          <SelectTrigger aria-label="카테고리">
            <SelectValue placeholder="전체" />
          </SelectTrigger>
        </Select>
        <Checkbox aria-label="선택" />
      </div>,
    );

    expect(screen.getByRole('button', { name: '저장' })).toHaveClass('h-8');
    expect(screen.getByRole('textbox', { name: '검색' })).toHaveClass('h-8');
    expect(screen.getByRole('combobox', { name: '카테고리' })).toHaveClass('h-8');
    expect(screen.getByRole('checkbox', { name: '선택' })).toHaveClass('h-3.5');
    expect(screen.getByRole('checkbox', { name: '선택' })).toHaveClass('w-3.5');
  });
});

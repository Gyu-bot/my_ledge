import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  DataManagementFilterBar,
  type DataManagementFilterValues,
} from './DataManagementFilterBar';

const defaultValues: DataManagementFilterValues = {
  search: '',
  transaction_type: '',
  source: '',
  category_major: '',
  payment_method: '',
  date_from: '',
  date_to: '',
  edited_only: false,
  include_deleted: false,
};

describe('DataManagementFilterBar', () => {
  it('uses compact date inputs and keeps checkbox labels in a no-wrap row', () => {
    const { container } = render(
      <DataManagementFilterBar
        categoryOptions={['식비']}
        onChange={vi.fn()}
        onApply={vi.fn()}
        onReset={vi.fn()}
        paymentMethodOptions={['카드 A']}
        values={defaultValues}
      />,
    );

    const dateInputs = screen.getAllByDisplayValue('');
    const dateOnlyInputs = dateInputs.filter((input) => input.getAttribute('type') === 'date');

    expect(dateOnlyInputs).toHaveLength(2);
    for (const input of dateOnlyInputs) {
      expect(input.className).toContain('max-w-[10.5rem]');
    }

    const checkboxRows = container.querySelectorAll('.js-filter-checkbox-row');
    expect(checkboxRows).toHaveLength(2);
    checkboxRows.forEach((row) => {
      expect(row.className).toContain('whitespace-nowrap');
    });
  });

  it('does not apply filters until the apply button is clicked', () => {
    const handleChange = vi.fn();
    const handleApply = vi.fn();

    render(
      <DataManagementFilterBar
        categoryOptions={['식비']}
        onChange={handleChange}
        onApply={handleApply}
        onReset={vi.fn()}
        paymentMethodOptions={['카드 A']}
        hasPendingChanges
        values={defaultValues}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('거래 설명 또는 메모 검색'), {
      target: { value: '스타벅스' },
    });

    expect(handleChange).toHaveBeenCalledWith({
      ...defaultValues,
      search: '스타벅스',
    });
    expect(handleApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '필터 적용' }));

    expect(handleApply).toHaveBeenCalledTimes(1);
  });
});

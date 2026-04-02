import { render, screen } from '@testing-library/react';
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
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

describe('Table density', () => {
  it('applies compact spacing classes with row separators', () => {
    render(
      <Table density="compact">
        <TableHeader>
          <TableRow>
            <TableHead>헤더</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>값</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    expect(screen.getByRole('columnheader', { name: '헤더' })).toHaveClass('h-8');
    expect(screen.getByRole('columnheader', { name: '헤더' })).toHaveClass('px-1');
    expect(screen.getByRole('cell', { name: '값' })).toHaveClass('px-1');
    expect(screen.getByRole('cell', { name: '값' })).toHaveClass('py-2');
    expect(screen.getByRole('columnheader', { name: '헤더' }).className).toContain('border-b');
    expect(screen.getByRole('cell', { name: '값' }).className).toContain('border-b');
    expect(screen.getAllByRole('row')[1].className).toContain('border-b');
  });
});

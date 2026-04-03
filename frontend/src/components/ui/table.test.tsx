import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';

describe('Table density', () => {
  it('applies compact spacing classes to header and cell slots', () => {
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
    expect(screen.getByRole('columnheader', { name: '헤더' })).toHaveClass('px-3');
    expect(screen.getByRole('cell', { name: '값' })).toHaveClass('px-3');
    expect(screen.getByRole('cell', { name: '값' })).toHaveClass('py-2');
  });
});

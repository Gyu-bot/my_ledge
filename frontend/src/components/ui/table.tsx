import * as React from 'react';
import { cn } from '../../lib/utils';

type TableDensity = 'default' | 'compact';

const TableDensityContext = React.createContext<TableDensity>('default');

interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  density?: TableDensity;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, density = 'default', ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <TableDensityContext.Provider value={density}>
        <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
      </TableDensityContext.Provider>
    </div>
  ),
);
Table.displayName = 'Table';

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
));
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
));
TableBody.displayName = 'TableBody';

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        'border-b border-[color:var(--color-border)] transition-colors hover:bg-[color:var(--color-accent-soft)]/60 data-[state=selected]:bg-[color:var(--color-accent-soft)]/60',
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => {
    const density = React.useContext(TableDensityContext);

    return (
    <th
      ref={ref}
      className={cn(
        density === 'compact'
          ? 'h-8 px-3 text-left align-middle font-medium text-[color:var(--color-text-muted)]'
          : 'h-10 px-4 text-left align-middle font-medium text-[color:var(--color-text-muted)]',
        className,
      )}
      {...props}
    />
    );
  },
);
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => {
    const density = React.useContext(TableDensityContext);

    return (
      <td
        ref={ref}
        className={cn(density === 'compact' ? 'px-3 py-2 align-middle' : 'px-4 py-3 align-middle', className)}
        {...props}
      />
    );
  },
);
TableCell.displayName = 'TableCell';

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };

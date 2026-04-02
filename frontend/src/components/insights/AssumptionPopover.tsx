import { useState } from 'react';
import { Info } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';

interface AssumptionPopoverProps {
  ariaLabel: string;
  content: string;
}

export function AssumptionPopover({ ariaLabel, content }: AssumptionPopoverProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={ariaLabel}
          className="h-7 w-7 rounded-full p-0 text-[color:var(--color-text-subtle)] hover:text-[color:var(--color-text)]"
          onClick={() => setOpen((current) => !current)}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          type="button"
          variant="ghost"
        >
          <Info className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-w-[22rem]"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <p className="pr-4 leading-6">{content}</p>
      </PopoverContent>
    </Popover>
  );
}

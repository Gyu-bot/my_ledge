import { cn } from '../../lib/utils';
import { HeroIcon, type HeroIconName } from '../icons/HeroIcons';
import { CardDescription, CardTitle } from '../ui/card';

interface IconTitleProps {
  icon: HeroIconName;
  title: string;
  description?: string;
  className?: string;
  descriptionClassName?: string;
  iconClassName?: string;
  titleClassName?: string;
}

export function IconTitle({
  icon,
  title,
  description,
  className,
  descriptionClassName,
  iconClassName,
  titleClassName,
}: IconTitleProps) {
  return (
    <div className={cn('flex min-w-0 items-start gap-3', className)}>
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-[color:var(--color-text-muted)]">
        <HeroIcon className={cn('h-4 w-4', iconClassName)} name={icon} />
      </span>
      <div className="min-w-0">
        <CardTitle className={titleClassName}>{title}</CardTitle>
        {description ? (
          <CardDescription className={cn('mt-1', descriptionClassName)}>
            {description}
          </CardDescription>
        ) : null}
      </div>
    </div>
  );
}

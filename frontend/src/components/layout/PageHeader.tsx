import { Badge } from '../ui/badge';

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  meta?: string;
}

export function PageHeader({ eyebrow, title, description, meta }: PageHeaderProps) {
  return (
    <section className="flex flex-col gap-3 border-b border-[color:var(--color-border)] pb-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Badge className="tracking-normal" variant="secondary">
            {eyebrow}
          </Badge>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[color:var(--color-text)] sm:text-3xl">
            {title}
          </h2>
        </div>
        {meta ? <span className="text-xs font-medium tracking-[0.12em] text-[color:var(--color-text-subtle)]">{meta}</span> : null}
      </div>
      <p className="max-w-3xl text-sm leading-6 text-[color:var(--color-text-muted)] sm:text-base">
        {description}
      </p>
    </section>
  );
}

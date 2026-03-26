import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader } from '../ui/card';

interface PageHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  meta?: string;
}

export function PageHeader({ eyebrow, title, description, meta }: PageHeaderProps) {
  return (
    <Card className="sm:p-2">
      <CardHeader className="gap-4 sm:flex-row sm:items-end sm:justify-between sm:space-y-0">
        <div>
          <Badge className="font-mono tracking-[0.28em]" variant="secondary">
            {eyebrow}
          </Badge>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[color:var(--color-text)] sm:text-4xl">
            {title}
          </h2>
        </div>
        {meta ? <Badge variant="secondary">{meta}</Badge> : null}
      </CardHeader>
      <CardContent className="pt-0">
        <p className="max-w-3xl text-sm leading-7 text-[color:var(--color-text-muted)] sm:text-base">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}

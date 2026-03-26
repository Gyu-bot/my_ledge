import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <Card className="border-dashed bg-white/70 text-center">
      <CardHeader>
        <CardTitle className="text-2xl">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mx-auto max-w-2xl text-sm leading-6 text-[color:var(--color-text-muted)]">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}

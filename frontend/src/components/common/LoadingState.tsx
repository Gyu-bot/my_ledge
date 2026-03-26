import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface LoadingStateProps {
  title: string;
  description: string;
}

export function LoadingState({ title, description }: LoadingStateProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex h-3 w-3 rounded-full bg-[color:var(--color-primary)] animate-pulse motion-reduce:animate-none"
          />
          <CardTitle>{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="max-w-2xl text-sm leading-6 text-[color:var(--color-text-muted)]">
          {description}
        </p>
      </CardContent>
    </Card>
  );
}

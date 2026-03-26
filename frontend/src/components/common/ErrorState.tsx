import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface ErrorStateProps {
  title: string;
  description: string;
  detail?: string;
}

export function ErrorState({ title, description, detail }: ErrorStateProps) {
  return (
    <Card className="border-red-200 bg-white">
      <CardHeader>
        <div className="inline-flex w-fit rounded-full bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-red-700">
          Dashboard error
        </div>
        <CardTitle className="mt-2 text-2xl">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="max-w-2xl text-sm leading-6 text-[color:var(--color-text-muted)]">
          {description}
        </p>
        {detail ? (
          <Alert className="mt-4" variant="destructive">
            <AlertTitle>상세 오류</AlertTitle>
            <AlertDescription>{detail}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface ErrorStateProps {
  title: string;
  description: string;
  detail?: string;
}

export function ErrorState({ title, description, detail }: ErrorStateProps) {
  return (
    <Card className="border-red-200">
      <CardHeader>
        <div className="inline-flex w-fit rounded-[var(--radius-xs)] bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">
          오류
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

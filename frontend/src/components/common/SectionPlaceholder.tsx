import { Card, CardContent } from '../ui/card';

interface SectionPlaceholderProps {
  title: string;
  description: string;
}

export function SectionPlaceholder({ title, description }: SectionPlaceholderProps) {
  return (
    <Card className="border-dashed bg-white/70 text-center">
      <CardContent className="px-6 py-12">
        <p className="text-sm font-semibold text-[color:var(--color-text)]">{title}</p>
        <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">{description}</p>
      </CardContent>
    </Card>
  );
}

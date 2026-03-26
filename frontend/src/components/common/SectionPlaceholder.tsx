interface SectionPlaceholderProps {
  title: string;
  description: string;
}

export function SectionPlaceholder({ title, description }: SectionPlaceholderProps) {
  return (
    <div className="rounded-[1.5rem] border border-dashed border-[color:var(--color-border)] bg-white/70 px-6 py-12 text-center">
      <p className="text-sm font-semibold text-[color:var(--color-text)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-muted)]">{description}</p>
    </div>
  );
}

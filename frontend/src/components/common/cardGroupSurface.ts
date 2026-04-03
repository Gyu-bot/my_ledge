export type CardGroupSurfaceTone = 'primary' | 'secondary' | 'accent';

const CARD_GROUP_SURFACE_CLASSES: Record<CardGroupSurfaceTone, string> = {
  primary:
    'border-[color:var(--color-primary-soft)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(231,237,245,0.9))]',
  secondary:
    'border-[color:var(--color-secondary-soft)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,238,229,0.86))]',
  accent:
    'border-[color:var(--color-accent-soft)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,232,231,0.9))]',
};

export function getCardGroupSurfaceClass(tone: CardGroupSurfaceTone = 'primary') {
  return CARD_GROUP_SURFACE_CLASSES[tone];
}

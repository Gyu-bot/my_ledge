/* eslint-disable react-refresh/only-export-components */
import type { ComponentType, SVGProps } from 'react';

export type HeroIconProps = SVGProps<SVGSVGElement>;
export type HeroIconName =
  | 'home'
  | 'chartBar'
  | 'spending'
  | 'assets'
  | 'insights'
  | 'operations'
  | 'workbench'
  | 'presentationChartLine'
  | 'exclamationTriangle'
  | 'clock'
  | 'tag'
  | 'banknotes'
  | 'buildingLibrary'
  | 'arrowPath'
  | 'buildingStorefront'
  | 'arrowsRightLeft'
  | 'calendarDays'
  | 'percentage'
  | 'pencilSquare'
  | 'trash'
  | 'check'
  | 'xMark'
  | 'arrowUturnLeft';

const baseIconProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeWidth: 1.8,
  viewBox: '0 0 24 24',
} as const;

export function HomeIcon(props: HeroIconProps) {
  return (
    <svg {...baseIconProps} aria-hidden="true" {...props}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10.5V20h13V10.5" />
      <path d="M9.5 20v-6h5v6" />
    </svg>
  );
}

export function ChartBarIcon(props: HeroIconProps) {
  return (
    <svg {...baseIconProps} aria-hidden="true" {...props}>
      <path d="M4 19.5h16" />
      <path d="M7 16V9.5" />
      <path d="M12 16V6.5" />
      <path d="M17 16V12" />
    </svg>
  );
}

export function ArrowTrendingDownIcon(props: HeroIconProps) {
  return (
    <svg {...baseIconProps} aria-hidden="true" {...props}>
      <path d="M4 7h7" />
      <path d="m11 7 3 3 6-6" />
      <path d="M20 4v6h-6" />
      <path d="M7 7v11" />
    </svg>
  );
}

export function CircleStackIcon(props: HeroIconProps) {
  return (
    <svg {...baseIconProps} aria-hidden="true" {...props}>
      <ellipse cx="12" cy="6.5" rx="6.5" ry="2.5" />
      <path d="M5.5 6.5V12c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V6.5" />
      <path d="M5.5 12v5.5c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V12" />
    </svg>
  );
}

export function LightBulbIcon(props: HeroIconProps) {
  return (
    <svg {...baseIconProps} aria-hidden="true" {...props}>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M8.5 9.5a3.5 3.5 0 1 1 7 0c0 1.3-.7 2.3-1.6 3.2-.7.7-1.1 1.4-1.2 2.3h-1.4c-.1-.9-.5-1.6-1.2-2.3C9.2 11.8 8.5 10.8 8.5 9.5Z" />
    </svg>
  );
}

export function Squares2X2Icon(props: HeroIconProps) {
  return (
    <svg {...baseIconProps} aria-hidden="true" {...props}>
      <rect x="4.5" y="4.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13" y="4.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="4.5" y="13" width="6.5" height="6.5" rx="1.5" />
      <rect x="13" y="13" width="6.5" height="6.5" rx="1.5" />
    </svg>
  );
}

export function ClipboardDocumentListIcon(props: HeroIconProps) {
  return (
    <svg {...baseIconProps} aria-hidden="true" {...props}>
      <path d="M9 5.25h6a1 1 0 0 1 1 1V7.5H8V6.25a1 1 0 0 1 1-1Z" />
      <path d="M8 7.5h8a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 18V9A1.5 1.5 0 0 1 8 7.5Z" />
      <path d="M9.5 11h5" />
      <path d="M9.5 14h5" />
      <path d="M9.5 17h3" />
    </svg>
  );
}

export function PresentationChartLineIcon(props: HeroIconProps) {
  return (
    <svg {...baseIconProps} aria-hidden="true" {...props}>
      <path d="M4 19.5h16" />
      <path d="M6.5 16.5V8.5" />
      <path d="M12 16.5V11" />
      <path d="M17.5 16.5V6.5" />
      <path d="m5 6.5 4.5 3.5 3-2.5 5.5 3.5" />
    </svg>
  );
}

export function ExclamationTriangleIcon(props: HeroIconProps) {
  return (
    <svg {...baseIconProps} aria-hidden="true" {...props}>
      <path d="M10.9 4.8 3.7 17.5A1.5 1.5 0 0 0 5 19.8h14a1.5 1.5 0 0 0 1.3-2.3L13.1 4.8a1.5 1.5 0 0 0-2.2 0Z" />
      <path d="M12 9v4.5" />
      <path d="M12 16.5h.01" />
    </svg>
  );
}

export function ClockIcon(props: HeroIconProps) {
  return (
    <svg {...baseIconProps} aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2.5" />
    </svg>
  );
}

export function TagIcon(props: HeroIconProps) {
  return (
    <svg {...baseIconProps} aria-hidden="true" {...props}>
      <path d="M4.5 11.5V6.8A1.8 1.8 0 0 1 6.3 5h4.7l7.5 7.5a1.8 1.8 0 0 1 0 2.5l-3.5 3.5a1.8 1.8 0 0 1-2.5 0L4.5 11.5Z" />
      <path d="M8.5 8.5h.01" />
    </svg>
  );
}

export function BanknotesIcon(props: HeroIconProps) {
  return (
    <svg {...baseIconProps} aria-hidden="true" {...props}>
      <rect x="4" y="7" width="16" height="10" rx="2" />
      <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h8A1.5 1.5 0 0 1 19 5.5V7" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6.5 10c.8 0 1.5-.7 1.5-1.5" />
      <path d="M17.5 14c-.8 0-1.5.7-1.5 1.5" />
    </svg>
  );
}

export function BuildingLibraryIcon(props: HeroIconProps) {
  return (
    <svg {...baseIconProps} aria-hidden="true" {...props}>
      <path d="M4 19.5h16" />
      <path d="M5 9.5 12 5l7 4.5" />
      <path d="M6.5 10.5v7" />
      <path d="M10 10.5v7" />
      <path d="M14 10.5v7" />
      <path d="M17.5 10.5v7" />
    </svg>
  );
}

export function ArrowPathIcon(props: HeroIconProps) {
  return (
    <svg {...baseIconProps} aria-hidden="true" {...props}>
      <path d="M16.5 8.5H8V4" />
      <path d="M8 8.5a6 6 0 0 1 9 1" />
      <path d="M7.5 15.5H16V20" />
      <path d="M16 15.5a6 6 0 0 1-9-1" />
    </svg>
  );
}

export function BuildingStorefrontIcon(props: HeroIconProps) {
  return (
    <svg {...baseIconProps} aria-hidden="true" {...props}>
      <path d="M5 10.5h14" />
      <path d="M6 10.5V19h12v-8.5" />
      <path d="M4.5 10.5 6 5h12l1.5 5.5" />
      <path d="M9 19v-4.5h6V19" />
    </svg>
  );
}

export function ArrowsRightLeftIcon(props: HeroIconProps) {
  return (
    <svg {...baseIconProps} aria-hidden="true" {...props}>
      <path d="M7 7h11" />
      <path d="m15 4 3 3-3 3" />
      <path d="M17 17H6" />
      <path d="m9 14-3 3 3 3" />
    </svg>
  );
}

export function CalendarDaysIcon(props: HeroIconProps) {
  return (
    <svg {...baseIconProps} aria-hidden="true" {...props}>
      <rect x="4.5" y="6" width="15" height="13.5" rx="2" />
      <path d="M8 4.5v3" />
      <path d="M16 4.5v3" />
      <path d="M4.5 9.5h15" />
      <path d="M8 13h.01" />
      <path d="M12 13h.01" />
      <path d="M16 13h.01" />
      <path d="M8 16.5h.01" />
      <path d="M12 16.5h.01" />
    </svg>
  );
}

export function PercentageIcon(props: HeroIconProps) {
  return (
    <svg {...baseIconProps} aria-hidden="true" {...props}>
      <path d="M7 17 17 7" />
      <circle cx="8" cy="8" r="2" />
      <circle cx="16" cy="16" r="2" />
    </svg>
  );
}

export function PencilSquareIcon(props: HeroIconProps) {
  return (
    <svg {...baseIconProps} aria-hidden="true" {...props}>
      <path d="M4.5 19.5h4l8.5-8.5-4-4L4.5 15.5v4Z" />
      <path d="m12.5 7.5 4 4" />
      <path d="m14.5 5.5 1-1a1.8 1.8 0 0 1 2.5 0l1.5 1.5a1.8 1.8 0 0 1 0 2.5l-1 1" />
    </svg>
  );
}

export function TrashIcon(props: HeroIconProps) {
  return (
    <svg {...baseIconProps} aria-hidden="true" {...props}>
      <path d="M5.5 7h13" />
      <path d="M9 7V5.5h6V7" />
      <path d="M7 7l.8 11.5a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7" />
      <path d="M10 10.5v6" />
      <path d="M14 10.5v6" />
    </svg>
  );
}

export function CheckIcon(props: HeroIconProps) {
  return (
    <svg {...baseIconProps} aria-hidden="true" {...props}>
      <path d="m6 12 4 4 8-8" />
    </svg>
  );
}

export function XMarkIcon(props: HeroIconProps) {
  return (
    <svg {...baseIconProps} aria-hidden="true" {...props}>
      <path d="m7 7 10 10" />
      <path d="M17 7 7 17" />
    </svg>
  );
}

export function ArrowUturnLeftIcon(props: HeroIconProps) {
  return (
    <svg {...baseIconProps} aria-hidden="true" {...props}>
      <path d="M9 8 5 12l4 4" />
      <path d="M19 8h-6a4 4 0 0 0 0 8h6" />
    </svg>
  );
}

export const heroIconComponents = {
  home: HomeIcon,
  chartBar: ChartBarIcon,
  spending: ArrowTrendingDownIcon,
  assets: CircleStackIcon,
  insights: LightBulbIcon,
  operations: Squares2X2Icon,
  workbench: ClipboardDocumentListIcon,
  presentationChartLine: PresentationChartLineIcon,
  exclamationTriangle: ExclamationTriangleIcon,
  clock: ClockIcon,
  tag: TagIcon,
  banknotes: BanknotesIcon,
  buildingLibrary: BuildingLibraryIcon,
  arrowPath: ArrowPathIcon,
  buildingStorefront: BuildingStorefrontIcon,
  arrowsRightLeft: ArrowsRightLeftIcon,
  calendarDays: CalendarDaysIcon,
  percentage: PercentageIcon,
  pencilSquare: PencilSquareIcon,
  trash: TrashIcon,
  check: CheckIcon,
  xMark: XMarkIcon,
  arrowUturnLeft: ArrowUturnLeftIcon,
} as const satisfies Record<HeroIconName, ComponentType<HeroIconProps>>;

export const navigationIconComponents = heroIconComponents;

export function HeroIcon({
  name,
  ...props
}: HeroIconProps & {
  name: HeroIconName;
}) {
  const Icon = heroIconComponents[name];
  return <Icon {...props} />;
}

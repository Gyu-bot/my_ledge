export interface NavigationLeafItem {
  label: string;
  to: string;
}

export interface NavigationGroupItem {
  label: string;
  to: string;
  children: NavigationLeafItem[];
}

export type NavigationItem = NavigationLeafItem | NavigationGroupItem;

export interface BreadcrumbItem {
  label: string;
  to: string;
}

export const navigationItems: NavigationItem[] = [
  {
    label: '개요',
    to: '/',
  },
  {
    label: '분석',
    to: '/analysis',
    children: [
      { label: '지출', to: '/analysis/spending' },
      { label: '자산', to: '/analysis/assets' },
      { label: '인사이트', to: '/analysis/insights' },
    ],
  },
  {
    label: '운영',
    to: '/operations',
    children: [{ label: '거래 작업대', to: '/operations/workbench' }],
  },
];

function isGroupItem(item: NavigationItem): item is NavigationGroupItem {
  return 'children' in item;
}

function normalizePathname(pathname: string) {
  if (!pathname || pathname === '/') {
    return '/';
  }

  return pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

function findLeafEntry(pathname: string) {
  const normalizedPathname = normalizePathname(pathname);

  for (const item of navigationItems) {
    if (!isGroupItem(item) && item.to === normalizedPathname) {
      return { parent: null, item };
    }

    if (isGroupItem(item)) {
      const child = item.children.find((entry) => entry.to === normalizedPathname);

      if (child) {
        return { parent: item, item: child };
      }
    }
  }

  return null;
}

export function getPageTitle(pathname: string) {
  const entry = findLeafEntry(pathname);

  if (!entry) {
    return '개요';
  }

  return entry.item.label;
}

export function getBreadcrumb(pathname: string): BreadcrumbItem[] {
  const entry = findLeafEntry(pathname);

  if (!entry) {
    return [{ label: '개요', to: '/' }];
  }

  if (!entry.parent) {
    return [{ label: entry.item.label, to: entry.item.to }];
  }

  return [
    { label: entry.parent.label, to: entry.parent.to },
    { label: entry.item.label, to: entry.item.to },
  ];
}

export function getActiveGroup(pathname: string) {
  const entry = findLeafEntry(pathname);

  if (!entry?.parent) {
    return null;
  }

  return entry.parent.label;
}

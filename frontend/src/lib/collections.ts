export function ensureArray<T>(value: T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function ensureObject<T extends object>(value: T | null | undefined): Partial<T> {
  return value && typeof value === 'object' ? value : {};
}

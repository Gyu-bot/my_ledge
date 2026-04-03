function normalizeNumericValue(
  value: number | string | readonly (number | string)[] | null | undefined,
) {
  const normalized =
    Array.isArray(value) && value.length > 0 ? value[0] : (value ?? 0);

  return typeof normalized === 'number' ? normalized : Number(normalized);
}

export function formatAxisMoneyInThousands(
  value: number | string | readonly (number | string)[] | null | undefined,
) {
  const numericValue = normalizeNumericValue(value);
  const scaledValue = Math.round(numericValue / 1000);

  return new Intl.NumberFormat('ko-KR', {
    maximumFractionDigits: 0,
  }).format(scaledValue);
}

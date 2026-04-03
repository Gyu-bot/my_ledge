import { ResponsiveContainer, Tooltip, Treemap } from 'recharts';
import type { MerchantTreemapDatum } from '../../hooks/useSpending';
import { SectionPlaceholder } from '../common/SectionPlaceholder';
import { ChartTooltipContent } from './ChartTooltipContent';
import { CHART_NEUTRALS, chartTooltipStyle } from './chartTheme';

interface MerchantTreemapChartProps {
  ariaLabel: string;
  data: MerchantTreemapDatum[];
}

const BLOCK_COLORS = CHART_NEUTRALS;

function formatCurrency(value: number | string | readonly (number | string)[] | null | undefined) {
  const normalized = Array.isArray(value) && value.length > 0 ? value[0] : (value ?? 0);
  const numericValue = typeof normalized === 'number' ? normalized : Number(normalized);

  return new Intl.NumberFormat('ko-KR', {
    style: 'currency',
    currency: 'KRW',
    maximumFractionDigits: 0,
  }).format(numericValue);
}

function TooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ color?: string; payload: MerchantTreemapDatum }>;
}) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const item = payload[0].payload;
  const color = payload[0].color ?? BLOCK_COLORS[0] ?? '#223a5e';

  return (
    <ChartTooltipContent
      items={[
        {
          color,
          label: item.name,
          value: formatCurrency(item.amount),
        },
      ]}
    />
  );
}

function TreemapNode(props: {
  depth?: number;
  height?: number;
  index?: number;
  name?: string;
  width?: number;
  x?: number;
  y?: number;
}) {
  const {
    depth = 0,
    height = 0,
    index = 0,
    name = '',
    width = 0,
    x = 0,
    y = 0,
  } = props;

  if (depth !== 1) {
    return null;
  }

  const background = BLOCK_COLORS[index % BLOCK_COLORS.length];
  const canShowLabel = width > 84 && height > 44;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={3}
        ry={3}
        fill={background}
        fillOpacity={0.96}
        stroke="#ffffff"
        strokeWidth={1}
      />
      {canShowLabel ? (
        <text
          x={x + 12}
          y={y + 22}
          fill="white"
          fontSize={12}
          fontWeight={600}
        >
          {name.length > 18 ? `${name.slice(0, 18)}…` : name}
        </text>
      ) : null}
    </g>
  );
}

export function MerchantTreemapChart({ ariaLabel, data }: MerchantTreemapChartProps) {
  if (data.length === 0) {
    return (
      <SectionPlaceholder
        title="거래처 분포 데이터 없음"
        description="선택한 기간에 표시할 거래처 분포 데이터를 찾지 못했습니다."
      />
    );
  }

  return (
    <div className="min-h-[40rem] w-full">
      <div className="h-full w-full" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%" minWidth={320} minHeight={320}>
          <Treemap
            data={data}
            dataKey="amount"
            stroke="rgba(255,255,255,0.7)"
            content={<TreemapNode />}
            isAnimationActive={false}
          >
            <Tooltip content={<TooltipContent />} contentStyle={chartTooltipStyle} />
          </Treemap>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

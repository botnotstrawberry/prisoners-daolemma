import { type RoundDistributionPoint, moveColors } from "~~/utils/games/caseStudy";

type StackedMoveChartProps = {
  data: RoundDistributionPoint[];
  compact?: boolean;
  title?: string;
  description?: string;
  showLegend?: boolean;
};

export const StackedMoveChart = ({
  data,
  compact = false,
  title = "Round-by-round move distribution",
  description = "Each bar shows the round's move mix. Green means cooperation held, amber means defensive play, and red marks betrayal.",
  showLegend = true,
}: StackedMoveChartProps) => {
  if (!data.length) {
    return (
      <div className="rounded-3xl bg-base-100 p-6 shadow-lg">
        <h3 className="text-2xl font-bold">{title}</h3>
        <p className="mt-4 leading-7 opacity-75">No rounds were played in this game, so there are no moves to chart.</p>
      </div>
    );
  }

  const width = Math.max(360, data.length * 110);
  const height = compact ? 210 : 260;
  const chartTop = 20;
  const chartBottom = height - 46;
  const chartHeight = chartBottom - chartTop;
  const gap = 24;
  const barWidth = Math.min(64, (width - 40 - gap * (data.length - 1)) / data.length);
  const innerWidth = barWidth * data.length + gap * (data.length - 1);
  const startX = (width - innerWidth) / 2;

  return (
    <div className="rounded-3xl bg-base-100 p-6 shadow-lg">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className={`${compact ? "text-xl" : "text-2xl"} font-bold`}>{title}</h3>
          <p className={`${compact ? "mt-2 text-sm leading-6" : "mt-2 max-w-2xl leading-7"} opacity-80`}>
            {description}
          </p>
        </div>
        {showLegend ? (
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-success/25 bg-success/10 px-3 py-1 text-success">SHARE</span>
            <span className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 text-warning">CATCH</span>
            <span className="rounded-full border border-error/25 bg-error/10 px-3 py-1 text-error">STEAL</span>
          </div>
        ) : null}
      </div>

      <div className="mt-5 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto min-w-full">
          <line x1="20" y1={chartTop} x2="20" y2={chartBottom} stroke="#94a3b8" strokeOpacity="0.35" />
          <line x1="20" y1={chartBottom} x2={width - 20} y2={chartBottom} stroke="#94a3b8" strokeOpacity="0.35" />
          {[0, 50, 100].map(label => {
            const y = chartBottom - (label / 100) * chartHeight;
            return (
              <g key={label}>
                <line x1="20" y1={y} x2={width - 20} y2={y} stroke="#94a3b8" strokeOpacity="0.15" />
                <text x="10" y={y + 4} fontSize="11" textAnchor="end" fill="#64748b">
                  {label}%
                </text>
              </g>
            );
          })}

          {data.map((point, index) => {
            const x = startX + index * (barWidth + gap);
            const total = point.total || 1;
            const shareHeight = (point.share / total) * chartHeight;
            const catchHeight = (point.catch / total) * chartHeight;
            const stealHeight = (point.steal / total) * chartHeight;
            const shareY = chartBottom - shareHeight;
            const catchY = shareY - catchHeight;
            const stealY = catchY - stealHeight;
            return (
              <g key={point.round}>
                <text x={x + barWidth / 2} y={chartTop - 4} fontSize="11" textAnchor="middle" fill="#64748b">
                  n={point.total}
                </text>
                <rect x={x} y={shareY} width={barWidth} height={shareHeight} rx="10" ry="10" fill={moveColors.Share} />
                <rect x={x} y={catchY} width={barWidth} height={catchHeight} fill={moveColors.Catch} />
                <rect x={x} y={stealY} width={barWidth} height={stealHeight} rx="10" ry="10" fill={moveColors.Steal} />
                <text
                  x={x + barWidth / 2}
                  y={height - 16}
                  fontSize="12"
                  textAnchor="middle"
                  fill="#0f172a"
                  fontWeight="600"
                >
                  R{point.round}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

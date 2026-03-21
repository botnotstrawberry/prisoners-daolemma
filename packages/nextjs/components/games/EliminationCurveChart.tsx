type EliminationCurveChartProps = {
  data: Array<{ round: number; alive: number }>;
};

export const EliminationCurveChart = ({ data }: EliminationCurveChartProps) => {
  if (data.length < 2) {
    return (
      <div className="rounded-3xl bg-base-100 p-6 shadow-lg">
        <h3 className="text-2xl font-bold">Elimination curve</h3>
        <p className="mt-4 leading-7 opacity-75">
          No elimination curve is available because the game never reached round resolution.
        </p>
      </div>
    );
  }

  const width = Math.max(360, data.length * 110);
  const height = 260;
  const left = 28;
  const right = width - 20;
  const top = 20;
  const bottom = height - 40;
  const maxAlive = Math.max(...data.map(point => point.alive), 1);
  const minAlive = 0;
  const xStep = data.length > 1 ? (right - left) / (data.length - 1) : 0;
  const yFor = (value: number) => bottom - ((value - minAlive) / (maxAlive - minAlive || 1)) * (bottom - top);
  const points = data.map((point, index) => `${left + index * xStep},${yFor(point.alive)}`).join(" ");

  return (
    <div className="rounded-3xl bg-base-100 p-6 shadow-lg">
      <h3 className="text-2xl font-bold">Elimination curve</h3>
      <p className="mt-2 max-w-2xl leading-7 opacity-80">
        This tracks how many agents remained alive after each round. Steep drops signal fast trust collapse.
      </p>

      <div className="mt-5 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto min-w-full">
          <line x1={left} y1={top} x2={left} y2={bottom} stroke="#94a3b8" strokeOpacity="0.35" />
          <line x1={left} y1={bottom} x2={right} y2={bottom} stroke="#94a3b8" strokeOpacity="0.35" />
          {[0, maxAlive].map(label => (
            <g key={label}>
              <line x1={left} y1={yFor(label)} x2={right} y2={yFor(label)} stroke="#94a3b8" strokeOpacity="0.15" />
              <text x={left - 8} y={yFor(label) + 4} fontSize="11" textAnchor="end" fill="#64748b">
                {label}
              </text>
            </g>
          ))}
          <polyline fill="none" stroke="#2563eb" strokeWidth="3" points={points} />
          {data.map((point, index) => {
            const x = left + index * xStep;
            const y = yFor(point.alive);
            return (
              <g key={`${point.round}-${point.alive}`}>
                <circle cx={x} cy={y} r="4.5" fill="#2563eb" />
                <text x={x} y={height - 16} fontSize="12" textAnchor="middle" fill="#0f172a" fontWeight="600">
                  {point.round === 0 ? "Start" : `R${point.round}`}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

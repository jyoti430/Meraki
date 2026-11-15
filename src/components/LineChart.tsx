export interface Series { label: string; color: string; values: number[]; fill?: boolean; dashed?: boolean }

function niceStep(max: number) {
  const raw = max / 5
  const pow = 10 ** Math.floor(Math.log10(raw || 1))
  const n = raw / pow
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow
}

/** Small dependency-free SVG line chart (values in tonnes). */
export default function LineChart({ series, labels, sublabels, yLabel = 'Tonnes', ariaLabel }: { series: Series[]; labels: string[]; sublabels?: string[]; yLabel?: string; ariaLabel: string }) {
  const W = 720, H = 250, L = 56, R = 12, T = 10, B = sublabels ? 44 : 30
  const max = Math.max(1, ...series.flatMap((s) => s.values))
  const step = niceStep(max)
  const top = Math.ceil(max / step) * step
  const n = Math.max(1, labels.length - 1)
  const x = (i: number) => L + ((W - L - R) * i) / n
  const y = (v: number) => T + (H - T - B) * (1 - v / top)
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  const every = labels.length > 14 ? 2 : 1
  const fmt = (v: number) => (step < 1 ? v.toFixed(1) : String(Math.round(v)))
  return <div className="m-chart">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      <text x={14} y={(H - B) / 2 + T} transform={`rotate(-90 14 ${(H - B) / 2 + T})`} textAnchor="middle">{yLabel}</text>
      {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e7eae3" /><text x={L - 8} y={y(t) + 4} textAnchor="end">{fmt(t)}</text></g>)}
      {labels.map((l, i) => i % every === 0 && <g key={i}><text x={x(i)} y={H - B + 18} textAnchor="middle">{l}</text>{sublabels && <text x={x(i)} y={H - B + 33} textAnchor="middle" style={{ fontSize: 11, fill: '#6a716c' }}>{sublabels[i]}</text>}</g>)}
      {series.map((s) => {
        const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')
        return <g key={s.label}>
          {s.fill && <polygon points={`${x(0)},${y(0)} ${pts} ${x(s.values.length - 1)},${y(0)}`} fill={s.color} opacity={0.12} />}
          <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2.5} strokeDasharray={s.dashed ? '6 5' : undefined} strokeLinejoin="round" />
          {s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={3.5} fill={s.color}><title>{`${s.label}: ${v.toFixed(1)} t`}</title></circle>)}
        </g>
      })}
    </svg>
    <div className="m-legend2" style={{ justifyContent: 'center', marginTop: 4 }}>
      {series.map((s) => <span key={s.label}><svg width="30" height="10" aria-hidden="true"><line x1="0" x2="30" y1="5" y2="5" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dashed ? '5 4' : undefined} /><circle cx="15" cy="5" r="3.5" fill={s.color} /></svg>{s.label}</span>)}
    </div>
  </div>
}

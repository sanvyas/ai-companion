// Tiny SVG charts. One scale per chart, labelled ends, theme colours from CSS variables.
const W = 560, H = 120, PAD = { l: 34, r: 8, t: 8, b: 20 };

export function BarChart({ data, label, format = (n: number) => String(Math.round(n)) }: { data: { x: string; y: number }[]; label: string; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map(d => d.y));
  const iw = W - PAD.l - PAD.r, ih = H - PAD.t - PAD.b, bw = iw / Math.max(1, data.length);
  return (
    <svg className="svg" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
      {[0, 0.5, 1].map(t => <g key={t}><line className="grid" x1={PAD.l} x2={W - PAD.r} y1={PAD.t + ih * (1 - t)} y2={PAD.t + ih * (1 - t)} /><text x={PAD.l - 4} y={PAD.t + ih * (1 - t) + 3} textAnchor="end">{format(max * t)}</text></g>)}
      {data.map((d, i) => <rect key={d.x} className="bar" x={PAD.l + i * bw + bw * 0.15} width={bw * 0.7} y={PAD.t + ih * (1 - d.y / max)} height={Math.max(d.y ? 1 : 0, ih * (d.y / max))} rx={2}><title>{`${d.x}: ${format(d.y)}`}</title></rect>)}
      {data.length > 1 && [0, Math.floor((data.length - 1) / 2), data.length - 1].map(i => <text key={i} x={PAD.l + i * bw + bw / 2} y={H - 5} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}>{data[i].x.slice(5)}</text>)}
    </svg>
  );
}

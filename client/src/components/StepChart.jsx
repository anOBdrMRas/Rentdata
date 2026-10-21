import { useEffect, useRef, useState } from 'react';

// Einfache Stufen-/Liniengrafik (eine Serie) mit Hover-Tooltip.
// data: [{ x: 'YYYY-MM' | 'YYYY-MM-DD', y: number, label?: string }]

const parse = (x) => new Date((x.length === 7 ? x + '-01' : x) + 'T00:00:00Z').getTime();

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

export default function StepChart({ data, height = 240, format = (v) => v, step = true, xFormat, extendToToday = false }) {
  const wrap = useRef(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)));
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  if (!data?.length) return <div className="empty">Noch keine Daten für eine Entwicklung vorhanden.</div>;

  const pts = data.map((d) => ({ ...d, t: parse(d.x) }));
  const tMin = pts[0].t;
  let tMax = pts[pts.length - 1].t;
  if (extendToToday) tMax = Math.max(tMax, Date.now());
  if (tMax === tMin) tMax = tMin + 30 * 864e5;
  const yMax = niceMax(Math.max(...pts.map((p) => p.y)) * 1.08);

  const m = { l: 64, r: 16, t: 12, b: 26 };
  const w = width - m.l - m.r;
  const h = height - m.t - m.b;
  const X = (t) => m.l + ((t - tMin) / (tMax - tMin)) * w;
  const Y = (v) => m.t + h - (v / yMax) * h;

  let d = '';
  pts.forEach((p, i) => {
    if (i === 0) d += `M${X(p.t)},${Y(p.y)}`;
    else d += step ? `H${X(p.t)}V${Y(p.y)}` : `L${X(p.t)},${Y(p.y)}`;
  });
  if (extendToToday) d += `H${X(tMax)}`;
  const area = `${d}V${Y(0)}H${X(tMin)}Z`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yMax);
  const years = [];
  const y0 = new Date(tMin).getUTCFullYear();
  const y1 = new Date(tMax).getUTCFullYear();
  const every = Math.ceil((y1 - y0 + 1) / Math.max(2, Math.floor(w / 70)));
  for (let y = y0; y <= y1; y += every) {
    const t = Date.UTC(y, 0, 1);
    if (t >= tMin && t <= tMax) years.push(t);
  }

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const t = tMin + ((e.clientX - rect.left - m.l) / w) * (tMax - tMin);
    let best = pts[0];
    for (const p of pts) if (p.t <= t) best = p;
    if (!step) best = pts.reduce((a, p) => (Math.abs(p.t - t) < Math.abs(a.t - t) ? p : a), pts[0]);
    setHover(best);
  };

  return (
    <div className="chart" ref={wrap}>
      <svg height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="Entwicklung über die Zeit">
        <g className="axis">
          {yTicks.map((v) => (
            <g key={v}>
              <line className="gridline" x1={m.l} x2={m.l + w} y1={Y(v)} y2={Y(v)} />
              <text x={m.l - 8} y={Y(v) + 4} textAnchor="end">{format(v)}</text>
            </g>
          ))}
          {years.map((t) => (
            <text key={t} x={X(t)} y={height - 6} textAnchor="middle">{new Date(t).getUTCFullYear()}</text>
          ))}
        </g>
        <path d={area} fill="var(--chart-fill)" />
        <path d={d} fill="none" stroke="var(--chart-line)" strokeWidth="2" strokeLinejoin="round" />
        {hover && (
          <g>
            <line x1={X(hover.t)} x2={X(hover.t)} y1={m.t} y2={m.t + h} stroke="var(--text-3)" strokeDasharray="3 3" />
            <circle cx={X(hover.t)} cy={Y(hover.y)} r="5" fill="var(--chart-line)" stroke="var(--surface)" strokeWidth="2" />
          </g>
        )}
        <rect x={m.l} y={m.t} width={w} height={h} fill="transparent" />
      </svg>
      {hover && (
        <div className="tip" style={{ left: X(hover.t), top: Y(hover.y) }}>
          <b>{format(hover.y)}</b>
          {xFormat ? xFormat(hover.x) : hover.x}
          {hover.label && <div className="muted">{hover.label}</div>}
        </div>
      )}
    </div>
  );
}

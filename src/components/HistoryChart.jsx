import { useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORIES, category } from '../aqi.js';

const H = 190;
const PAD = { l: 34, r: 10, t: 10, b: 24 };

function niceMax(v) {
  const steps = [50, 100, 150, 200, 300, 400, 500];
  return steps.find((s) => s >= v * 1.1) ?? Math.ceil(v / 100) * 100;
}

function fmtTime(t, range) {
  const d = new Date(t * 1000);
  if (range === '7d') return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleTimeString([], { hour: 'numeric' });
}

export default function HistoryChart({ points, range }) {
  const wrap = useRef(null);
  const [w, setW] = useState(340);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => setHover(null), [points]);

  const geo = useMemo(() => {
    if (!points?.length) return null;
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const maxAqi = Math.max(...points.map((p) => p.aqi ?? 0));
    const yMax = niceMax(Math.max(maxAqi, 45));
    const iw = w - PAD.l - PAD.r;
    const ih = H - PAD.t - PAD.b;
    const x = (t) => PAD.l + (t1 === t0 ? 0 : ((t - t0) / (t1 - t0)) * iw);
    const y = (v) => PAD.t + ih - (Math.min(v, yMax) / yMax) * ih;

    // Category bands behind the line
    let lo = 0;
    const bands = [];
    for (const c of CATEGORIES) {
      const hi = Math.min(c.max, yMax);
      if (hi > lo) bands.push({ y: y(hi), h: y(lo) - y(hi), color: c.color });
      lo = c.max;
      if (lo >= yMax) break;
    }

    // Line segments colored by category; break the line on gaps in data
    const gap = (points.length > 1 ? (t1 - t0) / (points.length - 1) : 0) * 3;
    const segs = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      if (a.aqi == null || b.aqi == null || b.t - a.t > gap) continue;
      segs.push({
        d: `M${x(a.t).toFixed(1)},${y(a.aqi).toFixed(1)}L${x(b.t).toFixed(1)},${y(b.aqi).toFixed(1)}`,
        color: category(Math.max(a.aqi, b.aqi)).color,
      });
    }

    const ticksY = [0, yMax / 2, yMax].map(Math.round);
    const nX = range === '7d' ? 7 : 4;
    const ticksX = Array.from({ length: nX + 1 }, (_, i) => t0 + ((t1 - t0) * i) / nX).slice(1, nX);

    return { x, y, bands, segs, ticksY, ticksX, iw, ih };
  }, [points, w, range]);

  function onPointer(e) {
    if (!geo || !points.length) return;
    const rect = wrap.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = null;
    let bestD = Infinity;
    for (const p of points) {
      if (p.aqi == null) continue;
      const d = Math.abs(geo.x(p.t) - px);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    setHover(best);
  }

  if (!points) return <div className="chart-empty">Loading history…</div>;
  if (!points.length) return <div className="chart-empty">No history for this range yet.</div>;

  const hc = hover && category(hover.aqi);
  const hx = hover ? geo.x(hover.t) : 0;

  return (
    <div
      className="chart"
      ref={wrap}
      onPointerMove={onPointer}
      onPointerDown={onPointer}
      onPointerLeave={() => setHover(null)}
    >
      <svg width={w} height={H} role="img" aria-label="AQI history chart">
        {geo.bands.map((b, i) => (
          <rect key={i} x={PAD.l} y={b.y} width={geo.iw} height={b.h} fill={b.color} opacity="0.12" />
        ))}
        {geo.ticksY.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={w - PAD.r} y1={geo.y(v)} y2={geo.y(v)} className="grid" />
            <text x={PAD.l - 6} y={geo.y(v) + 4} textAnchor="end" className="axis">{v}</text>
          </g>
        ))}
        {geo.ticksX.map((t) => (
          <text key={t} x={geo.x(t)} y={H - 6} textAnchor="middle" className="axis">{fmtTime(t, range)}</text>
        ))}
        {geo.segs.map((s, i) => (
          <path key={i} d={s.d} stroke={s.color} className="line" />
        ))}
        {hover && (
          <>
            <line x1={hx} x2={hx} y1={PAD.t} y2={H - PAD.b} className="cursor" />
            <circle cx={hx} cy={geo.y(hover.aqi)} r="5" fill={hc.color} stroke="var(--card)" strokeWidth="2" />
          </>
        )}
      </svg>
      {hover && (
        <div className="tip" style={{ left: Math.min(Math.max(hx, 70), w - 70) }}>
          <b style={{ color: hc.color }}>AQI {hover.aqi}</b>
          <span>
            {new Date(hover.t * 1000).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
      )}
    </div>
  );
}

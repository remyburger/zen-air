import { CATEGORIES } from '../aqi.js';

// Semicircle gauge, 0–300 scale (values above 300 pin to the end).
const MAX = 300;
const CX = 160;
const CY = 160;
const R = 128;

function polar(value) {
  const t = Math.min(Math.max(value, 0), MAX) / MAX; // 0..1
  const a = Math.PI * (1 - t); // 180° → 0°
  return [CX + R * Math.cos(a), CY - R * Math.sin(a)];
}

function arc(from, to) {
  const [x1, y1] = polar(from);
  const [x2, y2] = polar(to);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export default function Gauge({ aqi, cat }) {
  let lo = 0;
  const segs = CATEGORIES.map((c) => {
    const hi = Math.min(c.max, MAX);
    const s = { from: lo, to: hi, color: c.color };
    lo = hi;
    return s;
  }).filter((s) => s.to > s.from);

  const v = aqi ?? 0;
  const [nx, ny] = polar(v);

  return (
    <div className="gauge">
      <svg viewBox="0 0 320 178" role="img" aria-label={aqi == null ? 'No reading' : `AQI ${aqi}, ${cat?.name}`}>
        <path d={arc(0, MAX)} className="gauge-track" />
        {segs.map((s) => (
          <path
            key={s.from}
            d={arc(s.from + (s.from ? 1.2 : 0), s.to - 1.2)}
            stroke={s.color}
            className="gauge-seg"
            opacity={aqi == null || v >= s.from ? 1 : 0.28}
          />
        ))}
        {aqi != null && (
          <>
            <circle cx={nx} cy={ny} r="13" fill="var(--card)" />
            <circle cx={nx} cy={ny} r="8.5" fill={cat?.color} stroke="var(--card)" strokeWidth="2" />
          </>
        )}
      </svg>
      <div className="gauge-readout">
        <div className="gauge-num">{aqi == null ? '--' : aqi}</div>
        <div className="gauge-label" style={{ background: cat?.color ?? 'var(--muted-bg)', color: cat?.ink ?? 'var(--muted)' }}>
          {cat ? cat.short ?? cat.name : 'No data'}
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Gauge from './components/Gauge.jsx';
import HistoryChart from './components/HistoryChart.jsx';
import Settings from './components/Settings.jsx';
import { RANGES, fetchCurrent, fetchHistory, fetchPoints, load, mapUrl, save } from './api.js';
import { category, channelsDisagree, effectivePm, pmToAqi, windowAdvice } from './aqi.js';

const CFG_KEY = 'zen-air-config';
const CUR_KEY = 'zen-air-current';
const HIST_KEY = 'zen-air-history';
const DEFAULT_CFG = { apiKey: '', sensorIndex: '325272', readKey: '', useEpa: true };
const PTS_KEY = 'zen-air-points';
const CURRENT_EVERY_MS = 2 * 60 * 1000; // sensor uploads every ~2 minutes
const POINTS_EVERY_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;

// Usage per day from stored balance snapshots: compares now with the snapshot
// closest to 24h ago (or the oldest one, scaled to a day, if it's newer than that).
function pointsUsage(snaps) {
  if (!snaps?.length) return null;
  const last = snaps[snaps.length - 1];
  const target = last.at - DAY_MS;
  let base = snaps[0];
  for (const s of snaps) if (s.at <= target) base = s;
  const span = last.at - base.at;
  if (span < 2 * 3600 * 1000) return { remaining: last.remaining, perDay: null };
  const used = base.remaining - last.remaining;
  const perDay = Math.max(0, Math.round((used / span) * DAY_MS));
  return {
    remaining: last.remaining,
    perDay,
    days: perDay > 0 ? Math.floor(last.remaining / perDay) : null,
    since: span < 20 * 3600 * 1000 ? base.at : null,
  };
}

function fmtNum(n) {
  return n.toLocaleString();
}

function ago(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hr ago` : `${Math.round(h / 24)} d ago`;
}

export default function App() {
  const [cfg, setCfg] = useState(() => ({ ...DEFAULT_CFG, ...load(CFG_KEY, {}) }));
  const [current, setCurrent] = useState(() => load(CUR_KEY, null));
  const [history, setHistory] = useState(() => load(HIST_KEY, {}));
  const [ptsLog, setPtsLog] = useState(() => load(PTS_KEY, []));
  const [range, setRange] = useState('24h');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(!cfg.apiKey);
  const [, tick] = useState(0);
  const inflight = useRef(false);

  const ready = Boolean(cfg.apiKey && cfg.sensorIndex);

  const refreshCurrent = useCallback(
    async (force = false) => {
      if (!ready || inflight.current) return;
      const cached = load(CUR_KEY, null);
      if (!force && cached?.sensorIndex === cfg.sensorIndex && Date.now() - cached.fetchedAt < CURRENT_EVERY_MS) return;
      inflight.current = true;
      setBusy(true);
      try {
        const c = { ...(await fetchCurrent(cfg)), sensorIndex: cfg.sensorIndex };
        setCurrent(c);
        save(CUR_KEY, c);
        setError('');
      } catch (e) {
        setError(e.message);
      } finally {
        inflight.current = false;
        setBusy(false);
      }
    },
    [cfg, ready],
  );

  const refreshHistory = useCallback(
    async (key, force = false) => {
      if (!ready) return;
      const all = load(HIST_KEY, {});
      const cached = all[key];
      if (
        !force &&
        cached?.sensorIndex === cfg.sensorIndex &&
        cached.average === RANGES[key].average && // refetch if the resolution changed
        Date.now() - cached.fetchedAt < RANGES[key].cacheMs
      )
        return;
      try {
        const h = { ...(await fetchHistory(cfg, key)), sensorIndex: cfg.sensorIndex };
        const next = { ...load(HIST_KEY, {}), [key]: h };
        setHistory(next);
        save(HIST_KEY, next);
      } catch (e) {
        setError(e.message);
      }
    },
    [cfg, ready],
  );

  const refreshPoints = useCallback(
    async (force = false) => {
      if (!cfg.apiKey) return;
      const snaps = load(PTS_KEY, []);
      const last = snaps[snaps.length - 1];
      if (!force && last && Date.now() - last.at < POINTS_EVERY_MS) return;
      try {
        const p = await fetchPoints(cfg);
        // Keep ~8 days of snapshots; a jump up means points were added, so restart the log.
        let next = last && p.remaining > last.remaining ? [] : snaps;
        next = [...next, p].filter((s) => p.at - s.at < 8 * DAY_MS);
        setPtsLog(next);
        save(PTS_KEY, next);
      } catch {
        /* non-critical; the card just stays hidden or stale */
      }
    },
    [cfg],
  );

  // Poll the live reading while the app is on screen; pause in the background to save points.
  useEffect(() => {
    if (!ready) return;
    const all = () => {
      refreshCurrent();
      refreshHistory('24h');
      refreshPoints();
    };
    all();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') all();
      tick((n) => n + 1);
    }, 30 * 1000);
    const onVis = () => {
      if (document.visibilityState === 'visible') all();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [ready, refreshCurrent, refreshHistory, refreshPoints]);

  useEffect(() => {
    if (range !== '24h') refreshHistory(range);
  }, [range, refreshHistory]);

  function saveCfg(next) {
    const changedSensor = next.sensorIndex !== cfg.sensorIndex || next.readKey !== cfg.readKey;
    setCfg(next);
    save(CFG_KEY, next);
    setShowSettings(false);
    if (next.apiKey !== cfg.apiKey) {
      setPtsLog([]);
      save(PTS_KEY, []);
    }
    if (changedSensor) {
      setCurrent(null);
      setHistory({});
      save(CUR_KEY, null);
      save(HIST_KEY, {});
    }
    setError('');
  }

  const live = current && current.sensorIndex === cfg.sensorIndex ? current : null;
  const pm = live ? effectivePm(live, cfg.useEpa) : null;
  const aqi = pmToAqi(pm);
  const cat = category(aqi);

  const toPoints = useCallback(
    (h) =>
      h && h.sensorIndex === cfg.sensorIndex
        ? h.rows.map((r) => ({ t: r.t, aqi: pmToAqi(effectivePm(r, cfg.useEpa)) }))
        : null,
    [cfg.sensorIndex, cfg.useEpa],
  );

  const points = useMemo(() => toPoints(history[range]), [history, range, toPoints]);
  const day = useMemo(() => toPoints(history['24h']), [history, toPoints]);

  // Change vs. about an hour ago, from the 24h history
  const trend = useMemo(() => {
    if (aqi == null || !day?.length) return null;
    const target = Date.now() / 1000 - 3600;
    let best = null;
    for (const p of day) if (p.aqi != null && (!best || Math.abs(p.t - target) < Math.abs(best.t - target))) best = p;
    return best && Math.abs(best.t - target) < 1800 ? aqi - best.aqi : null;
  }, [aqi, day]);

  const stats = useMemo(() => {
    const v = (day || []).map((p) => p.aqi).filter((n) => n != null);
    if (!v.length) return null;
    return { min: Math.min(...v), max: Math.max(...v), avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length) };
  }, [day]);

  const advice = windowAdvice(aqi, trend);
  const offline = live?.lastSeen && Date.now() / 1000 - live.lastSeen > 15 * 60;
  const abWarn = live && channelsDisagree(live.cf1A, live.cf1B);
  const usage = pointsUsage(ptsLog);

  return (
    <div className="app" style={{ '--accent': cat?.color ?? '#8a7fd6' }}>
      <header>
        <div>
          <h1>{live?.name || 'Zen Air'}</h1>
          <p className="sub">
            {live ? `Updated ${ago(Date.now() - (live.lastSeen ? live.lastSeen * 1000 : live.fetchedAt))}` : ready ? 'Loading…' : 'Set up to begin'}
            {cfg.useEpa ? ' · EPA corrected' : ''}
          </p>
        </div>
        <div className="head-actions">
          <button className={`icon-btn ${busy ? 'spin' : ''}`} onClick={() => { refreshCurrent(true); refreshHistory(range, true); }} aria-label="Refresh" disabled={!ready}>
            ↻
          </button>
          <button className="icon-btn" onClick={() => setShowSettings(true)} aria-label="Settings">
            ⚙
          </button>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}
      {offline && <div className="banner warn">Sensor hasn't reported since {new Date(live.lastSeen * 1000).toLocaleString()}. Check its power and Wi‑Fi.</div>}

      <section className="card hero">
        <Gauge aqi={aqi} cat={cat} />
        {trend != null && (
          <div className="trend">
            {trend > 2 ? '▲' : trend < -2 ? '▼' : '■'} {trend > 0 ? '+' : ''}
            {trend} vs. 1 hr ago
          </div>
        )}
      </section>

      {advice && (
        <section className={`card advice ${advice.windows}`}>
          <div className="advice-icon" aria-hidden="true">
            <svg viewBox="0 0 40 40" width="40" height="40">
              <rect x="5" y="4" width="30" height="32" rx="3" fill="none" stroke="currentColor" strokeWidth="2.5" />
              <line x1="20" y1="4" x2="20" y2="36" stroke="currentColor" strokeWidth="2.5" />
              {advice.windows === 'open' ? (
                <path d="M20 8 L31 12 L31 32 L20 28" fill="currentColor" opacity="0.25" stroke="currentColor" strokeWidth="2" />
              ) : (
                <line x1="5" y1="20" x2="35" y2="20" stroke="currentColor" strokeWidth="2.5" />
              )}
            </svg>
          </div>
          <div>
            <h3>{advice.headline}</h3>
            <p>{advice.detail}</p>
          </div>
        </section>
      )}

      <section className="stats">
        <div className="stat">
          <span className="k">PM2.5</span>
          <span className="v">{pm == null ? '--' : pm.toFixed(1)}</span>
          <span className="u">µg/m³</span>
        </div>
        <div className="stat">
          <span className="k">Temp</span>
          <span className="v">{live?.tempF == null ? '--' : Math.round(live.tempF - 8)}°</span>
          <span className="u">F, adjusted</span>
        </div>
        <div className="stat">
          <span className="k">Humidity</span>
          <span className="v">{live?.rh == null ? '--' : Math.min(100, Math.round(live.rh + 4))}%</span>
          <span className="u">adjusted</span>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h3>History</h3>
          <div className="seg">
            {Object.keys(RANGES).map((k) => (
              <button key={k} className={k === range ? 'on' : ''} onClick={() => setRange(k)}>
                {k}
              </button>
            ))}
          </div>
        </div>
        <HistoryChart points={ready ? points : []} range={range} />
        {stats && range === '24h' && (
          <div className="mini-stats">
            <span>Low <b>{stats.min}</b></span>
            <span>Avg <b>{stats.avg}</b></span>
            <span>High <b>{stats.max}</b></span>
          </div>
        )}
      </section>

      {live && (
        <section className="card channels">
          <h3>Sensor health</h3>
          <div className="ab">
            <span>Laser A <b>{live.cf1A?.toFixed(1) ?? '--'}</b></span>
            <span>Laser B <b>{live.cf1B?.toFixed(1) ?? '--'}</b></span>
            <span className={abWarn ? 'bad' : 'ok'}>{abWarn ? 'Channels disagree' : 'Channels agree'}</span>
          </div>
          {abWarn && <p className="fine">One laser counter may be dirty or failing. A spider or dust inside the housing is the usual cause.</p>}
        </section>
      )}

      {usage && (
        <section className="card points">
          <div className="card-head">
            <h3>API points</h3>
            <span className={`pts ${usage.remaining < 50000 ? 'low' : ''}`}>{fmtNum(usage.remaining)}</span>
          </div>
          <p className="fine">
            {usage.perDay == null
              ? 'Usage rate shows after a few hours of checks.'
              : usage.perDay === 0
                ? 'No points used recently.'
                : `About ${fmtNum(usage.perDay)} a day${usage.since ? ` (based on use since ${new Date(usage.since).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})` : ''}` +
                  (usage.days != null
                    ? ` · lasts ~${usage.days > 730 ? `${Math.round(usage.days / 365)} years` : usage.days > 60 ? `${Math.round(usage.days / 30)} months` : `${usage.days} days`}`
                    : '')}
          </p>
        </section>
      )}

      {ready && (
        <a className="map-link" href={mapUrl(cfg, live?.lat, live?.lon)} target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z" fill="none" stroke="currentColor" strokeWidth="2" />
            <circle cx="12" cy="10" r="2.6" fill="currentColor" />
          </svg>
          Open in PurpleAir map
          <span aria-hidden="true">↗</span>
        </a>
      )}

      <footer>PurpleAir data · AQI uses EPA's 2024 PM2.5 scale</footer>

      {showSettings && <Settings cfg={cfg} onSave={saveCfg} onClose={() => setShowSettings(false)} canClose={ready} />}
    </div>
  );
}

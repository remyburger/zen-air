// PurpleAir cloud API (https://api.purpleair.com). Each call spends points from
// your account, so results are cached in localStorage and refreshed sparingly.

const BASE = 'https://api.purpleair.com/v1';

const CURRENT_FIELDS = [
  'name',
  'last_seen',
  'location_type',
  'pm2.5_cf_1',
  'pm2.5_cf_1_a',
  'pm2.5_cf_1_b',
  'pm2.5_atm',
  'humidity',
  'temperature',
  'pressure',
];

const HISTORY_FIELDS = ['pm2.5_cf_1', 'pm2.5_atm', 'humidity'];

// average = minutes per point; PurpleAir limits how far back each average can reach.
export const RANGES = {
  '24h': { seconds: 24 * 3600, average: 60, cacheMs: 30 * 60 * 1000 },
  '7d': { seconds: 7 * 24 * 3600, average: 60, cacheMs: 60 * 60 * 1000 },
};

async function request(path, params, { apiKey, readKey }) {
  const qs = new URLSearchParams(params);
  if (readKey) qs.set('read_key', readKey);
  let res;
  try {
    res = await fetch(`${BASE}${path}?${qs}`, { headers: { 'X-API-Key': apiKey } });
  } catch {
    throw new Error('Network error. Check your connection.');
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error */
  }
  if (!res.ok) {
    const msg = body?.description || body?.error || `HTTP ${res.status}`;
    if (res.status === 403) throw new Error(`API key rejected: ${msg}`);
    if (res.status === 402) throw new Error(`Out of API points: ${msg}`);
    if (res.status === 404) throw new Error(`Sensor not found: ${msg}`);
    throw new Error(msg);
  }
  return body;
}

export async function fetchCurrent(cfg) {
  const body = await request(
    `/sensors/${encodeURIComponent(cfg.sensorIndex)}`,
    { fields: CURRENT_FIELDS.join(',') },
    cfg,
  );
  const s = body.sensor || {};
  return {
    name: s.name,
    lastSeen: s.last_seen, // unix seconds
    outdoor: s.location_type === 0,
    cf1: s['pm2.5_cf_1'],
    cf1A: s['pm2.5_cf_1_a'],
    cf1B: s['pm2.5_cf_1_b'],
    atm: s['pm2.5_atm'],
    rh: s.humidity,
    tempF: s.temperature,
    pressure: s.pressure,
    fetchedAt: Date.now(),
  };
}

export async function fetchHistory(cfg, rangeKey) {
  const r = RANGES[rangeKey];
  const end = Math.floor(Date.now() / 1000);
  const body = await request(
    `/sensors/${encodeURIComponent(cfg.sensorIndex)}/history`,
    {
      start_timestamp: String(end - r.seconds),
      end_timestamp: String(end),
      average: String(r.average),
      fields: HISTORY_FIELDS.join(','),
    },
    cfg,
  );
  const fields = body.fields || [];
  const idx = (name) => fields.indexOf(name);
  const iT = idx('time_stamp');
  const iCf = idx('pm2.5_cf_1');
  const iAtm = idx('pm2.5_atm');
  const iRh = idx('humidity');
  const rows = (body.data || [])
    .map((row) => ({
      t: row[iT],
      cf1: iCf >= 0 ? row[iCf] : null,
      atm: iAtm >= 0 ? row[iAtm] : null,
      rh: iRh >= 0 ? row[iRh] : null,
    }))
    .filter((p) => p.t != null)
    .sort((a, b) => a.t - b.t); // API doesn't guarantee order
  return { range: rangeKey, rows, fetchedAt: Date.now() };
}

// ---- tiny localStorage helpers (wrapped: storage can throw in private mode) ----
export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

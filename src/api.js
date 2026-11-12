// PurpleAir cloud API (https://api.purpleair.com). Each call spends points from
// your account, so results are cached in localStorage and refreshed sparingly.

const BASE = 'https://api.purpleair.com/v1';

const CURRENT_FIELDS = [
  'name',
  'last_seen',
  'location_type',
  'latitude',
  'longitude',
  'pm2.5_cf_1',
  'pm2.5_cf_1_a',
  'pm2.5_cf_1_b',
  'pm2.5_atm',
  'humidity',
  'temperature',
  'pressure',
];

// Detail options for the 24h chart (chosen in Settings).
// average = minutes per point (0 = raw readings, about every 2 minutes).
// cost = rough points per refresh with 2 fields, for the hint in Settings.
export const RESOLUTIONS = {
  hourly: { label: 'Hourly', average: 60, cacheMs: 30 * 60 * 1000, rows: 24, cost: '~50' },
  '10min': { label: '10 min', average: 10, cacheMs: 10 * 60 * 1000, rows: 144, cost: '~300' },
  raw: { label: 'Every 2 min', average: 0, cacheMs: 10 * 60 * 1000, rows: 720, cost: '~1,500' },
};
export const DEFAULT_RES = '10min';

export const RANGES = {
  '24h': { seconds: 24 * 3600 },
  '7d': { seconds: 7 * 24 * 3600, average: 60, cacheMs: 60 * 60 * 1000 },
};

// What a history request for this range and config looks like. `sig` changes whenever
// the request would return different data, so the cache knows to refetch.
export function historySpec(cfg, rangeKey) {
  const res = RESOLUTIONS[cfg.historyRes] || RESOLUTIONS[DEFAULT_RES];
  const { average, cacheMs } = rangeKey === '24h' ? res : RANGES[rangeKey];
  // Only fetch the fields the current mode uses: EPA needs cf_1 + humidity, otherwise atm.
  const fields = cfg.useEpa ? ['pm2.5_cf_1', 'humidity'] : ['pm2.5_atm'];
  return { average, cacheMs, fields, sig: `${average}|${fields.join(',')}` };
}

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
    lat: s.latitude,
    lon: s.longitude,
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
  const spec = historySpec(cfg, rangeKey);
  const end = Math.floor(Date.now() / 1000);
  const body = await request(
    `/sensors/${encodeURIComponent(cfg.sensorIndex)}/history`,
    {
      start_timestamp: String(end - r.seconds),
      end_timestamp: String(end),
      average: String(spec.average),
      fields: spec.fields.join(','),
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
  return { range: rangeKey, sig: spec.sig, rows, fetchedAt: Date.now() };
}

// Remaining API points for the key's organization. PurpleAir says this call is free.
export async function fetchPoints({ apiKey }) {
  const body = await request('/organization', {}, { apiKey });
  let remaining = body?.remaining_points;
  if (typeof remaining !== 'number') {
    // Fall back to any numeric "remaining…" field in case the name differs.
    const k = Object.keys(body || {}).find((key) => /remaining/i.test(key) && typeof body[key] === 'number');
    remaining = k ? body[k] : null;
  }
  if (remaining == null) throw new Error('Could not read remaining points');
  return { remaining, at: Date.now() };
}

// Link to this sensor on map.purpleair.com (read key included for private sensors).
export function mapUrl({ sensorIndex, readKey }, lat, lon) {
  const qs = new URLSearchParams({ select: sensorIndex });
  if (readKey) qs.set('key', readKey);
  const hash = lat != null && lon != null ? `#14/${lat}/${lon}` : '';
  return `https://map.purpleair.com/1/mAQI/a10/p604800/cC0?${qs}${hash}`;
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

// AQI math for PurpleAir PM2.5.
// Breakpoints: US EPA PM2.5 AQI as revised May 2024.
// Correction: US EPA 2023 extended correction for PurpleAir (covers smoke).

const BREAKPOINTS = [
  { cLo: 0.0, cHi: 9.0, iLo: 0, iHi: 50 },
  { cLo: 9.1, cHi: 35.4, iLo: 51, iHi: 100 },
  { cLo: 35.5, cHi: 55.4, iLo: 101, iHi: 150 },
  { cLo: 55.5, cHi: 125.4, iLo: 151, iHi: 200 },
  { cLo: 125.5, cHi: 225.4, iLo: 201, iHi: 300 },
  { cLo: 225.5, cHi: 325.4, iLo: 301, iHi: 500 },
];

export const CATEGORIES = [
  { max: 50, name: 'Good', color: '#2fbf71', ink: '#0b3d22' },
  { max: 100, name: 'Moderate', color: '#f2c94c', ink: '#4a3a05' },
  { max: 150, name: 'Unhealthy for Sensitive Groups', short: 'Sensitive', color: '#f2994a', ink: '#4a2405' },
  { max: 200, name: 'Unhealthy', color: '#eb5757', ink: '#ffffff' },
  { max: 300, name: 'Very Unhealthy', color: '#9b51e0', ink: '#ffffff' },
  { max: Infinity, name: 'Hazardous', color: '#7e2133', ink: '#ffffff' },
];

export function pmToAqi(pm) {
  if (pm == null || Number.isNaN(pm)) return null;
  // EPA truncates concentration to one decimal before lookup.
  const c = Math.max(0, Math.floor(pm * 10) / 10);
  if (c > 325.4) {
    // Extend the top segment linearly past 500 instead of capping silently.
    const { cLo, cHi, iLo, iHi } = BREAKPOINTS[5];
    return Math.round(((iHi - iLo) / (cHi - cLo)) * (c - cLo) + iLo);
  }
  for (const b of BREAKPOINTS) {
    if (c <= b.cHi) {
      return Math.round(((b.iHi - b.iLo) / (b.cHi - b.cLo)) * (c - b.cLo) + b.iLo);
    }
  }
  return null;
}

export function category(aqi) {
  if (aqi == null) return null;
  return CATEGORIES.find((c) => aqi <= c.max);
}

// pa = PM2.5 cf_1 (average of channels A and B), rh = sensor humidity (raw).
export function epaCorrect(pa, rh) {
  if (pa == null || Number.isNaN(pa)) return null;
  if (rh == null || Number.isNaN(rh)) rh = 40; // fallback if humidity is missing
  let v;
  if (pa < 30) {
    v = 0.524 * pa - 0.0862 * rh + 5.75;
  } else if (pa < 50) {
    const w = pa / 20 - 3 / 2;
    v = (0.786 * w + 0.524 * (1 - w)) * pa - 0.0862 * rh + 5.75;
  } else if (pa < 210) {
    v = 0.786 * pa - 0.0862 * rh + 5.75;
  } else if (pa < 260) {
    const w = pa / 50 - 21 / 5;
    v =
      (0.69 * w + 0.786 * (1 - w)) * pa -
      0.0862 * rh * (1 - w) +
      2.966 * w +
      5.75 * (1 - w) +
      8.84e-4 * pa * pa * w;
  } else {
    v = 2.966 + 0.69 * pa + 8.84e-4 * pa * pa;
  }
  return Math.max(0, v);
}

// Returns the PM2.5 value the app should use for AQI.
export function effectivePm({ cf1, atm, rh }, useEpa) {
  if (useEpa) return epaCorrect(cf1, rh);
  return atm ?? cf1;
}

// A and B laser counters should roughly agree. PurpleAir's own QC rule of thumb:
// flag when they differ by more than 5 µg/m³ AND more than 70%.
export function channelsDisagree(a, b) {
  if (a == null || b == null) return false;
  const diff = Math.abs(a - b);
  const pct = diff / Math.max((a + b) / 2, 0.1);
  return diff > 5 && pct > 0.7;
}

export function windowAdvice(aqi, trend) {
  if (aqi == null) return null;
  const rising = trend != null && trend >= 10;
  const falling = trend != null && trend <= -10;
  if (aqi <= 50) {
    return {
      headline: rising ? 'Open windows, but keep an eye on it' : 'Good time to open the windows',
      detail: rising
        ? 'Air is clean right now but AQI is climbing.'
        : 'Outdoor air is clean. Air the house out and enjoy being outside.',
      windows: 'open',
    };
  }
  if (aqi <= 100) {
    return {
      headline: falling ? 'Getting better, fine to air out soon' : 'Okay for most people',
      detail: 'Fine to be outside. If anyone at home is sensitive to air pollution, keep windows mostly closed.',
      windows: 'maybe',
    };
  }
  if (aqi <= 150) {
    return {
      headline: 'Keep the windows closed',
      detail: 'Sensitive groups should cut back on long or hard outdoor exertion. Run an air purifier if you have one.',
      windows: 'closed',
    };
  }
  if (aqi <= 200) {
    return {
      headline: 'Windows closed, purifier on',
      detail: 'Everyone should limit long or hard outdoor activity. Set HVAC to recirculate.',
      windows: 'closed',
    };
  }
  return {
    headline: 'Stay inside, seal up',
    detail: 'Avoid outdoor activity. Keep windows and doors closed, recirculate HVAC, run purifiers on high.',
    windows: 'closed',
  };
}

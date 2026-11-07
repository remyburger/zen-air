# Zen Air

Personal PWA for a PurpleAir Zen sensor: live AQI gauge, 24h / 7d history, US EPA correction, and window advice.

## Setup
1. Create a repo named `zen-air` (must match `base` in `vite.config.js`).
2. Upload everything in this folder, keeping the folder structure (including `.github/workflows/deploy.yml`).
3. Repo Settings → Pages → Source: **GitHub Actions**.
4. Open https://remyburger.github.io/zen-air/, tap ⚙, paste your PurpleAir API **read** key and the sensor read key. The sensor index is pre-filled.

## Data and points
- Uses the PurpleAir cloud API (`api.purpleair.com`). Every call spends account points.
- Live reading refreshes every 2 minutes, only while the app is open on screen.
- History uses hourly averages (24 rows for 24h, 168 for 7d). 24h refreshes every 30 minutes, 7d every hour; both are cached on the device.

## Notes
- AQI uses EPA's May 2024 PM2.5 breakpoints.
- EPA correction is the 2023 extended PurpleAir correction (handles wildfire smoke). Toggle it in Settings.
- Temperature shown is sensor temp − 8°F and humidity + 4%, PurpleAir's suggested adjustment for internal heat.

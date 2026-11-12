import { useState } from 'react';
import { DEFAULT_RES, RESOLUTIONS } from '../api.js';

export default function Settings({ cfg, onSave, onClose, canClose }) {
  const [apiKey, setApiKey] = useState(cfg.apiKey || '');
  const [sensorIndex, setSensorIndex] = useState(cfg.sensorIndex || '');
  const [readKey, setReadKey] = useState(cfg.readKey || '');
  const [useEpa, setUseEpa] = useState(cfg.useEpa ?? true);
  const [historyRes, setHistoryRes] = useState(RESOLUTIONS[cfg.historyRes] ? cfg.historyRes : DEFAULT_RES);
  const res = RESOLUTIONS[historyRes];

  const valid = apiKey.trim() && /^\d+$/.test(sensorIndex.trim());

  function submit(e) {
    e.preventDefault();
    if (!valid) return;
    onSave({
      apiKey: apiKey.trim(),
      sensorIndex: sensorIndex.trim(),
      readKey: readKey.trim(),
      useEpa,
      historyRes,
    });
  }

  return (
    <div className="sheet-backdrop" onClick={canClose ? onClose : undefined}>
      <form className="sheet" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="sheet-head">
          <h2>Settings</h2>
          {canClose && (
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          )}
        </div>

        <label>
          <span>PurpleAir API read key</span>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="From develop.purpleair.com"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck="false"
          />
          <small>
            Sign in at develop.purpleair.com, create a project, then create a <b>READ</b> key. New accounts get free
            starter points.
          </small>
        </label>

        <label>
          <span>Sensor index</span>
          <input
            value={sensorIndex}
            onChange={(e) => setSensorIndex(e.target.value)}
            inputMode="numeric"
            placeholder="e.g. 123456"
          />
        </label>

        <label>
          <span>Sensor read key (private sensors only)</span>
          <input
            value={readKey}
            onChange={(e) => setReadKey(e.target.value)}
            placeholder="Leave blank if the sensor is public"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck="false"
          />
        </label>

        <label className="toggle">
          <input type="checkbox" checked={useEpa} onChange={(e) => setUseEpa(e.target.checked)} />
          <span>
            <b>EPA correction</b>
            <small>US EPA's humidity and smoke correction. Closer to official monitors. Raises AQI a little on clean days, lowers it in smoke.</small>
          </span>
        </label>

        <div className="field">
          <span>24h chart detail</span>
          <div className="seg full" role="radiogroup" aria-label="24h chart detail">
            {Object.entries(RESOLUTIONS).map(([k, r]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={k === historyRes}
                className={k === historyRes ? 'on' : ''}
                onClick={() => setHistoryRes(k)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <small>
            {res.rows} points per day, {res.cost} API points per refresh.{' '}
            {historyRes === 'raw'
              ? 'Shows short spikes at full height, like the PurpleAir map.'
              : historyRes === 'hourly'
                ? 'Cheapest; smooths out short spikes.'
                : 'Catches most spikes, but shortens brief ones.'}
          </small>
        </div>

        <p className="fine">Keys are stored only in this browser on this device.</p>

        <button className="primary" type="submit" disabled={!valid}>
          Save
        </button>
      </form>
    </div>
  );
}

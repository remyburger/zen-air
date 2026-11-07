import { useState } from 'react';

export default function Settings({ cfg, onSave, onClose, canClose }) {
  const [apiKey, setApiKey] = useState(cfg.apiKey || '');
  const [sensorIndex, setSensorIndex] = useState(cfg.sensorIndex || '');
  const [readKey, setReadKey] = useState(cfg.readKey || '');
  const [useEpa, setUseEpa] = useState(cfg.useEpa ?? true);

  const valid = apiKey.trim() && /^\d+$/.test(sensorIndex.trim());

  function submit(e) {
    e.preventDefault();
    if (!valid) return;
    onSave({
      apiKey: apiKey.trim(),
      sensorIndex: sensorIndex.trim(),
      readKey: readKey.trim(),
      useEpa,
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
            <small>US EPA's humidity and smoke correction. Closer to official monitors; usually lowers AQI.</small>
          </span>
        </label>

        <p className="fine">Keys are stored only in this browser on this device.</p>

        <button className="primary" type="submit" disabled={!valid}>
          Save
        </button>
      </form>
    </div>
  );
}

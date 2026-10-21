import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { FORMS, DEFAULTS, OPTIONS } from '../schema.js';
import { Modal } from './ui.jsx';
import GeoMap, { cssVar } from './GeoMap.jsx';

function LocationField({ values, set }) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [msg, setMsg] = useState(null);
  const hasPos = values.lat != null && values.lat !== '' && values.lng != null && values.lng !== '';

  const geocode = async () => {
    const q = [[values.street, values.house_number].filter(Boolean).join(' '), [values.zip, values.city].filter(Boolean).join(' '), values.country]
      .filter(Boolean).join(', ');
    if (!q) return setMsg('Bitte zuerst eine Adresse eingeben.');
    setBusy(true); setMsg(null);
    try {
      const r = await api.get('/geocode?q=' + encodeURIComponent(q));
      if (!r.length) setMsg('Adresse nicht gefunden – Position bitte auf der Karte anklicken.');
      else if (r.length === 1) { set({ lat: r[0].lat, lng: r[0].lng }); setResults(null); }
      else { set({ lat: r[0].lat, lng: r[0].lng }); setResults(r); }
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wide">
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label style={{ flex: 1 }}>Breitengrad (lat)
          <input type="number" step="any" value={values.lat ?? ''} onChange={(e) => set({ lat: e.target.value })} />
        </label>
        <label style={{ flex: 1 }}>Längengrad (lng)
          <input type="number" step="any" value={values.lng ?? ''} onChange={(e) => set({ lng: e.target.value })} />
        </label>
        <button type="button" className="btn" onClick={geocode} disabled={busy}>{busy ? 'Suche …' : '📍 Aus Adresse ermitteln'}</button>
      </div>
      {results && (
        <select className="mt" onChange={(e) => { const r = results[e.target.value]; set({ lat: r.lat, lng: r.lng }); }}>
          {results.map((r, i) => <option key={i} value={i}>{r.label}</option>)}
        </select>
      )}
      {msg && <div className="small muted" style={{ marginTop: 6 }}>{msg}</div>}
      <div className="small muted" style={{ margin: '8px 0 4px' }}>Tipp: Klick in die Karte setzt die Position.</div>
      <GeoMap
        height={220}
        zoom={hasPos ? 16 : 13}
        markers={hasPos ? [{ id: 'pos', lat: Number(values.lat), lng: Number(values.lng), color: cssVar('--own-eigen') || '#2a78d6', title: 'Position' }] : []}
        onMapClick={(p) => set({ lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)) })}
      />
    </div>
  );
}

function TenantField({ value, onChange }) {
  const [tenants, setTenants] = useState([]);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ kind: 'privat', name: '' });
  useEffect(() => { api.get('/tenants').then(setTenants); }, []);

  const create = async () => {
    if (!draft.name.trim()) return;
    const t = await api.post('/tenants', draft);
    setTenants((x) => [...x, t]);
    onChange(t.id);
    setCreating(false);
  };

  if (creating) {
    return (
      <div className="row">
        <select style={{ width: 130 }} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
          {Object.entries(OPTIONS.tenant_kind).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input style={{ flex: 1, width: 'auto' }} autoFocus placeholder="Name / Firma des neuen Mieters" value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <button type="button" className="btn primary" onClick={create}>Anlegen</button>
        <button type="button" className="btn" onClick={() => setCreating(false)}>Abbrechen</button>
      </div>
    );
  }
  return (
    <div className="row">
      <select style={{ flex: 1, width: 'auto' }} value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} required>
        <option value="">– Mieter wählen –</option>
        {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}{t.kind === 'gewerblich' ? ' (gewerblich)' : ''}</option>)}
      </select>
      <button type="button" className="btn" onClick={() => setCreating(true)}>+ Neuer Mieter</button>
    </div>
  );
}

/**
 * Generisches Formular in einem Modal.
 * ctx.units: Liste der Einheiten für Felder vom Typ "unit".
 */
export default function EntityForm({ form, title, initial = {}, onSubmit, onClose, ctx = {} }) {
  const [values, setValues] = useState({ ...DEFAULTS[form], ...initial });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const fields = FORMS[form];
  const set = (patch) => setValues((v) => ({ ...v, ...patch }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const out = { ...values };
    for (const f of fields) {
      if (f.type === 'number' && out[f.name] !== undefined) out[f.name] = out[f.name] === '' || out[f.name] == null ? null : Number(out[f.name]);
      if (f.type === 'checkbox') out[f.name] = out[f.name] ? 1 : 0;
    }
    if ('lat' in out) out.lat = out.lat === '' || out.lat == null ? null : Number(out.lat);
    if ('lng' in out) out.lng = out.lng === '' || out.lng == null ? null : Number(out.lng);
    try {
      await onSubmit(out);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const renderField = (f, i) => {
    if (f.section) return <div key={'s' + i} className="form-section">{f.section}</div>;
    if (f.showIf && !f.showIf(values)) return null;
    const v = values[f.name];
    const cls = f.wide ? 'wide' : undefined;
    const req = f.required ? ' *' : '';
    switch (f.type) {
      case 'location':
        return <LocationField key={f.name} values={values} set={set} />;
      case 'tenant':
        return <label key={f.name} className={cls}>{f.label}{req}<TenantField value={v} onChange={(id) => set({ tenant_id: id })} /></label>;
      case 'unit':
        return (
          <label key={f.name} className={cls}>{f.label}
            <select value={v ?? ''} onChange={(e) => set({ unit_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Ganzes Gebäude</option>
              {(ctx.units || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
        );
      case 'select':
        return (
          <label key={f.name} className={cls}>{f.label}{req}
            <select value={v ?? ''} onChange={(e) => set({ [f.name]: e.target.value })}>
              {Object.entries(f.options).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
        );
      case 'textarea':
        return <label key={f.name} className={cls}>{f.label}<textarea value={v ?? ''} onChange={(e) => set({ [f.name]: e.target.value })} /></label>;
      case 'checkbox':
        return (
          <label key={f.name} className="check">
            <input type="checkbox" checked={!!v} onChange={(e) => set({ [f.name]: e.target.checked ? 1 : 0 })} />{f.label}
          </label>
        );
      default:
        return (
          <label key={f.name} className={cls}>{f.label}{req}
            <input type={f.type || 'text'} step={f.type === 'number' ? 'any' : undefined} required={f.required}
              placeholder={f.placeholder} value={v ?? ''} onChange={(e) => set({ [f.name]: e.target.value })} />
          </label>
        );
    }
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Abbrechen</button>
          <button className="btn primary" form="entity-form" type="submit" disabled={busy}>{busy ? 'Speichere …' : 'Speichern'}</button>
        </>
      }
    >
      {error && <div className="error">{error}</div>}
      <form id="entity-form" className="form-grid" onSubmit={submit}>
        {fields.map(renderField)}
      </form>
    </Modal>
  );
}

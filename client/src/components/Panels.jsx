import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { money, date, bytes, number } from '../format.js';
import { label, OPTIONS } from '../schema.js';
import EntityForm from './EntityForm.jsx';
import StepChart from './StepChart.jsx';
import { Empty, StatusBadge, confirmDelete } from './ui.jsx';

const strip = (o, keys) => Object.fromEntries(Object.entries(o).filter(([k]) => keys.includes(k)));
const LEASE_KEYS = ['tenant_id', 'start_date', 'end_date', 'rent_type', 'cold_rent', 'service_charges', 'heating_charges', 'vat_rate', 'deposit', 'deposit_paid', 'payment_day', 'notice_period', 'notes'];

/** Mietverhältnisse (aktuell + Historie) inkl. Mietänderungen. */
export function LeasesPanel({ leases, scope, onChange, unitArea }) {
  const [edit, setEdit] = useState(null); // { lease? }
  const [changeFor, setChangeFor] = useState(null); // { lease, change? }

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="muted">Aktuelle und frühere Mieter{scope.unit_id ? ' dieser Einheit' : ' des gesamten Gebäudes'}.</span>
        <span className="spacer" />
        <button className="btn primary" onClick={() => setEdit({})}>+ Mietverhältnis</button>
      </div>
      {!leases.length && <div className="card"><Empty>Noch keine Mietverhältnisse erfasst.</Empty></div>}
      {leases.map((l) => (
        <div key={l.id} className="card" style={{ marginBottom: 12 }}>
          <div className="card-head">
            <Link to={`/mieter/${l.tenant_id}`}><h3>{l.tenant_name}</h3></Link>
            <span className="badge">{label('tenant_kind', l.tenant_kind)}</span>
            {l.active ? <span className="badge good">aktiv</span> : l.start_date > new Date().toISOString().slice(0, 10) ? <span className="badge info">künftig</span> : <span className="badge">beendet</span>}
            {l.rent_type !== 'standard' && <span className="badge">{label('rent_type', l.rent_type)}</span>}
            <span className="spacer" />
            <button className="btn sm" onClick={() => setChangeFor({ lease: l })}>+ Mietänderung</button>
            <button className="btn sm" onClick={() => setEdit({ lease: l })}>Bearbeiten</button>
            <button className="btn sm danger" onClick={async () => (await confirmDelete('Mietverhältnis', () => api.del('/leases/' + l.id))) && onChange()}>Löschen</button>
          </div>
          <div className="card-body">
            <dl className="dl">
              <dt>Zeitraum</dt><dd>{date(l.start_date)} – {l.end_date ? date(l.end_date) : 'unbefristet'}</dd>
              <dt>Aktuelle Miete</dt>
              <dd>
                <b>{money(l.current.cold_rent)}</b> kalt
                {unitArea ? <span className="muted"> ({money(l.current.cold_rent / unitArea)}/m²)</span> : null}
                {' · '}NK {money(l.current.service_charges)} · Heizung {money(l.current.heating_charges)}
                {' · '}<b>{money(l.current.warm_rent)}</b> warm
                {l.vat_rate ? <span className="muted"> · zzgl. {l.vat_rate} % USt. = {money(l.current.gross_rent)}</span> : null}
              </dd>
              <dt>Kaution</dt><dd>{money(l.deposit)} {l.deposit != null && (l.deposit_paid ? <span className="badge good">bezahlt</span> : <span className="badge warn">offen</span>)}</dd>
              <dt>Kündigungsfrist</dt><dd>{l.notice_period || '–'} · Zahltag: {l.payment_day ?? '–'}.</dd>
              {l.notes && <><dt>Notizen</dt><dd>{l.notes}</dd></>}
            </dl>
            {l.rent_changes?.length > 0 && (
              <div className="table-wrap mt">
                <table>
                  <thead><tr><th>Gültig ab</th><th className="num">Kaltmiete</th><th className="num">NK</th><th>Grund</th><th /></tr></thead>
                  <tbody>
                    <tr><td>{date(l.start_date)}</td><td className="num">{money(l.cold_rent)}</td><td className="num">{money(l.service_charges)}</td><td className="muted">Mietbeginn</td><td /></tr>
                    {l.rent_changes.map((c) => (
                      <tr key={c.id}>
                        <td>{date(c.effective_date)}</td>
                        <td className="num">{money(c.cold_rent)}</td>
                        <td className="num">{c.service_charges != null ? money(c.service_charges) : '–'}</td>
                        <td>{c.reason}</td>
                        <td className="num">
                          <button className="btn sm ghost" onClick={() => setChangeFor({ lease: l, change: c })}>✎</button>
                          <button className="btn sm ghost danger" onClick={async () => (await confirmDelete('Mietänderung', () => api.del('/rent-changes/' + c.id))) && onChange()}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ))}
      {edit && (
        <EntityForm
          form="lease"
          title={edit.lease ? 'Mietverhältnis bearbeiten' : 'Neues Mietverhältnis'}
          initial={edit.lease ? strip(edit.lease, LEASE_KEYS) : {}}
          onClose={() => setEdit(null)}
          onSubmit={async (v) => {
            if (edit.lease) await api.put('/leases/' + edit.lease.id, v);
            else await api.post('/leases', { ...v, ...scope });
            onChange();
          }}
        />
      )}
      {changeFor && (
        <EntityForm
          form="rent_change"
          title={`Mietänderung – ${changeFor.lease.tenant_name}`}
          initial={changeFor.change ? strip(changeFor.change, ['effective_date', 'cold_rent', 'service_charges', 'heating_charges', 'reason']) : { cold_rent: changeFor.lease.current.cold_rent }}
          onClose={() => setChangeFor(null)}
          onSubmit={async (v) => {
            if (changeFor.change) await api.put('/rent-changes/' + changeFor.change.id, v);
            else await api.post('/rent-changes', { ...v, lease_id: changeFor.lease.id });
            onChange();
          }}
        />
      )}
    </div>
  );
}

/** Preisentwicklung (Diagramm + Tabelle) */
export function PriceHistoryPanel({ history, series, area }) {
  const perSqm = area > 0;
  return (
    <div className="grid-2">
      <div className="card">
        <div className="card-head"><h3>Kaltmiete pro Monat</h3></div>
        <div className="card-body">
          <StepChart
            data={(series || []).map((s) => ({ x: s.month, y: s.cold_rent, label: `${s.active_leases} aktive(s) Mietverhältnis(se)` }))}
            format={(v) => money(v, 0)}
            xFormat={(x) => new Date(x + '-01').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
          />
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Mietstufen</h3></div>
        {!history.length ? <Empty>Keine Mietdaten vorhanden.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ab</th><th>Mieter</th><th className="num">Kalt</th>{perSqm && <th className="num">€/m²</th>}<th className="num">Δ</th><th>Grund</th></tr></thead>
              <tbody>
                {history.map((p, i) => {
                  const prev = history[i - 1];
                  const delta = prev && prev.cold_rent ? ((p.cold_rent - prev.cold_rent) / prev.cold_rent) * 100 : null;
                  return (
                    <tr key={i}>
                      <td>{date(p.date)}</td>
                      <td>{p.tenant_name}</td>
                      <td className="num">{money(p.cold_rent)}</td>
                      {perSqm && <td className="num">{number(p.per_sqm)}</td>}
                      <td className="num" style={{ color: delta > 0 ? 'var(--good)' : delta < 0 ? 'var(--danger)' : undefined }}>
                        {delta == null ? '–' : (delta > 0 ? '+' : '') + number(Math.round(delta * 10) / 10) + ' %'}
                      </td>
                      <td className="muted">{p.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Ereignisse wie Reparaturen, Wartungen, Schäden */
export function EventsPanel({ events, scope, units, onChange, showUnit }) {
  const [edit, setEdit] = useState(null);
  const [filter, setFilter] = useState('');
  const list = filter ? events.filter((e) => e.status === filter) : events;
  const total = list.reduce((s, e) => s + (e.cost || 0), 0);
  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <select style={{ width: 180 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Alle Status</option>
          {Object.entries(OPTIONS.event_status).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="muted">Summe Kosten: <b>{money(total)}</b></span>
        <span className="spacer" />
        <button className="btn primary" onClick={() => setEdit({})}>+ Ereignis</button>
      </div>
      <div className="card table-wrap">
        {!list.length ? <Empty>Keine Ereignisse erfasst.</Empty> : (
          <table>
            <thead><tr><th>Datum</th><th>Kategorie</th><th>Titel</th>{showUnit && <th>Einheit</th>}<th>Firma</th><th>Status</th><th className="num">Kosten</th><th /></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id}>
                  <td>{date(e.event_date)}</td>
                  <td>{label('event_category', e.category)}</td>
                  <td><b>{e.title}</b>{e.description && <div className="small muted">{e.description}</div>}</td>
                  {showUnit && <td>{e.unit_name ? <Link to={`/einheiten/${e.unit_id}`}>{e.unit_name}</Link> : <span className="muted">Gebäude</span>}</td>}
                  <td>{e.contractor || '–'}</td>
                  <td><StatusBadge status={e.status} /></td>
                  <td className="num">{money(e.cost)}</td>
                  <td className="num">
                    <button className="btn sm ghost" onClick={() => setEdit({ event: e })}>✎</button>
                    <button className="btn sm ghost danger" onClick={async () => (await confirmDelete('Ereignis', () => api.del('/events/' + e.id))) && onChange()}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {edit && (
        <EntityForm
          form="event"
          title={edit.event ? 'Ereignis bearbeiten' : 'Neues Ereignis'}
          ctx={{ units: scope.unit_id ? [] : units }}
          initial={edit.event ? strip(edit.event, ['event_date', 'category', 'title', 'unit_id', 'status', 'cost', 'contractor', 'description']) : { event_date: new Date().toISOString().slice(0, 10), unit_id: scope.unit_id }}
          onClose={() => setEdit(null)}
          onSubmit={async (v) => {
            if (scope.unit_id) v.unit_id = scope.unit_id;
            if (edit.event) await api.put('/events/' + edit.event.id, v);
            else await api.post('/events', { ...v, building_id: scope.building_id });
            onChange();
          }}
        />
      )}
    </div>
  );
}

const MONTHLY = { monatlich: 1, quartal: 1 / 3, jaehrlich: 1 / 12, einmalig: 0 };

/** Laufende Kosten */
export function CostsPanel({ costs, scope, units, onChange }) {
  const [edit, setEdit] = useState(null);
  const monthly = costs.reduce((s, c) => s + c.amount * (MONTHLY[c.interval] ?? 1), 0);
  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="muted">Laufende Kosten: <b>{money(monthly)}</b> / Monat · <b>{money(monthly * 12)}</b> / Jahr</span>
        <span className="spacer" />
        <button className="btn primary" onClick={() => setEdit({})}>+ Kostenposition</button>
      </div>
      <div className="card table-wrap">
        {!costs.length ? <Empty>Keine laufenden Kosten erfasst.</Empty> : (
          <table>
            <thead><tr><th>Bezeichnung</th><th>Kategorie</th><th>Turnus</th><th>Umlegbar</th><th className="num">Betrag</th><th className="num">pro Monat</th><th /></tr></thead>
            <tbody>
              {costs.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.title}</b>{c.notes && <div className="small muted">{c.notes}</div>}</td>
                  <td>{label('cost_category', c.category)}</td>
                  <td>{label('interval', c.interval)}</td>
                  <td>{c.allocatable ? 'ja' : 'nein'}</td>
                  <td className="num">{money(c.amount)}</td>
                  <td className="num">{money(c.amount * (MONTHLY[c.interval] ?? 1))}</td>
                  <td className="num">
                    <button className="btn sm ghost" onClick={() => setEdit({ cost: c })}>✎</button>
                    <button className="btn sm ghost danger" onClick={async () => (await confirmDelete('Kostenposition', () => api.del('/costs/' + c.id))) && onChange()}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {edit && (
        <EntityForm
          form="cost"
          title={edit.cost ? 'Kostenposition bearbeiten' : 'Neue Kostenposition'}
          ctx={{ units: scope.unit_id ? [] : units }}
          initial={edit.cost ? strip(edit.cost, ['title', 'category', 'unit_id', 'amount', 'interval', 'allocatable', 'start_date', 'end_date', 'notes']) : { unit_id: scope.unit_id }}
          onClose={() => setEdit(null)}
          onSubmit={async (v) => {
            if (scope.unit_id) v.unit_id = scope.unit_id;
            if (edit.cost) await api.put('/costs/' + edit.cost.id, v);
            else await api.post('/costs', { ...v, building_id: scope.building_id });
            onChange();
          }}
        />
      )}
    </div>
  );
}

/** Dokumente hochladen, ansehen, herunterladen */
export function DocumentsPanel({ documents, scope, units, onChange, showUnit }) {
  const [category, setCategory] = useState('mietvertrag');
  const [unitId, setUnitId] = useState(scope.unit_id ?? '');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const upload = async (files) => {
    if (!files?.length) return;
    const fd = new FormData();
    [...files].forEach((f) => fd.append('files', f));
    fd.append('building_id', scope.building_id);
    if (unitId) fd.append('unit_id', unitId);
    fd.append('category', category);
    setBusy(true); setError(null);
    try {
      await api.post('/documents', fd);
      onChange();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {error && <div className="error">{error}</div>}
      <div
        className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files); }}
      >
        <div className="row" style={{ justifyContent: 'center' }}>
          <select style={{ width: 200 }} value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(OPTIONS.doc_category).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {!scope.unit_id && units?.length > 0 && (
            <select style={{ width: 200 }} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">Ganzes Gebäude</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          <label className="btn primary">
            {busy ? 'Lade hoch …' : 'Dateien auswählen'}
            <input type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
          </label>
        </div>
        <div className="small" style={{ marginTop: 8 }}>… oder Dateien hierher ziehen (PDF, Bilder, Office, max. 50 MB)</div>
      </div>
      <div className="card table-wrap mt">
        {!documents.length ? <Empty>Noch keine Dokumente.</Empty> : (
          <table>
            <thead><tr><th>Dokument</th><th>Kategorie</th>{showUnit && <th>Einheit</th>}<th>Hochgeladen</th><th className="num">Größe</th><th /></tr></thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id}>
                  <td>
                    <a href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer"><b>{d.title || d.original_name}</b></a>
                    {d.title && <div className="small muted">{d.original_name}</div>}
                  </td>
                  <td>{label('doc_category', d.category)}</td>
                  {showUnit && <td>{d.unit_name || <span className="muted">Gebäude</span>}</td>}
                  <td>{date(d.uploaded_at?.slice(0, 10))}</td>
                  <td className="num">{bytes(d.size || 0)}</td>
                  <td className="num">
                    <a className="btn sm ghost" href={`/api/documents/${d.id}/file?download=1`}>⬇</a>
                    <button className="btn sm ghost danger" onClick={async () => (await confirmDelete('Dokument', () => api.del('/documents/' + d.id))) && onChange()}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

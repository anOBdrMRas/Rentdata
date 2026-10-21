import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useData, Loading, Empty, confirmDelete } from '../components/ui.jsx';
import EntityForm from '../components/EntityForm.jsx';
import { MasterData } from './BuildingDetail.jsx';
import { money, date } from '../format.js';
import { FORMS, OPTIONS, label } from '../schema.js';

const TENANT_KEYS = FORMS.tenant.map((f) => f.name);

export default function Tenants() {
  const [data, reload, err] = useData('/tenants');
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [active, setActive] = useState('');
  const [creating, setCreating] = useState(false);
  const list = useMemo(() => (data || []).filter((t) =>
    (!kind || t.kind === kind) &&
    (!active || (active === 'aktiv' ? t.active_leases.length > 0 : t.active_leases.length === 0)) &&
    (!q || `${t.name} ${t.contact_person || ''} ${t.email || ''}`.toLowerCase().includes(q.toLowerCase()))
  ), [data, q, kind, active]);

  if (!data) return <Loading error={err} />;
  return (
    <>
      <div className="page-head">
        <div><h1>Mieter</h1><div className="sub">{list.length} Mieter (privat & gewerblich), inkl. ehemaliger Mieter</div></div>
        <button className="btn primary" onClick={() => setCreating(true)}>+ Mieter anlegen</button>
      </div>
      <div className="filters">
        <input placeholder="Suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">Privat & gewerblich</option>
          {Object.entries(OPTIONS.tenant_kind).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={active} onChange={(e) => setActive(e.target.value)}>
          <option value="">Aktuelle & ehemalige</option>
          <option value="aktiv">Nur aktuelle</option>
          <option value="ehemalig">Nur ehemalige</option>
        </select>
      </div>
      <div className="card table-wrap">
        {!list.length ? <Empty>Keine Mieter gefunden.</Empty> : (
          <table>
            <thead><tr><th>Name</th><th>Art</th><th>Kontakt</th><th>Aktuell gemietet</th><th className="num">Verträge</th></tr></thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} className="click" onClick={() => nav(`/mieter/${t.id}`)}>
                  <td><b>{t.name}</b>{t.contact_person && <div className="small muted">{t.contact_person}</div>}</td>
                  <td>{label('tenant_kind', t.kind)}</td>
                  <td className="small">{t.email}<br />{t.phone}</td>
                  <td className="small">{t.active_leases.map((l) => `${l.building_name}${l.unit_name ? ' · ' + l.unit_name : ''}`).join('; ') || <span className="muted">ehemalig / ohne Vertrag</span>}</td>
                  <td className="num">{t.lease_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {creating && (
        <EntityForm form="tenant" title="Neuer Mieter" onClose={() => setCreating(false)} onSubmit={async (v) => { await api.post('/tenants', v); reload(); }} />
      )}
    </>
  );
}

export function TenantDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [t, reload, err] = useData('/tenants/' + id);
  const [editing, setEditing] = useState(false);
  if (!t) return <Loading error={err} />;
  return (
    <>
      <div className="crumbs"><Link to="/mieter">Mieter</Link> / {t.name}</div>
      <div className="page-head">
        <div className="row"><h1>{t.name}</h1><span className="badge">{label('tenant_kind', t.kind)}</span></div>
        <div className="row">
          <button className="btn" onClick={() => setEditing(true)}>Bearbeiten</button>
          <button className="btn danger" onClick={async () => (await confirmDelete('Mieter', () => api.del('/tenants/' + t.id))) && nav('/mieter')}>Löschen</button>
        </div>
      </div>
      <div className="grid-2">
        <div className="card card-body"><MasterData obj={t} fields={FORMS.tenant} /></div>
        <div className="card table-wrap">
          <div className="card-head"><h3>Mietverhältnisse</h3></div>
          {!t.leases.length ? <Empty>Keine Mietverhältnisse. Mietverhältnisse legst du in der Einheit bzw. im Gebäude an.</Empty> : (
            <table>
              <thead><tr><th>Objekt</th><th>Zeitraum</th><th className="num">Kalt aktuell</th></tr></thead>
              <tbody>
                {t.leases.map((l) => (
                  <tr key={l.id} className="click" onClick={() => nav(l.unit_id ? `/einheiten/${l.unit_id}` : `/gebaeude/${l.building_id}?tab=mieter`)}>
                    <td><b>{l.unit_name || 'Ganzes Gebäude'}</b><div className="small muted">{l.building_name}</div></td>
                    <td>{date(l.start_date)} – {l.end_date ? date(l.end_date) : 'unbefristet'} {l.active && <span className="badge good">aktiv</span>}</td>
                    <td className="num">{money(l.current.cold_rent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {editing && (
        <EntityForm form="tenant" title="Mieter bearbeiten" initial={Object.fromEntries(TENANT_KEYS.map((k) => [k, t[k]]))}
          onClose={() => setEditing(false)} onSubmit={async (v) => { await api.put('/tenants/' + t.id, v); reload(); }} />
      )}
    </>
  );
}

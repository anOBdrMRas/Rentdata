import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData, Loading, StatusBadge, OwnershipBadge, Empty } from '../components/ui.jsx';
import { money, number } from '../format.js';
import { OPTIONS, label } from '../schema.js';

export default function Units() {
  const [data, , err] = useData('/units');
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [usage, setUsage] = useState('');
  const [status, setStatus] = useState('');
  const list = useMemo(() => (data || [])
    .filter((u) => (!usage || (usage === 'privat' ? u.usage_type === 'wohnung' : usage === 'gewerblich' ? !['wohnung', 'stellplatz'].includes(u.usage_type) : u.usage_type === usage)))
    .filter((u) => !status || u.stats.status === status)
    .filter((u) => !q || `${u.name} ${u.building_name} ${u.stats.current_tenants.map((t) => t.name).join(' ')}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.building_name.localeCompare(b.building_name, 'de') || a.name.localeCompare(b.name, 'de', { numeric: true })),
  [data, q, usage, status]);

  if (!data) return <Loading error={err} />;
  return (
    <>
      <div className="page-head">
        <div><h1>Mieteinheiten</h1><div className="sub">{list.length} Einheiten · neue Einheiten legst du im jeweiligen Gebäude an</div></div>
      </div>
      <div className="filters">
        <input placeholder="Suchen (Einheit, Gebäude, Mieter) …" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
        <select value={usage} onChange={(e) => setUsage(e.target.value)}>
          <option value="">Alle Nutzungsarten</option>
          <option value="privat">Wohnen (privat)</option>
          <option value="gewerblich">Gewerblich (alle)</option>
          {Object.entries(OPTIONS.usage_type).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Alle Status</option>
          {Object.entries(OPTIONS.unit_status).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="card table-wrap">
        {!list.length ? <Empty>Keine Einheiten gefunden.</Empty> : (
          <table>
            <thead><tr><th>Einheit</th><th>Gebäude</th><th>Nutzung</th><th>Eigentum</th><th>Status</th><th>Mieter</th><th className="num">Fläche</th><th className="num">Kalt</th><th className="num">€/m²</th></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className="click" onClick={() => nav(`/einheiten/${u.id}`)}>
                  <td><b>{u.name}</b></td>
                  <td>{u.building_name}</td>
                  <td>{label('usage_type', u.usage_type)}</td>
                  <td><OwnershipBadge value={u.stats.ownership_effective} group="unit_ownership" /></td>
                  <td><StatusBadge status={u.stats.status} /></td>
                  <td>{u.stats.current_tenants.map((t) => t.name).join(', ') || '–'}</td>
                  <td className="num">{number(u.area, 'm²')}</td>
                  <td className="num">{money(u.stats.current_cold_rent, 0)}</td>
                  <td className="num">{u.stats.rent_per_sqm ? money(u.stats.rent_per_sqm) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

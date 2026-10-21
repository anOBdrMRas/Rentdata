import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useData, Loading, OwnershipBadge, Empty } from '../components/ui.jsx';
import EntityForm from '../components/EntityForm.jsx';
import { money, number, pct, address } from '../format.js';
import { OPTIONS, label } from '../schema.js';

export function useBuildingFilter(buildings) {
  const [q, setQ] = useState('');
  const [own, setOwn] = useState('');
  const [type, setType] = useState('');
  const list = useMemo(() => (buildings || []).filter((b) => {
    if (own && b.ownership !== own) return false;
    if (type && b.building_type !== type) return false;
    if (q && !`${b.name} ${address(b)} ${b.owner_name || ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [buildings, q, own, type]);
  const controls = (
    <div className="filters">
      <input placeholder="Suchen (Name, Adresse, Eigentümer) …" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 260 }} />
      <select value={own} onChange={(e) => setOwn(e.target.value)}>
        <option value="">Alle Eigentumsverhältnisse</option>
        {Object.entries(OPTIONS.ownership).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <select value={type} onChange={(e) => setType(e.target.value)}>
        <option value="">Alle Gebäudearten</option>
        {Object.entries(OPTIONS.building_type).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  );
  return [list, controls];
}

export default function Buildings() {
  const [data, , err] = useData('/buildings');
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const [list, controls] = useBuildingFilter(data);
  const creating = params.get('neu') === '1';

  if (!data) return <Loading error={err} />;
  const sum = (k) => list.reduce((s, b) => s + (b.stats[k] || 0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Gebäude</h1>
          <div className="sub">{list.length} von {data.length} Gebäuden</div>
        </div>
        <button className="btn primary" onClick={() => setParams({ neu: '1' })}>+ Gebäude anlegen</button>
      </div>
      {controls}
      <div className="card table-wrap">
        {!list.length ? <Empty>Keine Gebäude gefunden.</Empty> : (
          <table>
            <thead>
              <tr>
                <th>Gebäude</th><th>Art</th><th>Eigentum</th>
                <th className="num">Einheiten</th><th className="num">Belegung</th><th className="num">Fläche</th>
                <th className="num">Kaltmiete/Monat</th><th className="num">Jahr (eigen)</th><th className="num">Rendite</th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.id} className="click" onClick={() => nav(`/gebaeude/${b.id}`)}>
                  <td><b>{b.name}</b><div className="small muted">{address(b)}</div></td>
                  <td>{label('building_type', b.building_type)}</td>
                  <td><OwnershipBadge value={b.ownership} />{b.owner_name && <div className="small muted">{b.owner_name}</div>}</td>
                  <td className="num">{b.stats.unit_count || (b.stats.rented_as_whole ? 'ganzes Objekt' : '–')}</td>
                  <td className="num">{pct(b.stats.occupancy_rate)}</td>
                  <td className="num">{number(b.stats.total_unit_area || b.living_area || b.commercial_area, 'm²')}</td>
                  <td className="num">{money(b.stats.monthly_cold_rent, 0)}</td>
                  <td className="num">{money(b.stats.annual_cold_rent_own, 0)}</td>
                  <td className="num">{pct(b.stats.gross_yield)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={3}>Summe</th>
                <th className="num">{sum('unit_count')}</th><th />
                <th className="num">{number(sum('total_unit_area'), 'm²')}</th>
                <th className="num">{money(sum('monthly_cold_rent'), 0)}</th>
                <th className="num">{money(sum('annual_cold_rent_own'), 0)}</th><th />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      {creating && (
        <EntityForm
          form="building"
          title="Neues Gebäude"
          onClose={() => setParams({})}
          onSubmit={async (v) => {
            const b = await api.post('/buildings', v);
            setTimeout(() => nav(`/gebaeude/${b.id}`), 0);
          }}
        />
      )}
    </>
  );
}

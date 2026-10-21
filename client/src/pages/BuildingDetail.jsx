import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useData, Loading, Kpi, Tabs, OwnershipBadge, StatusBadge, Empty, confirmDelete } from '../components/ui.jsx';
import EntityForm from '../components/EntityForm.jsx';
import GeoMap, { cssVar } from '../components/GeoMap.jsx';
import { LeasesPanel, PriceHistoryPanel, EventsPanel, CostsPanel, DocumentsPanel } from '../components/Panels.jsx';
import { money, number, pct, date, address } from '../format.js';
import { FORMS, label } from '../schema.js';

const BUILDING_KEYS = FORMS.building.filter((f) => f.name && f.name !== 'location').map((f) => f.name).concat(['lat', 'lng']);

export function MasterData({ obj, fields, group }) {
  return (
    <dl className="dl">
      {fields.filter((f) => f.name && f.type !== 'location').map((f) => {
        let v = obj[f.name];
        if (v == null || v === '') return null;
        if (f.type === 'select') v = f.options[v] ?? v;
        else if (f.type === 'date') v = date(v);
        else if (f.type === 'checkbox') v = v ? 'ja' : 'nein';
        else if (f.type === 'number') v = /\(€/.test(f.label) ? money(v, 0) : number(v);
        return <FragmentRow key={f.name} k={f.label.replace(/ \(.*\)$/, '').replace(' (falls nicht eigen)', '')} v={v} group={group} />;
      })}
    </dl>
  );
}
const FragmentRow = ({ k, v }) => (<><dt>{k}</dt><dd>{v}</dd></>);

export default function BuildingDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [b, reload, err] = useData('/buildings/' + id);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'einheiten';
  const setTab = (t) => setParams({ tab: t }, { replace: true });
  const [editing, setEditing] = useState(false);
  const [addUnit, setAddUnit] = useState(false);

  if (!b) return <Loading error={err} />;
  const s = b.stats;
  const scope = { building_id: b.id, unit_id: null };
  const hasUnits = b.units.length > 0;
  const area = b.living_area || b.commercial_area;

  return (
    <>
      <div className="crumbs"><Link to="/gebaeude">Gebäude</Link> / {b.name}</div>
      <div className="page-head">
        <div>
          <div className="row"><h1>{b.name}</h1><OwnershipBadge value={b.ownership} /><span className="badge">{label('building_type', b.building_type)}</span></div>
          <div className="sub">{address(b) || 'Keine Adresse'}{b.owner_name ? ` · Eigentümer: ${b.owner_name}` : ''}{b.property_manager ? ` · Verwaltung: ${b.property_manager}` : ''}</div>
        </div>
        <div className="row">
          {b.lat != null && <Link className="btn" to={`/karte?b=${b.id}`}>Auf Karte</Link>}
          <button className="btn" onClick={() => setEditing(true)}>Bearbeiten</button>
          <button className="btn danger" onClick={async () => {
            if (await confirmDelete(`Gebäude „${b.name}“ inkl. aller Einheiten, Mietverhältnisse, Ereignisse und Dokumente`, () => api.del('/buildings/' + b.id))) nav('/gebaeude');
          }}>Löschen</button>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Mieteinheiten" value={s.unit_count || '–'} sub={hasUnits ? `${s.units_rented} vermietet · ${s.units_vacant} leer${s.units_owned !== s.unit_count ? ` · ${s.units_owned} eigen` : ''}` : s.rented_as_whole ? 'als Ganzes vermietet' : 'keine Einheiten'} />
        <Kpi label="Belegung" value={pct(s.occupancy_rate)} sub={hasUnits ? `${number(s.rented_area)} von ${number(s.total_unit_area)} m²` : undefined} />
        <Kpi label="Kaltmiete / Monat" value={money(s.monthly_cold_rent, 0)} sub={s.monthly_cold_rent_own !== s.monthly_cold_rent ? `davon eigen ${money(s.monthly_cold_rent_own, 0)}` : `warm ${money(s.monthly_warm_rent, 0)}`} />
        <Kpi label="Einnahmen / Jahr (kalt, eigen)" value={money(s.annual_cold_rent_own, 0)} />
        <Kpi label="Ø Miete / m²" value={s.avg_rent_per_sqm ? money(s.avg_rent_per_sqm) : '–'} />
        <Kpi label="Kosten / Monat" value={money(s.monthly_costs, 0)} sub={`Cashflow ${money(s.monthly_cashflow, 0)}`} />
        <Kpi label="Bruttorendite" value={pct(s.gross_yield)} sub={b.purchase_price ? `Kaufpreis ${money(b.purchase_price, 0)}` : 'kein Kaufpreis'} />
        <Kpi label="Reparaturen lfd. Jahr" value={money(s.repair_costs_year, 0)} sub={`${s.open_events} offen`} />
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'einheiten', label: 'Mieteinheiten', count: b.units.length },
          { id: 'mieter', label: hasUnits ? 'Gesamtvermietung' : 'Mietverhältnisse', count: b.leases.length },
          { id: 'entwicklung', label: 'Entwicklung' },
          { id: 'ereignisse', label: 'Ereignisse', count: b.events.length },
          { id: 'kosten', label: 'Kosten', count: b.costs.length },
          { id: 'dokumente', label: 'Dokumente', count: b.documents.length },
          { id: 'stammdaten', label: 'Stammdaten' },
        ]}
      />

      {tab === 'einheiten' && (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <span className="muted">
              {hasUnits ? 'Klick auf eine Einheit öffnet Stammdaten, Mieter, Preisentwicklung und Dokumente.' : 'Dieses Gebäude hat (noch) keine Mieteinheiten. Es kann auch als Ganzes vermietet werden (Reiter „Mietverhältnisse“).'}
            </span>
            <span className="spacer" />
            <button className="btn primary" onClick={() => setAddUnit(true)}>+ Mieteinheit hinzufügen</button>
          </div>
          {!hasUnits ? (
            <div className="card"><Empty>Keine Mieteinheiten.</Empty></div>
          ) : (
            <div className="unit-cards">
              {b.units.map((u) => (
                <div key={u.id} className="card unit-card" onClick={() => nav(`/einheiten/${u.id}`)}>
                  <div className="uc-head">
                    <div><b>{u.name}</b><div className="small muted">{label('usage_type', u.usage_type)}{u.floor ? ' · ' + u.floor : ''}</div></div>
                    <StatusBadge status={u.stats.status} />
                  </div>
                  <div className="uc-rent">{u.stats.status === 'vermietet' ? money(u.stats.current_cold_rent, 0) : u.target_rent ? <span className="muted">Soll {money(u.target_rent, 0)}</span> : '–'}</div>
                  <div className="small muted">
                    {number(u.area, 'm²')}{u.rooms ? ` · ${number(u.rooms)} Zi.` : ''}{u.stats.rent_per_sqm ? ` · ${money(u.stats.rent_per_sqm)}/m²` : ''}
                  </div>
                  <div className="small" style={{ marginTop: 6 }}>
                    {u.stats.current_tenants.map((t) => t.name).join(', ') || <span className="muted">kein Mieter</span>}
                  </div>
                  {u.stats.ownership_effective === 'fremd' && <div style={{ marginTop: 6 }}><OwnershipBadge value="fremd" group="unit_ownership" /></div>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'mieter' && (
        <>
          {hasUnits && <div className="muted" style={{ marginBottom: 8 }}>Hier nur Mietverhältnisse über das <b>gesamte Gebäude</b>. Mieter einzelner Einheiten findest du in der jeweiligen Einheit.</div>}
          <LeasesPanel leases={b.leases} scope={scope} onChange={reload} unitArea={area} />
        </>
      )}

      {tab === 'entwicklung' && (
        <>
          <PriceHistoryPanel history={b.price_history} series={b.series} area={area} />
          {hasUnits && (
            <div className="card mt table-wrap">
              <div className="card-head"><h3>Mieten je Einheit</h3></div>
              <table>
                <thead><tr><th>Einheit</th><th>Status</th><th className="num">Fläche</th><th className="num">Kalt</th><th className="num">€/m²</th><th className="num">Soll</th><th className="num">Potenzial</th></tr></thead>
                <tbody>
                  {b.units.map((u) => (
                    <tr key={u.id} className="click" onClick={() => nav(`/einheiten/${u.id}?tab=preis`)}>
                      <td>{u.name}</td><td><StatusBadge status={u.stats.status} /></td>
                      <td className="num">{number(u.area, 'm²')}</td>
                      <td className="num">{money(u.stats.current_cold_rent, 0)}</td>
                      <td className="num">{u.stats.rent_per_sqm ? money(u.stats.rent_per_sqm) : '–'}</td>
                      <td className="num">{money(u.target_rent, 0)}</td>
                      <td className="num">{u.target_rent ? money(u.target_rent - u.stats.current_cold_rent, 0) : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'ereignisse' && <EventsPanel events={b.events} scope={scope} units={b.units} onChange={reload} showUnit />}
      {tab === 'kosten' && <CostsPanel costs={b.costs} scope={scope} units={b.units} onChange={reload} />}
      {tab === 'dokumente' && <DocumentsPanel documents={b.documents} scope={scope} units={b.units} onChange={reload} showUnit />}

      {tab === 'stammdaten' && (
        <div className="grid-2">
          <div className="card card-body"><MasterData obj={b} fields={FORMS.building} /></div>
          <div className="card card-body">
            {b.lat != null ? (
              <GeoMap height={360} zoom={16} markers={[{ id: b.id, lat: b.lat, lng: b.lng, color: cssVar('--own-' + b.ownership), title: b.name }]} />
            ) : <Empty>Keine Koordinaten hinterlegt – über „Bearbeiten“ ermitteln.</Empty>}
          </div>
        </div>
      )}

      {editing && (
        <EntityForm
          form="building"
          title="Gebäude bearbeiten"
          initial={Object.fromEntries(BUILDING_KEYS.map((k) => [k, b[k]]))}
          onClose={() => setEditing(false)}
          onSubmit={async (v) => { await api.put('/buildings/' + b.id, v); reload(); }}
        />
      )}
      {addUnit && (
        <EntityForm
          form="unit"
          title={`Neue Mieteinheit in ${b.name}`}
          onClose={() => setAddUnit(false)}
          onSubmit={async (v) => { await api.post('/units', { ...v, building_id: b.id }); reload(); }}
        />
      )}
    </>
  );
}

import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useData, Loading, Kpi, Tabs, OwnershipBadge, StatusBadge, confirmDelete } from '../components/ui.jsx';
import EntityForm from '../components/EntityForm.jsx';
import { LeasesPanel, PriceHistoryPanel, EventsPanel, CostsPanel, DocumentsPanel } from '../components/Panels.jsx';
import { MasterData } from './BuildingDetail.jsx';
import { money, number, date, address } from '../format.js';
import { FORMS, label } from '../schema.js';

const UNIT_KEYS = FORMS.unit.map((f) => f.name);

export default function UnitDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [u, reload, err] = useData('/units/' + id);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'mieter';
  const [editing, setEditing] = useState(false);

  if (!u) return <Loading error={err} />;
  const s = u.stats;
  const scope = { building_id: u.building_id, unit_id: u.id };
  const current = u.leases.find((l) => l.active);
  const repairs = u.events.reduce((a, e) => a + (e.cost || 0), 0);
  const first = u.price_history[0];

  return (
    <>
      <div className="crumbs">
        <Link to="/gebaeude">Gebäude</Link> / <Link to={`/gebaeude/${u.building_id}`}>{u.building.name}</Link> / {u.name}
      </div>
      <div className="page-head">
        <div>
          <div className="row">
            <h1>{u.name}</h1>
            <StatusBadge status={s.status} />
            <span className="badge">{label('usage_type', u.usage_type)}</span>
            <OwnershipBadge value={s.ownership_effective} group="unit_ownership" />
          </div>
          <div className="sub">{address(u.building)}{u.floor ? ' · ' + u.floor : ''}{u.owner_name ? ' · Eigentümer: ' + u.owner_name : ''}</div>
        </div>
        <div className="row">
          <button className="btn" onClick={() => setEditing(true)}>Bearbeiten</button>
          <button className="btn danger" onClick={async () => {
            if (await confirmDelete(`Einheit „${u.name}“ inkl. Mietverhältnissen, Ereignissen und Dokumenten`, () => api.del('/units/' + u.id))) nav(`/gebaeude/${u.building_id}`);
          }}>Löschen</button>
        </div>
      </div>

      <div className="kpis">
        <Kpi label="Aktueller Mieter" value={<span style={{ fontSize: 16 }}>{s.current_tenants.map((t) => t.name).join(', ') || '–'}</span>} sub={current ? `seit ${date(current.start_date)}` : s.next_lease_start ? `Einzug am ${date(s.next_lease_start)}` : undefined} />
        <Kpi label="Kaltmiete" value={money(s.current_cold_rent)} sub={s.rent_per_sqm ? `${money(s.rent_per_sqm)} / m²` : undefined} />
        <Kpi label="Warmmiete" value={money(s.current_warm_rent)} sub={current?.vat_rate ? `zzgl. ${current.vat_rate} % USt.` : undefined} />
        <Kpi label="Fläche" value={number(u.area, 'm²')} sub={u.rooms ? `${number(u.rooms)} Zimmer` : undefined} />
        <Kpi label="Soll-Miete" value={money(u.target_rent, 0)} sub={u.target_rent && s.current_cold_rent ? `Differenz ${money(u.target_rent - s.current_cold_rent, 0)}` : undefined} />
        <Kpi label="Mietentwicklung" value={first && s.current_cold_rent ? (s.current_cold_rent >= first.cold_rent ? '+' : '') + number(Math.round(((s.current_cold_rent - first.cold_rent) / first.cold_rent) * 1000) / 10) + ' %' : '–'} sub={first ? `seit ${date(first.date)}` : undefined} />
        <Kpi label="Mieter bisher" value={u.leases.length} />
        <Kpi label="Reparaturkosten gesamt" value={money(repairs, 0)} />
      </div>

      <Tabs
        active={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        tabs={[
          { id: 'mieter', label: 'Mieter & Verträge', count: u.leases.length },
          { id: 'preis', label: 'Preisentwicklung' },
          { id: 'ereignisse', label: 'Ereignisse', count: u.events.length },
          { id: 'dokumente', label: 'Dokumente', count: u.documents.length },
          { id: 'kosten', label: 'Kosten', count: u.costs.length },
          { id: 'stammdaten', label: 'Stammdaten' },
        ]}
      />

      {tab === 'mieter' && <LeasesPanel leases={u.leases} scope={scope} onChange={reload} unitArea={u.area} />}
      {tab === 'preis' && <PriceHistoryPanel history={u.price_history} series={u.series} area={u.area} />}
      {tab === 'ereignisse' && <EventsPanel events={u.events} scope={scope} onChange={reload} />}
      {tab === 'dokumente' && <DocumentsPanel documents={u.documents} scope={scope} onChange={reload} />}
      {tab === 'kosten' && <CostsPanel costs={u.costs} scope={scope} onChange={reload} />}
      {tab === 'stammdaten' && <div className="card card-body"><MasterData obj={u} fields={FORMS.unit} /></div>}

      {editing && (
        <EntityForm
          form="unit"
          title="Einheit bearbeiten"
          initial={Object.fromEntries(UNIT_KEYS.map((k) => [k, u[k]]))}
          onClose={() => setEditing(false)}
          onSubmit={async (v) => { await api.put('/units/' + u.id, v); reload(); }}
        />
      )}
    </>
  );
}

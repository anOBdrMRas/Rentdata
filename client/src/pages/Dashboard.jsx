import { Link, useNavigate } from 'react-router-dom';
import { useData, Loading, Kpi, Empty, StatusBadge } from '../components/ui.jsx';
import StepChart from '../components/StepChart.jsx';
import { money, date, number } from '../format.js';
import { label } from '../schema.js';

export default function Dashboard() {
  const [d, , err] = useData('/dashboard');
  const nav = useNavigate();
  if (!d) return <Loading error={err} />;
  const t = d.totals;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Übersicht</h1>
          <div className="sub">Portfolio auf einen Blick – Stand {date(new Date().toISOString().slice(0, 10))}</div>
        </div>
        <div className="row">
          <Link className="btn" to="/karte">Karte öffnen</Link>
          <Link className="btn primary" to="/gebaeude?neu=1">+ Gebäude</Link>
        </div>
      </div>
      <div className="kpis">
        <Kpi label="Gebäude" value={t.buildings} sub={`${t.buildings_owned} im Eigentum`} />
        <Kpi label="Mieteinheiten" value={t.units} sub={`${t.units_rented} vermietet · ${t.units_vacant} leer`} />
        <Kpi label="Aktive Mieter" value={t.tenants} />
        <Kpi label="Kaltmiete / Monat (eigen)" value={money(t.monthly_cold_rent_own, 0)} sub={`gesamt verwaltet ${money(t.monthly_cold_rent, 0)}`} />
        <Kpi label="Kaltmiete / Jahr (eigen)" value={money(t.annual_cold_rent_own, 0)} />
        <Kpi label="Laufende Kosten / Monat" value={money(t.monthly_costs, 0)} />
        <Kpi label="Cashflow / Monat (warm – Kosten)" value={money(t.monthly_cashflow, 0)} />
        <Kpi label="Reparaturen lfd. Jahr" value={money(t.repair_costs_year, 0)} sub={`${number(t.open_events)} offene Ereignisse`} />
      </div>

      <div className="card">
        <div className="card-head"><h3>Mieteinnahmen kalt pro Monat (alle Objekte, 36 Monate)</h3></div>
        <div className="card-body">
          <StepChart
            data={d.series.map((s) => ({ x: s.month, y: s.cold_rent, label: `${s.active_leases} aktive Mietverhältnisse` }))}
            format={(v) => money(v, 0)}
            xFormat={(x) => new Date(x + '-01').toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
          />
        </div>
      </div>

      <div className="grid-2 mt">
        <div className="card">
          <div className="card-head"><h3>Offene Ereignisse</h3><span className="spacer" /><Link to="/ereignisse" className="small">alle</Link></div>
          {!d.open_events.length ? <Empty>Nichts offen 🎉</Empty> : (
            <table>
              <tbody>
                {d.open_events.map((e) => (
                  <tr key={e.id} className="click" onClick={() => nav(e.unit_id ? `/einheiten/${e.unit_id}` : `/gebaeude/${e.building_id}`)}>
                    <td>{date(e.event_date)}</td>
                    <td><b>{e.title}</b><div className="small muted">{e.building_name}{e.unit_name ? ' · ' + e.unit_name : ''} · {label('event_category', e.category)}</div></td>
                    <td><StatusBadge status={e.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <div className="card-head"><h3>Auslaufende Verträge (90 Tage)</h3></div>
          {!d.expiring_leases.length ? <Empty>Keine Verträge laufen demnächst aus.</Empty> : (
            <table>
              <tbody>
                {d.expiring_leases.map((l) => (
                  <tr key={l.id} className="click" onClick={() => nav(l.unit_id ? `/einheiten/${l.unit_id}` : `/gebaeude/${l.building_id}`)}>
                    <td>{date(l.end_date)}</td>
                    <td><b>{l.tenant_name}</b><div className="small muted">{l.building_name}{l.unit_name ? ' · ' + l.unit_name : ''}</div></td>
                    <td className="num">{money(l.cold_rent, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="card-head" style={{ borderTop: '1px solid var(--border)' }}><h3>Leerstand</h3></div>
          {!d.vacant_units.length ? <Empty>Kein Leerstand.</Empty> : (
            <table>
              <tbody>
                {d.vacant_units.map((u) => (
                  <tr key={u.id} className="click" onClick={() => nav(`/einheiten/${u.id}`)}>
                    <td><b>{u.name}</b><div className="small muted">{u.building_name} · {label('usage_type', u.usage_type)}</div></td>
                    <td className="num">{number(u.area, 'm²')}</td>
                    <td className="num">{u.target_rent ? 'Soll ' + money(u.target_rent, 0) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

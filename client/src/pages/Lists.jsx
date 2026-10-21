import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData, Loading, Empty, StatusBadge } from '../components/ui.jsx';
import { money, date, bytes } from '../format.js';
import { OPTIONS, label } from '../schema.js';

const target = (x) => (x.unit_id ? `/einheiten/${x.unit_id}` : `/gebaeude/${x.building_id}`);

export function EventsPage() {
  const [data, , err] = useData('/events');
  const [status, setStatus] = useState('');
  const [cat, setCat] = useState('');
  const [year, setYear] = useState('');
  const years = useMemo(() => [...new Set((data || []).map((e) => e.event_date.slice(0, 4)))].sort().reverse(), [data]);
  const list = (data || []).filter((e) => (!status || e.status === status) && (!cat || e.category === cat) && (!year || e.event_date.startsWith(year)));
  if (!data) return <Loading error={err} />;
  return (
    <>
      <div className="page-head">
        <div><h1>Ereignisse</h1><div className="sub">Reparaturen, Wartungen, Schäden, Modernisierungen über alle Objekte · Summe {money(list.reduce((s, e) => s + (e.cost || 0), 0), 0)}</div></div>
      </div>
      <div className="filters">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Alle Status</option>
          {Object.entries(OPTIONS.event_status).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Alle Kategorien</option>
          {Object.entries(OPTIONS.event_category).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">Alle Jahre</option>
          {years.map((y) => <option key={y}>{y}</option>)}
        </select>
      </div>
      <div className="card table-wrap">
        {!list.length ? <Empty>Keine Ereignisse.</Empty> : (
          <table>
            <thead><tr><th>Datum</th><th>Objekt</th><th>Kategorie</th><th>Titel</th><th>Firma</th><th>Status</th><th className="num">Kosten</th></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id}>
                  <td>{date(e.event_date)}</td>
                  <td><Link to={target(e)}>{e.building_name}{e.unit_name ? ' · ' + e.unit_name : ''}</Link></td>
                  <td>{label('event_category', e.category)}</td>
                  <td><b>{e.title}</b>{e.description && <div className="small muted">{e.description}</div>}</td>
                  <td>{e.contractor || '–'}</td>
                  <td><StatusBadge status={e.status} /></td>
                  <td className="num">{money(e.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="small muted">Neue Ereignisse erfasst du im jeweiligen Gebäude oder in der Einheit.</p>
    </>
  );
}

export function DocumentsPage() {
  const [data, , err] = useData('/documents');
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  if (!data) return <Loading error={err} />;
  const list = data.filter((d) => (!cat || d.category === cat) && (!q || `${d.title || ''} ${d.original_name} ${d.building_name} ${d.unit_name || ''}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <>
      <div className="page-head">
        <div><h1>Dokumente</h1><div className="sub">Alle Dateien – Mietverträge, Protokolle, Rechnungen …</div></div>
      </div>
      <div className="filters">
        <input placeholder="Suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Alle Kategorien</option>
          {Object.entries(OPTIONS.doc_category).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="card table-wrap">
        {!list.length ? <Empty>Keine Dokumente.</Empty> : (
          <table>
            <thead><tr><th>Dokument</th><th>Kategorie</th><th>Objekt</th><th>Hochgeladen</th><th className="num">Größe</th></tr></thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id}>
                  <td><a href={`/api/documents/${d.id}/file`} target="_blank" rel="noreferrer"><b>{d.title || d.original_name}</b></a></td>
                  <td>{label('doc_category', d.category)}</td>
                  <td><Link to={target(d) + '?tab=dokumente'}>{d.building_name}{d.unit_name ? ' · ' + d.unit_name : ''}</Link></td>
                  <td>{date(d.uploaded_at?.slice(0, 10))}</td>
                  <td className="num">{bytes(d.size || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="small muted">Neue Dokumente lädst du im jeweiligen Gebäude oder in der Einheit hoch.</p>
    </>
  );
}

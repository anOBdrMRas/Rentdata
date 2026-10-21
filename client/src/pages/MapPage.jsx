import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useData, Loading, OwnershipBadge } from '../components/ui.jsx';
import GeoMap, { cssVar } from '../components/GeoMap.jsx';
import { useBuildingFilter } from './Buildings.jsx';
import { money, pct, address } from '../format.js';
import { label } from '../schema.js';

// Popup-Inhalt als DOM-Element (funktioniert für Google Maps und Leaflet)
function popupFor(b, navigate) {
  const el = document.createElement('div');
  el.className = 'map-popup';
  const s = b.stats;
  const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  el.innerHTML = `
    <h4>${esc(b.name)}</h4>
    <div class="addr">${esc(address(b))}<br>${esc(label('ownership', b.ownership))} · ${esc(label('building_type', b.building_type))}</div>
    <table>
      ${row('Einheiten', s.unit_count ? `${s.unit_count} (${s.units_rented} vermietet)` : s.rented_as_whole ? 'als Ganzes vermietet' : '–')}
      ${row('Belegung', pct(s.occupancy_rate))}
      ${row('Kaltmiete/Monat', money(s.monthly_cold_rent, 0))}
      ${row('Jahr (eigen)', money(s.annual_cold_rent_own, 0))}
    </table>`;
  const btn = document.createElement('button');
  btn.textContent = 'Gebäude öffnen →';
  btn.onclick = () => navigate(`/gebaeude/${b.id}`);
  el.appendChild(btn);
  return el;
}

export default function MapPage() {
  const [data, , err] = useData('/buildings');
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [list, controls] = useBuildingFilter(data);
  const [sel, setSel] = useState(params.get('b') ? Number(params.get('b')) : null);
  const mapApi = useRef(null);

  const located = list.filter((b) => b.lat != null && b.lng != null);
  const markers = useMemo(() => {
    const colors = { eigen: cssVar('--own-eigen'), fremd: cssVar('--own-fremd'), teilweise: cssVar('--own-teilweise') };
    return located.map((b) => ({ id: b.id, lat: b.lat, lng: b.lng, color: colors[b.ownership], title: b.name, popup: () => popupFor(b, nav) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [located.map((b) => b.id).join(',')]);

  // Gebäude aus URL (?b=ID) direkt öffnen
  useEffect(() => {
    if (!sel || !data) return;
    const t = setTimeout(() => mapApi.current?.open(sel), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (!data) return <Loading error={err} />;
  const missing = list.length - located.length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Karte</h1>
          <div className="sub">{located.length} Gebäude auf der Karte{missing ? ` · ${missing} ohne Koordinaten` : ''} – Klick auf einen Punkt zeigt die Kennzahlen</div>
        </div>
        <div className="legend">
          <span><i style={{ background: 'var(--own-eigen)' }} />Eigentum</span>
          <span><i style={{ background: 'var(--own-teilweise)' }} />Teileigentum</span>
          <span><i style={{ background: 'var(--own-fremd)' }} />Fremdeigentum</span>
        </div>
      </div>
      {controls}
      <div className="map-layout">
        <div className="card" style={{ padding: 4 }}>
          <GeoMap markers={markers} height="calc(100vh - 220px)" zoom={13} apiRef={mapApi} />
        </div>
        <div className="card map-list">
          {list.map((b) => (
            <div key={b.id} className={`item ${sel === b.id ? 'sel' : ''}`}
              onClick={() => { setSel(b.id); if (b.lat != null) mapApi.current?.open(b.id); else nav(`/gebaeude/${b.id}`); }}
              onDoubleClick={() => nav(`/gebaeude/${b.id}`)}>
              <div className="row"><b>{b.name}</b><span className="spacer" /><OwnershipBadge value={b.ownership} /></div>
              <div className="small muted">{address(b)}{b.lat == null ? ' · keine Koordinaten' : ''}</div>
              <div className="small" style={{ marginTop: 2 }}>
                {b.stats.unit_count ? `${b.stats.unit_count} Einheiten · ` : ''}{money(b.stats.monthly_cold_rent, 0)} / Monat
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

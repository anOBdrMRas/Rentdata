import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { STATIC, resetDemoData } from './api.js';
import Dashboard from './pages/Dashboard.jsx';
import Buildings from './pages/Buildings.jsx';
import BuildingDetail from './pages/BuildingDetail.jsx';
import UnitDetail from './pages/UnitDetail.jsx';
import MapPage from './pages/MapPage.jsx';
import Units from './pages/Units.jsx';
import Tenants, { TenantDetail } from './pages/Tenants.jsx';
import { EventsPage, DocumentsPage } from './pages/Lists.jsx';

const NAV = [
  ['/', 'Übersicht', '◧'],
  ['/gebaeude', 'Gebäude', '⌂'],
  ['/karte', 'Karte', '⌖'],
  ['/einheiten', 'Mieteinheiten', '▦'],
  ['/mieter', 'Mieter', '☺'],
  ['/ereignisse', 'Ereignisse', '⚒'],
  ['/dokumente', 'Dokumente', '▤'],
];

export default function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 3 2 11h3v9h5v-6h4v6h5v-9h3z" /></svg>
          Rentdata
        </div>
        <nav className="nav">
          {NAV.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <span aria-hidden="true" style={{ width: 16, textAlign: 'center' }}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main">
        {STATIC && (
          <div className="proto-banner">
            <span><b>Prototyp</b> – Daten werden nur in diesem Browser gespeichert.</span>
            <button className="btn sm" onClick={async () => {
              if (!window.confirm('Alle Änderungen verwerfen und die Demodaten neu laden?')) return;
              await resetDemoData();
              window.location.reload();
            }}>Demodaten zurücksetzen</button>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/gebaeude" element={<Buildings />} />
          <Route path="/gebaeude/:id" element={<BuildingDetail />} />
          <Route path="/einheiten" element={<Units />} />
          <Route path="/einheiten/:id" element={<UnitDetail />} />
          <Route path="/karte" element={<MapPage />} />
          <Route path="/mieter" element={<Tenants />} />
          <Route path="/mieter/:id" element={<TenantDetail />} />
          <Route path="/ereignisse" element={<EventsPage />} />
          <Route path="/dokumente" element={<DocumentsPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}

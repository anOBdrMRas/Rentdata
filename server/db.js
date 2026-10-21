import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

export function openDb(file = path.join(DATA_DIR, 'rentdata.db')) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  return db;
}

// Gebäude können Mieteinheiten haben, müssen aber nicht. Daher hängen
// Mietverhältnisse, Ereignisse und Dokumente immer an einem Gebäude und
// optional an einer Einheit (unit_id NULL = betrifft das ganze Gebäude).
const SCHEMA = `
CREATE TABLE IF NOT EXISTS buildings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  street TEXT, house_number TEXT, zip TEXT, city TEXT, country TEXT DEFAULT 'Deutschland',
  lat REAL, lng REAL,
  building_type TEXT DEFAULT 'wohnen',          -- wohnen | gewerbe | gemischt | sonstiges
  ownership TEXT NOT NULL DEFAULT 'eigen',       -- eigen | fremd | teilweise
  owner_name TEXT, owner_contact TEXT,           -- Eigentümer, falls nicht eigen
  property_manager TEXT,                         -- Hausverwaltung
  year_built INTEGER, floors INTEGER,
  plot_area REAL, living_area REAL, commercial_area REAL,
  purchase_date TEXT, purchase_price REAL, market_value REAL,
  land_register TEXT,                            -- Grundbuch / Flurstück
  heating_type TEXT, energy_class TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                            -- z.B. "Whg. 3 OG links"
  usage_type TEXT NOT NULL DEFAULT 'wohnung',    -- wohnung | gewerbe | buero | laden | lager | stellplatz | sonstiges
  ownership TEXT NOT NULL DEFAULT 'wie_gebaeude',-- wie_gebaeude | eigen | fremd
  owner_name TEXT,
  floor TEXT, area REAL, rooms REAL,
  target_rent REAL,                              -- Soll-/Angebotsmiete kalt
  features TEXT,                                 -- Ausstattung
  meter_info TEXT,                               -- Zählernummern
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'privat',           -- privat | gewerblich
  name TEXT NOT NULL,                            -- Person oder Firma
  contact_person TEXT,
  email TEXT, phone TEXT,
  address TEXT,
  birth_date TEXT, tax_id TEXT, iban TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  unit_id INTEGER REFERENCES units(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  start_date TEXT NOT NULL,
  end_date TEXT,                                 -- NULL = unbefristet / laufend
  rent_type TEXT DEFAULT 'standard',             -- standard | index | staffel
  cold_rent REAL NOT NULL DEFAULT 0,             -- Kaltmiete / Monat
  service_charges REAL DEFAULT 0,                -- Nebenkostenvorauszahlung
  heating_charges REAL DEFAULT 0,
  vat_rate REAL DEFAULT 0,                       -- USt. in % (gewerblich)
  deposit REAL, deposit_paid INTEGER DEFAULT 0,
  payment_day INTEGER DEFAULT 3,
  notice_period TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Preisentwicklung: jede Mietänderung eines Mietverhältnisses
CREATE TABLE IF NOT EXISTS rent_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lease_id INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  effective_date TEXT NOT NULL,
  cold_rent REAL NOT NULL,
  service_charges REAL,
  heating_charges REAL,
  reason TEXT,                                   -- Indexanpassung, Staffel, Modernisierung, ...
  created_at TEXT DEFAULT (datetime('now'))
);

-- Ereignisse: Reparaturen, Wartungen, Schäden, Modernisierungen, Übergaben ...
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  unit_id INTEGER REFERENCES units(id) ON DELETE CASCADE,
  event_date TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'reparatur',    -- reparatur | wartung | schaden | modernisierung | uebergabe | besichtigung | sonstiges
  title TEXT NOT NULL,
  description TEXT,
  cost REAL,
  contractor TEXT,
  status TEXT DEFAULT 'offen',                   -- offen | in_arbeit | erledigt
  created_at TEXT DEFAULT (datetime('now'))
);

-- Laufende Kosten (Grundsteuer, Versicherung, Hausgeld, Kredit ...)
CREATE TABLE IF NOT EXISTS costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  unit_id INTEGER REFERENCES units(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT DEFAULT 'sonstiges',             -- grundsteuer | versicherung | hausgeld | finanzierung | verwaltung | instandhaltung | sonstiges
  amount REAL NOT NULL,
  interval TEXT NOT NULL DEFAULT 'monatlich',    -- monatlich | quartal | jaehrlich | einmalig
  allocatable INTEGER DEFAULT 0,                 -- auf Mieter umlegbar
  start_date TEXT, end_date TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  unit_id INTEGER REFERENCES units(id) ON DELETE CASCADE,
  lease_id INTEGER REFERENCES leases(id) ON DELETE SET NULL,
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  category TEXT DEFAULT 'sonstiges',             -- mietvertrag | uebergabeprotokoll | rechnung | nebenkosten | grundriss | foto | energieausweis | sonstiges
  title TEXT,
  original_name TEXT NOT NULL,
  stored_name TEXT NOT NULL,
  mime_type TEXT, size INTEGER,
  uploaded_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_units_building ON units(building_id);
CREATE INDEX IF NOT EXISTS idx_leases_unit ON leases(unit_id);
CREATE INDEX IF NOT EXISTS idx_leases_building ON leases(building_id);
CREATE INDEX IF NOT EXISTS idx_events_building ON events(building_id);
CREATE INDEX IF NOT EXISTS idx_docs_building ON documents(building_id);
CREATE INDEX IF NOT EXISTS idx_rent_changes_lease ON rent_changes(lease_id);
`;

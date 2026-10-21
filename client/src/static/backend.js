// Statischer Modus (z. B. GitHub Pages): Die API läuft komplett im Browser.
// Startdaten kommen aus demo-data.json (beim Build erzeugt), Änderungen
// werden im localStorage des Browsers gespeichert.
import {
  buildingStats, unitStats, monthlySeries, priceHistory, rentAt, isActive, today,
} from '../../../server/stats.js';

const STORAGE_KEY = 'rentdata-static-v1';
const TABLES = ['buildings', 'units', 'tenants', 'leases', 'rent_changes', 'events', 'costs', 'documents'];

const FIELDS = {
  buildings: ['name', 'street', 'house_number', 'zip', 'city', 'country', 'lat', 'lng', 'building_type', 'ownership', 'owner_name', 'owner_contact', 'property_manager', 'year_built', 'floors', 'plot_area', 'living_area', 'commercial_area', 'purchase_date', 'purchase_price', 'market_value', 'land_register', 'heating_type', 'energy_class', 'notes'],
  units: ['building_id', 'name', 'usage_type', 'ownership', 'owner_name', 'floor', 'area', 'rooms', 'target_rent', 'features', 'meter_info', 'notes'],
  tenants: ['kind', 'name', 'contact_person', 'email', 'phone', 'address', 'birth_date', 'tax_id', 'iban', 'notes'],
  leases: ['building_id', 'unit_id', 'tenant_id', 'start_date', 'end_date', 'rent_type', 'cold_rent', 'service_charges', 'heating_charges', 'vat_rate', 'deposit', 'deposit_paid', 'payment_day', 'notice_period', 'notes'],
  rent_changes: ['lease_id', 'effective_date', 'cold_rent', 'service_charges', 'heating_charges', 'reason'],
  events: ['building_id', 'unit_id', 'event_date', 'category', 'title', 'description', 'cost', 'contractor', 'status'],
  costs: ['building_id', 'unit_id', 'title', 'category', 'amount', 'interval', 'allocatable', 'start_date', 'end_date', 'notes'],
};
const REQUIRED = {
  buildings: ['name'], units: ['building_id', 'name'], tenants: ['name'], leases: ['building_id', 'tenant_id', 'start_date'],
  rent_changes: ['lease_id', 'effective_date', 'cold_rent'], events: ['building_id', 'event_date', 'title'], costs: ['building_id', 'title', 'amount'],
};
const DEFAULTS = {
  buildings: { country: 'Deutschland', building_type: 'wohnen', ownership: 'eigen' },
  units: { usage_type: 'wohnung', ownership: 'wie_gebaeude' },
  tenants: { kind: 'privat' },
  leases: { rent_type: 'standard', cold_rent: 0, service_charges: 0, heating_charges: 0, vat_rate: 0, deposit_paid: 0, payment_day: 3 },
  events: { category: 'reparatur', status: 'offen' },
  costs: { category: 'sonstiges', interval: 'monatlich', allocatable: 0 },
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

let db = null;

async function loadSeed() {
  const res = await fetch(new URL('demo-data.json', document.baseURI));
  if (!res.ok) throw new Error('Demodaten konnten nicht geladen werden');
  return res.json();
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    throw new HttpError(507, 'Browser-Speicher voll – bitte kleinere Dateien verwenden oder Daten zurücksetzen.');
  }
}

async function ensureDb() {
  if (db) return db;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) db = JSON.parse(saved);
  } catch { /* ignorieren */ }
  if (!db) {
    db = await loadSeed();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); } catch { /* nur im Speicher */ }
  }
  for (const t of TABLES) db[t] ??= [];
  db.seq ??= Object.fromEntries(TABLES.map((t) => [t, Math.max(0, ...db[t].map((r) => r.id))]));
  return db;
}

export async function resetStaticData() {
  localStorage.removeItem(STORAGE_KEY);
  db = null;
  await ensureDb();
}

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const num = (v) => (v == null ? v : Number(v));

function pick(table, body, partial = false) {
  const out = {};
  for (const f of FIELDS[table]) {
    if (!(f in body)) continue;
    let v = body[f];
    if (v === '' || v === undefined) v = null;
    if (typeof v === 'boolean') v = v ? 1 : 0;
    if (f.endsWith('_id') && v != null) v = Number(v);
    out[f] = v;
  }
  if (!partial) for (const r of REQUIRED[table]) if (out[r] == null || out[r] === '') throw new HttpError(400, `Feld "${r}" ist erforderlich`);
  return out;
}

const get = (table, id) => {
  const row = db[table].find((r) => r.id === Number(id));
  if (!row) throw new HttpError(404, 'Nicht gefunden');
  return row;
};
const insert = (table, data) => {
  const row = { ...(DEFAULTS[table] || {}), ...data, id: ++db.seq[table], created_at: now() };
  if (table === 'buildings' || table === 'units') row.updated_at = row.created_at;
  db[table].push(row);
  return row;
};
const update = (table, id, data) => {
  const row = get(table, id);
  Object.assign(row, data);
  if ('updated_at' in row) row.updated_at = now();
  return row;
};
const removeWhere = (table, fn) => { db[table] = db[table].filter((r) => !fn(r)); };

// Löschen inkl. abhängiger Daten (wie ON DELETE CASCADE in SQLite)
function deleteLease(id) {
  removeWhere('rent_changes', (c) => c.lease_id === id);
  db.documents.forEach((d) => { if (d.lease_id === id) d.lease_id = null; });
  removeWhere('leases', (l) => l.id === id);
}
function deleteUnit(id) {
  db.leases.filter((l) => l.unit_id === id).forEach((l) => deleteLease(l.id));
  removeWhere('events', (e) => e.unit_id === id);
  removeWhere('costs', (c) => c.unit_id === id);
  removeWhere('documents', (d) => d.unit_id === id);
  removeWhere('units', (u) => u.id === id);
}
function deleteBuilding(id) {
  db.units.filter((u) => u.building_id === id).forEach((u) => deleteUnit(u.id));
  db.leases.filter((l) => l.building_id === id).forEach((l) => deleteLease(l.id));
  for (const t of ['events', 'costs', 'documents']) removeWhere(t, (r) => r.building_id === id);
  removeWhere('buildings', (b) => b.id === id);
}

const normalizeScope = (data) => {
  if (data.unit_id != null && data.unit_id !== '') data.building_id = get('units', data.unit_id).building_id;
  return data;
};

function portfolio(buildingIds = null) {
  const inScope = (r) => !buildingIds || buildingIds.includes(r.building_id);
  const tenants = Object.fromEntries(db.tenants.map((t) => [t.id, t]));
  const leases = db.leases.filter(inScope).map((l) => ({ ...l, tenant_name: tenants[l.tenant_id]?.name, tenant_kind: tenants[l.tenant_id]?.kind }));
  const leaseIds = new Set(leases.map((l) => l.id));
  return {
    buildings: db.buildings.filter((b) => !buildingIds || buildingIds.includes(b.id)).map((b) => ({ ...b })),
    units: db.units.filter(inScope).map((u) => ({ ...u })),
    leases,
    changes: db.rent_changes.filter((c) => leaseIds.has(c.lease_id)),
    costs: db.costs.filter(inScope),
    events: db.events.filter(inScope).map((e) => ({ ...e })),
  };
}

const names = () => ({
  unit: Object.fromEntries(db.units.map((u) => [u.id, u.name])),
  building: Object.fromEntries(db.buildings.map((b) => [b.id, b.name])),
});

// ---------- Routen ----------
const routes = [];
const on = (method, pattern, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

on('GET', '/config', () => ({ googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '', staticMode: true }));

on('GET', '/dashboard', () => {
  const ctx = portfolio();
  const date = today();
  const stats = ctx.buildings.map((b) => buildingStats(b, ctx, date));
  const sum = (k) => Math.round(stats.reduce((a, s) => a + (s[k] || 0), 0) * 100) / 100;
  const in90 = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  const n = names();
  const bById = Object.fromEntries(ctx.buildings.map((b) => [b.id, b]));
  return {
    totals: {
      buildings: ctx.buildings.length,
      buildings_owned: ctx.buildings.filter((b) => b.ownership === 'eigen').length,
      units: ctx.units.length,
      units_rented: sum('units_rented'), units_vacant: sum('units_vacant'), units_owned: sum('units_owned'),
      tenants: new Set(ctx.leases.filter((l) => isActive(l, date)).map((l) => l.tenant_id)).size,
      monthly_cold_rent: sum('monthly_cold_rent'), monthly_warm_rent: sum('monthly_warm_rent'),
      monthly_cold_rent_own: sum('monthly_cold_rent_own'), annual_cold_rent_own: sum('annual_cold_rent_own'),
      monthly_costs: sum('monthly_costs'), monthly_cashflow: sum('monthly_cashflow'),
      repair_costs_year: sum('repair_costs_year'), open_events: sum('open_events'),
    },
    expiring_leases: ctx.leases.filter((l) => l.end_date && l.end_date >= date && l.end_date <= in90)
      .map((l) => ({ ...l, unit_name: n.unit[l.unit_id], building_name: n.building[l.building_id] })),
    open_events: ctx.events.filter((e) => e.status !== 'erledigt').sort((a, b) => b.event_date.localeCompare(a.event_date)).slice(0, 10)
      .map((e) => ({ ...e, unit_name: n.unit[e.unit_id], building_name: n.building[e.building_id] })),
    vacant_units: ctx.units.map((u) => ({ ...u, building_name: n.building[u.building_id], ...unitStats(u, bById[u.building_id], ctx, date) }))
      .filter((u) => u.status === 'leer'),
    series: monthlySeries(ctx.leases, ctx.changes, 36, date),
  };
});

on('GET', '/buildings', () => {
  const ctx = portfolio();
  return ctx.buildings.sort((a, b) => a.name.localeCompare(b.name, 'de')).map((b) => ({ ...b, stats: buildingStats(b, ctx) }));
});
on('GET', '/buildings/:id', ({ id }) => {
  const b = { ...get('buildings', id) };
  const ctx = portfolio([b.id]);
  const n = names();
  const whole = ctx.leases.filter((l) => l.unit_id == null);
  return {
    ...b,
    stats: buildingStats(b, ctx),
    units: ctx.units.sort((x, y) => x.name.localeCompare(y.name, 'de', { numeric: true })).map((u) => ({ ...u, stats: unitStats(u, b, ctx) })),
    leases: whole.sort((x, y) => y.start_date.localeCompare(x.start_date))
      .map((l) => ({ ...l, current: rentAt(l, ctx.changes), active: isActive(l), rent_changes: ctx.changes.filter((c) => c.lease_id === l.id) })),
    events: ctx.events.sort((x, y) => y.event_date.localeCompare(x.event_date)).map((e) => ({ ...e, unit_name: n.unit[e.unit_id] })),
    costs: ctx.costs,
    documents: db.documents.filter((d) => d.building_id === b.id).sort((x, y) => y.uploaded_at.localeCompare(x.uploaded_at))
      .map(({ data, ...d }) => ({ ...d, unit_name: n.unit[d.unit_id] || null })),
    series: monthlySeries(ctx.leases, ctx.changes, 60),
    price_history: priceHistory(whole, ctx.changes, b.living_area || b.commercial_area),
  };
});
on('POST', '/buildings', (p, body) => insert('buildings', pick('buildings', body)));
on('PUT', '/buildings/:id', ({ id }, body) => update('buildings', id, pick('buildings', body, true)));
on('DELETE', '/buildings/:id', ({ id }) => { get('buildings', id); deleteBuilding(Number(id)); return null; });

on('GET', '/units', () => {
  const ctx = portfolio();
  const bById = Object.fromEntries(ctx.buildings.map((b) => [b.id, b]));
  return ctx.units.map((u) => ({ ...u, building_name: bById[u.building_id].name, stats: unitStats(u, bById[u.building_id], ctx) }));
});
on('GET', '/units/:id', ({ id }) => {
  const u = { ...get('units', id) };
  const b = { ...get('buildings', u.building_id) };
  const ctx = portfolio([b.id]);
  const leases = ctx.leases.filter((l) => l.unit_id === u.id).sort((x, y) => y.start_date.localeCompare(x.start_date));
  return {
    ...u,
    building: b,
    stats: unitStats(u, b, ctx),
    leases: leases.map((l) => ({
      ...l, current: rentAt(l, ctx.changes), active: isActive(l),
      rent_changes: ctx.changes.filter((c) => c.lease_id === l.id).sort((x, y) => x.effective_date.localeCompare(y.effective_date)),
    })),
    events: ctx.events.filter((e) => e.unit_id === u.id).sort((x, y) => y.event_date.localeCompare(x.event_date)),
    costs: ctx.costs.filter((c) => c.unit_id === u.id),
    documents: db.documents.filter((d) => d.unit_id === u.id).sort((x, y) => y.uploaded_at.localeCompare(x.uploaded_at)).map(({ data, ...d }) => d),
    price_history: priceHistory(leases, ctx.changes, u.area),
    series: monthlySeries(leases, ctx.changes, 120),
  };
});
on('POST', '/units', (p, body) => { const d = pick('units', body); get('buildings', d.building_id); return insert('units', d); });
on('PUT', '/units/:id', ({ id }, body) => { const d = pick('units', body, true); delete d.building_id; return update('units', id, d); });
on('DELETE', '/units/:id', ({ id }) => { get('units', id); deleteUnit(Number(id)); return null; });

function leaseRows(filter) {
  const n = names();
  return db.leases.filter(filter).map((l) => ({ ...l, unit_name: n.unit[l.unit_id] || null, building_name: n.building[l.building_id] }));
}
on('GET', '/tenants', () => db.tenants.slice().sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' })).map((t) => {
  const own = leaseRows((l) => l.tenant_id === t.id);
  return { ...t, lease_count: own.length, active_leases: own.filter((l) => isActive(l)) };
}));
on('GET', '/tenants/:id', ({ id }) => {
  const t = get('tenants', id);
  const leases = leaseRows((l) => l.tenant_id === t.id).sort((a, b) => b.start_date.localeCompare(a.start_date));
  return { ...t, leases: leases.map((l) => ({ ...l, active: isActive(l), current: rentAt(l, db.rent_changes) })) };
});
on('POST', '/tenants', (p, body) => insert('tenants', pick('tenants', body)));
on('PUT', '/tenants/:id', ({ id }, body) => update('tenants', id, pick('tenants', body, true)));
on('DELETE', '/tenants/:id', ({ id }) => {
  get('tenants', id);
  if (db.leases.some((l) => l.tenant_id === Number(id))) throw new HttpError(409, 'Mieter hat noch Mietverhältnisse und kann nicht gelöscht werden');
  removeWhere('tenants', (t) => t.id === Number(id));
  return null;
});

on('POST', '/leases', (p, body) => {
  const d = pick('leases', normalizeScope({ ...body }));
  get('buildings', d.building_id); get('tenants', d.tenant_id);
  return insert('leases', d);
});
on('PUT', '/leases/:id', ({ id }, body) => { const d = pick('leases', body, true); if ('unit_id' in d) normalizeScope(d); return update('leases', id, d); });
on('DELETE', '/leases/:id', ({ id }) => { get('leases', id); deleteLease(Number(id)); return null; });
on('POST', '/rent-changes', (p, body) => { const d = pick('rent_changes', body); get('leases', d.lease_id); return insert('rent_changes', d); });
on('PUT', '/rent-changes/:id', ({ id }, body) => { const d = pick('rent_changes', body, true); delete d.lease_id; return update('rent_changes', id, d); });
on('DELETE', '/rent-changes/:id', ({ id }) => { get('rent_changes', id); removeWhere('rent_changes', (c) => c.id === Number(id)); return null; });

on('GET', '/events', () => {
  const n = names();
  return db.events.map((e) => ({ ...e, unit_name: n.unit[e.unit_id] || null, building_name: n.building[e.building_id] }))
    .sort((a, b) => b.event_date.localeCompare(a.event_date));
});
for (const [route, table] of [['events', 'events'], ['costs', 'costs']]) {
  on('POST', `/${route}`, (p, body) => { const d = pick(table, normalizeScope({ ...body })); get('buildings', d.building_id); return insert(table, d); });
  on('PUT', `/${route}/:id`, ({ id }, body) => { const d = pick(table, body, true); if ('unit_id' in d) normalizeScope(d); return update(table, id, d); });
  on('DELETE', `/${route}/:id`, ({ id }) => {
    get(table, id);
    removeWhere(table, (r) => r.id === Number(id));
    if (table === 'events') db.documents.forEach((d) => { if (d.event_id === Number(id)) d.event_id = null; });
    return null;
  });
}

on('GET', '/documents', () => {
  const n = names();
  return db.documents.map(({ data, ...d }) => ({ ...d, unit_name: n.unit[d.unit_id] || null, building_name: n.building[d.building_id] }))
    .sort((a, b) => b.uploaded_at.localeCompare(a.uploaded_at));
});
const MAX_FILE = 2 * 1024 * 1024;
const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(file);
});
on('POST', '/documents', async (p, fd) => {
  const files = fd.getAll('files');
  if (!files.length) throw new HttpError(400, 'Keine Datei hochgeladen');
  const big = files.find((f) => f.size > MAX_FILE);
  if (big) throw new HttpError(413, `„${big.name}“ ist zu groß – im Prototyp sind max. 2 MB pro Datei möglich (Speicher im Browser).`);
  const meta = normalizeScope({ building_id: Number(fd.get('building_id')) || null, unit_id: Number(fd.get('unit_id')) || null });
  get('buildings', meta.building_id);
  const out = [];
  for (const f of files) {
    const row = insert('documents', {
      building_id: meta.building_id, unit_id: meta.unit_id, lease_id: null, event_id: null,
      category: fd.get('category') || 'sonstiges', title: fd.get('title') || null,
      original_name: f.name, stored_name: f.name, mime_type: f.type || 'application/octet-stream', size: f.size,
      uploaded_at: now(), data: await readAsDataUrl(f),
    });
    const { data, ...rest } = row;
    out.push(rest);
  }
  return out;
});
on('DELETE', '/documents/:id', ({ id }) => { get('documents', id); removeWhere('documents', (d) => d.id === Number(id)); return null; });

on('GET', '/geocode', async (p, body, query) => {
  const q = (query.get('q') || '').trim();
  if (!q) throw new HttpError(400, 'Adresse fehlt');
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=de&q=${encodeURIComponent(q)}`);
  if (!r.ok) throw new HttpError(502, 'Geocoding fehlgeschlagen');
  return (await r.json()).map((x) => ({ label: x.display_name, lat: Number(x.lat), lng: Number(x.lon) }));
});

/** Einstiegspunkt für api.js im statischen Modus */
export async function handle(method, url, body) {
  await ensureDb();
  const u = new URL(url, 'http://local');
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = u.pathname.match(r.re);
    if (!m) continue;
    const result = await r.fn(m.groups || {}, body, u.searchParams);
    if (method !== 'GET') persist();
    // Kopie zurückgeben, damit die Oberfläche die gespeicherten Daten nicht verändert
    return result == null ? null : JSON.parse(JSON.stringify(result));
  }
  throw new HttpError(404, 'Unbekannter Endpunkt');
}

/** Dokument im Browser öffnen oder herunterladen */
export async function openDocument(id, download) {
  // Fenster sofort öffnen (sonst blockiert der Popup-Blocker nach dem await)
  const win = download ? null : window.open('about:blank', '_blank');
  await ensureDb();
  const d = get('documents', id);
  const blob = await (await fetch(d.data)).blob();
  const url = URL.createObjectURL(blob);
  if (download) {
    const a = document.createElement('a');
    a.href = url;
    a.download = d.original_name;
    a.click();
  } else if (win) {
    win.location.href = url;
  } else {
    window.location.href = url;
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

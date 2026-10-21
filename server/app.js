import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  loadPortfolio, buildingStats, unitStats, monthlySeries, priceHistory, rentAt, isActive, today,
} from './stats.js';

const FIELDS = {
  buildings: [
    'name', 'street', 'house_number', 'zip', 'city', 'country', 'lat', 'lng', 'building_type', 'ownership',
    'owner_name', 'owner_contact', 'property_manager', 'year_built', 'floors', 'plot_area', 'living_area',
    'commercial_area', 'purchase_date', 'purchase_price', 'market_value', 'land_register', 'heating_type',
    'energy_class', 'notes',
  ],
  units: [
    'building_id', 'name', 'usage_type', 'ownership', 'owner_name', 'floor', 'area', 'rooms', 'target_rent',
    'features', 'meter_info', 'notes',
  ],
  tenants: ['kind', 'name', 'contact_person', 'email', 'phone', 'address', 'birth_date', 'tax_id', 'iban', 'notes'],
  leases: [
    'building_id', 'unit_id', 'tenant_id', 'start_date', 'end_date', 'rent_type', 'cold_rent', 'service_charges',
    'heating_charges', 'vat_rate', 'deposit', 'deposit_paid', 'payment_day', 'notice_period', 'notes',
  ],
  rent_changes: ['lease_id', 'effective_date', 'cold_rent', 'service_charges', 'heating_charges', 'reason'],
  events: ['building_id', 'unit_id', 'event_date', 'category', 'title', 'description', 'cost', 'contractor', 'status'],
  costs: [
    'building_id', 'unit_id', 'title', 'category', 'amount', 'interval', 'allocatable', 'start_date', 'end_date', 'notes',
  ],
};

const REQUIRED = {
  buildings: ['name'],
  units: ['building_id', 'name'],
  tenants: ['name'],
  leases: ['building_id', 'tenant_id', 'start_date'],
  rent_changes: ['lease_id', 'effective_date', 'cold_rent'],
  events: ['building_id', 'event_date', 'title'],
  costs: ['building_id', 'title', 'amount'],
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function pick(table, body, partial = false) {
  const out = {};
  for (const f of FIELDS[table]) {
    if (!(f in body)) continue;
    let v = body[f];
    if (v === '' || v === undefined) v = null;
    if (typeof v === 'boolean') v = v ? 1 : 0;
    out[f] = v;
  }
  if (!partial) {
    for (const r of REQUIRED[table]) {
      if (out[r] == null || out[r] === '') throw new HttpError(400, `Feld "${r}" ist erforderlich`);
    }
  }
  return out;
}

export function createApp(db, { uploadDir, googleMapsApiKey = '' } = {}) {
  fs.mkdirSync(uploadDir, { recursive: true });
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const get = (table, id) => {
    const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (!row) throw new HttpError(404, 'Nicht gefunden');
    return row;
  };
  const insert = (table, data) => {
    const keys = Object.keys(data);
    const info = db
      .prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
      .run(...keys.map((k) => data[k]));
    return get(table, info.lastInsertRowid);
  };
  const update = (table, id, data) => {
    get(table, id);
    const keys = Object.keys(data);
    if (keys.length) {
      const hasUpdated = ['buildings', 'units'].includes(table);
      db.prepare(
        `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(',')}${hasUpdated ? ", updated_at = datetime('now')" : ''} WHERE id = ?`
      ).run(...keys.map((k) => data[k]), id);
    }
    return get(table, id);
  };
  const remove = (table, id) => {
    get(table, id);
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  };

  // Konsistenz: Einheit muss zum Gebäude gehören; building_id aus Einheit ableiten.
  const normalizeScope = (data) => {
    if (data.unit_id != null && data.unit_id !== '') {
      const unit = get('units', data.unit_id);
      data.building_id = unit.building_id;
    }
    return data;
  };

  const h = (fn) => (req, res, next) => {
    try {
      const r = fn(req, res);
      if (r !== undefined && r !== res && !res.headersSent) res.json(r);
    } catch (e) {
      next(e);
    }
  };

  app.get('/api/config', (req, res) => res.json({ googleMapsApiKey }));

  // ---------- Dashboard ----------
  app.get('/api/dashboard', h(() => {
    const ctx = loadPortfolio(db);
    const date = today();
    const stats = ctx.buildings.map((b) => ({ b, s: buildingStats(b, ctx, date) }));
    const sum = (k) => Math.round(stats.reduce((a, x) => a + (x.s[k] || 0), 0) * 100) / 100;
    const in90 = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
    const unitsById = Object.fromEntries(ctx.units.map((u) => [u.id, u]));
    const bById = Object.fromEntries(ctx.buildings.map((b) => [b.id, b]));
    return {
      totals: {
        buildings: ctx.buildings.length,
        buildings_owned: ctx.buildings.filter((b) => b.ownership === 'eigen').length,
        units: ctx.units.length,
        units_rented: sum('units_rented'),
        units_vacant: sum('units_vacant'),
        units_owned: sum('units_owned'),
        tenants: new Set(ctx.leases.filter((l) => isActive(l, date)).map((l) => l.tenant_id)).size,
        monthly_cold_rent: sum('monthly_cold_rent'),
        monthly_warm_rent: sum('monthly_warm_rent'),
        monthly_cold_rent_own: sum('monthly_cold_rent_own'),
        annual_cold_rent_own: sum('annual_cold_rent_own'),
        monthly_costs: sum('monthly_costs'),
        monthly_cashflow: sum('monthly_cashflow'),
        repair_costs_year: sum('repair_costs_year'),
        open_events: sum('open_events'),
      },
      expiring_leases: ctx.leases
        .filter((l) => l.end_date && l.end_date >= date && l.end_date <= in90)
        .map((l) => ({ ...l, unit_name: unitsById[l.unit_id]?.name, building_name: bById[l.building_id]?.name })),
      open_events: ctx.events
        .filter((e) => e.status !== 'erledigt')
        .sort((a, b) => b.event_date.localeCompare(a.event_date))
        .slice(0, 10)
        .map((e) => ({ ...e, unit_name: unitsById[e.unit_id]?.name, building_name: bById[e.building_id]?.name })),
      vacant_units: ctx.units
        .map((u) => ({ ...u, building_name: bById[u.building_id]?.name, ...unitStats(u, bById[u.building_id], ctx, date) }))
        .filter((u) => u.status === 'leer'),
      series: monthlySeries(ctx.leases, ctx.changes, 36, date),
    };
  }));

  // ---------- Gebäude ----------
  app.get('/api/buildings', h(() => {
    const ctx = loadPortfolio(db);
    return ctx.buildings
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .map((b) => ({ ...b, stats: buildingStats(b, ctx) }));
  }));

  app.get('/api/buildings/:id', h((req) => {
    const b = get('buildings', req.params.id);
    const ctx = loadPortfolio(db, [b.id]);
    const unitIds = new Set(ctx.units.map((u) => u.id));
    const docs = db.prepare('SELECT * FROM documents WHERE building_id = ? ORDER BY uploaded_at DESC').all(b.id);
    const unitsSorted = ctx.units.sort((x, y) => x.name.localeCompare(y.name, 'de', { numeric: true }));
    const whole = ctx.leases.filter((l) => l.unit_id == null);
    return {
      ...b,
      stats: buildingStats(b, ctx),
      units: unitsSorted.map((u) => ({ ...u, stats: unitStats(u, b, ctx) })),
      leases: whole
        .sort((x, y) => y.start_date.localeCompare(x.start_date))
        .map((l) => ({ ...l, current: rentAt(l, ctx.changes), active: isActive(l), rent_changes: ctx.changes.filter((c) => c.lease_id === l.id) })),
      events: ctx.events
        .sort((x, y) => y.event_date.localeCompare(x.event_date))
        .map((e) => ({ ...e, unit_name: ctx.units.find((u) => u.id === e.unit_id)?.name })),
      costs: ctx.costs,
      documents: docs.map((d) => ({ ...d, unit_name: unitIds.has(d.unit_id) ? ctx.units.find((u) => u.id === d.unit_id).name : null })),
      series: monthlySeries(ctx.leases, ctx.changes, 60),
      price_history: priceHistory(whole, ctx.changes, b.living_area || b.commercial_area),
    };
  }));

  app.post('/api/buildings', h((req, res) => res.status(201).json(insert('buildings', pick('buildings', req.body)))));
  app.put('/api/buildings/:id', h((req) => update('buildings', req.params.id, pick('buildings', req.body, true))));
  app.delete('/api/buildings/:id', h((req, res) => {
    const docs = db.prepare('SELECT stored_name FROM documents WHERE building_id = ?').all(req.params.id);
    db.prepare('DELETE FROM leases WHERE building_id = ?').run(req.params.id);
    remove('buildings', req.params.id);
    docs.forEach((d) => fs.rm(path.join(uploadDir, d.stored_name), { force: true }, () => {}));
    res.status(204).end();
  }));

  // ---------- Einheiten ----------
  app.get('/api/units', h(() => {
    const ctx = loadPortfolio(db);
    const bById = Object.fromEntries(ctx.buildings.map((b) => [b.id, b]));
    return ctx.units.map((u) => ({ ...u, building_name: bById[u.building_id].name, stats: unitStats(u, bById[u.building_id], ctx) }));
  }));

  app.get('/api/units/:id', h((req) => {
    const u = get('units', req.params.id);
    const b = get('buildings', u.building_id);
    const ctx = loadPortfolio(db, [b.id]);
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
      documents: db.prepare('SELECT * FROM documents WHERE unit_id = ? ORDER BY uploaded_at DESC').all(u.id),
      price_history: priceHistory(leases, ctx.changes, u.area),
      series: monthlySeries(leases, ctx.changes, 120),
    };
  }));

  app.post('/api/units', h((req, res) => {
    const data = pick('units', req.body);
    get('buildings', data.building_id);
    res.status(201).json(insert('units', data));
  }));
  app.put('/api/units/:id', h((req) => {
    const data = pick('units', req.body, true);
    delete data.building_id;
    return update('units', req.params.id, data);
  }));
  app.delete('/api/units/:id', h((req, res) => {
    remove('units', req.params.id);
    res.status(204).end();
  }));

  // ---------- Mieter ----------
  app.get('/api/tenants', h(() => {
    const tenants = db.prepare('SELECT * FROM tenants ORDER BY name COLLATE NOCASE').all();
    const leases = db
      .prepare(
        `SELECT l.*, u.name AS unit_name, b.name AS building_name FROM leases l
         JOIN buildings b ON b.id = l.building_id LEFT JOIN units u ON u.id = l.unit_id`
      )
      .all();
    return tenants.map((t) => {
      const own = leases.filter((l) => l.tenant_id === t.id);
      return { ...t, lease_count: own.length, active_leases: own.filter((l) => isActive(l)) };
    });
  }));
  app.get('/api/tenants/:id', h((req) => {
    const t = get('tenants', req.params.id);
    const leases = db
      .prepare(
        `SELECT l.*, u.name AS unit_name, b.name AS building_name FROM leases l
         JOIN buildings b ON b.id = l.building_id LEFT JOIN units u ON u.id = l.unit_id
         WHERE l.tenant_id = ? ORDER BY l.start_date DESC`
      )
      .all(t.id);
    const changes = db.prepare('SELECT * FROM rent_changes').all();
    return { ...t, leases: leases.map((l) => ({ ...l, active: isActive(l), current: rentAt(l, changes) })) };
  }));
  app.post('/api/tenants', h((req, res) => res.status(201).json(insert('tenants', pick('tenants', req.body)))));
  app.put('/api/tenants/:id', h((req) => update('tenants', req.params.id, pick('tenants', req.body, true))));
  app.delete('/api/tenants/:id', h((req, res) => {
    const c = db.prepare('SELECT COUNT(*) AS c FROM leases WHERE tenant_id = ?').get(req.params.id).c;
    if (c) throw new HttpError(409, 'Mieter hat noch Mietverhältnisse und kann nicht gelöscht werden');
    remove('tenants', req.params.id);
    res.status(204).end();
  }));

  // ---------- Mietverhältnisse & Mietänderungen ----------
  app.post('/api/leases', h((req, res) => {
    const data = pick('leases', normalizeScope({ ...req.body }));
    get('buildings', data.building_id);
    get('tenants', data.tenant_id);
    res.status(201).json(insert('leases', data));
  }));
  app.put('/api/leases/:id', h((req) => {
    const data = pick('leases', req.body, true);
    if ('unit_id' in data) normalizeScope(data);
    return update('leases', req.params.id, data);
  }));
  app.delete('/api/leases/:id', h((req, res) => {
    remove('leases', req.params.id);
    res.status(204).end();
  }));
  app.post('/api/rent-changes', h((req, res) => {
    const data = pick('rent_changes', req.body);
    get('leases', data.lease_id);
    res.status(201).json(insert('rent_changes', data));
  }));
  app.put('/api/rent-changes/:id', h((req) => {
    const data = pick('rent_changes', req.body, true);
    delete data.lease_id;
    return update('rent_changes', req.params.id, data);
  }));
  app.delete('/api/rent-changes/:id', h((req, res) => {
    remove('rent_changes', req.params.id);
    res.status(204).end();
  }));

  // ---------- Ereignisse & Kosten ----------
  app.get('/api/events', h((req) => {
    const rows = db
      .prepare(
        `SELECT e.*, u.name AS unit_name, b.name AS building_name FROM events e
         JOIN buildings b ON b.id = e.building_id LEFT JOIN units u ON u.id = e.unit_id
         ORDER BY e.event_date DESC`
      )
      .all();
    return req.query.status ? rows.filter((r) => r.status === req.query.status) : rows;
  }));
  for (const [route, table] of [['events', 'events'], ['costs', 'costs']]) {
    app.post(`/api/${route}`, h((req, res) => {
      const data = pick(table, normalizeScope({ ...req.body }));
      get('buildings', data.building_id);
      res.status(201).json(insert(table, data));
    }));
    app.put(`/api/${route}/:id`, h((req) => {
      const data = pick(table, req.body, true);
      if ('unit_id' in data) normalizeScope(data);
      return update(table, req.params.id, data);
    }));
    app.delete(`/api/${route}/:id`, h((req, res) => {
      remove(table, req.params.id);
      res.status(204).end();
    }));
  }

  // ---------- Dokumente ----------
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
    }),
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  app.get('/api/documents', h(() =>
    db.prepare(
      `SELECT d.*, u.name AS unit_name, b.name AS building_name FROM documents d
       JOIN buildings b ON b.id = d.building_id LEFT JOIN units u ON u.id = d.unit_id
       ORDER BY d.uploaded_at DESC`
    ).all()
  ));

  app.post('/api/documents', upload.array('files', 20), (req, res, next) => {
    try {
      if (!req.files?.length) throw new HttpError(400, 'Keine Datei hochgeladen');
      const meta = normalizeScope({
        building_id: req.body.building_id || null,
        unit_id: req.body.unit_id || null,
      });
      if (!meta.building_id) throw new HttpError(400, 'Feld "building_id" ist erforderlich');
      get('buildings', meta.building_id);
      const created = req.files.map((f) =>
        insert('documents', {
          building_id: meta.building_id,
          unit_id: meta.unit_id,
          lease_id: req.body.lease_id || null,
          event_id: req.body.event_id || null,
          category: req.body.category || 'sonstiges',
          title: req.body.title || null,
          // multer liefert Dateinamen als latin1 – in UTF-8 umwandeln (Umlaute)
          original_name: Buffer.from(f.originalname, 'latin1').toString('utf8'),
          stored_name: f.filename,
          mime_type: f.mimetype,
          size: f.size,
        })
      );
      res.status(201).json(created);
    } catch (e) {
      (req.files || []).forEach((f) => fs.rm(f.path, { force: true }, () => {}));
      next(e);
    }
  });

  app.get('/api/documents/:id/file', (req, res, next) => {
    try {
      const d = get('documents', req.params.id);
      const file = path.join(uploadDir, d.stored_name);
      const disposition = req.query.download ? 'attachment' : 'inline';
      res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(d.original_name)}`);
      res.type(d.mime_type || 'application/octet-stream');
      res.sendFile(file);
    } catch (e) {
      next(e);
    }
  });

  app.put('/api/documents/:id', h((req) => {
    const allowed = {};
    for (const k of ['title', 'category', 'lease_id', 'event_id']) if (k in req.body) allowed[k] = req.body[k] || null;
    return update('documents', req.params.id, allowed);
  }));

  app.delete('/api/documents/:id', h((req, res) => {
    const d = get('documents', req.params.id);
    db.prepare('DELETE FROM documents WHERE id = ?').run(d.id);
    fs.rm(path.join(uploadDir, d.stored_name), { force: true }, () => {});
    res.status(204).end();
  }));

  // ---------- Geocoding (Adresse -> Koordinaten) ----------
  app.get('/api/geocode', async (req, res, next) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!q) throw new HttpError(400, 'Adresse fehlt');
      if (googleMapsApiKey) {
        const r = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${googleMapsApiKey}&language=de`
        );
        const j = await r.json();
        return res.json((j.results || []).slice(0, 5).map((x) => ({
          label: x.formatted_address, lat: x.geometry.location.lat, lng: x.geometry.location.lng,
        })));
      }
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=de&q=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': 'Rentdata/1.0 (Immobilienverwaltung)' } }
      );
      const j = await r.json();
      res.json(j.map((x) => ({ label: x.display_name, lat: Number(x.lat), lng: Number(x.lon) })));
    } catch (e) {
      next(e.status ? e : new HttpError(502, 'Geocoding fehlgeschlagen: ' + e.message));
    }
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Unbekannter Endpunkt' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' ? 409 : err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message || 'Serverfehler' });
  });

  return app;
}

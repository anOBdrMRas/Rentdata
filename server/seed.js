// Demodaten: fiktive Gebäude, Einheiten und Mieter in Straubing.
// Adressen sind reale Straßen, Hausnummern, Personen und Zahlen sind erfunden.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ins = (db, table, data) => {
  const k = Object.keys(data);
  return db
    .prepare(`INSERT INTO ${table} (${k.join(',')}) VALUES (${k.map(() => '?').join(',')})`)
    .run(...k.map((x) => data[x])).lastInsertRowid;
};

// Datum relativ zu heute, damit "aktuelle" Mietverhältnisse immer aktuell sind
const ago = (years, months = 0) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
};
// Monatsende in `months` Monaten
const inFuture = (months) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
};
const dayBefore = (iso) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

const BUILDINGS = [
  {
    b: {
      name: 'Wohnhaus Ludwigsplatz', street: 'Ludwigsplatz', house_number: '21', zip: '94315', city: 'Straubing',
      lat: 48.88262, lng: 12.57318, building_type: 'gemischt', ownership: 'eigen', year_built: 1898, floors: 4,
      plot_area: 410, living_area: 520, commercial_area: 140, purchase_date: ago(12), purchase_price: 1450000,
      market_value: 2300000, land_register: 'Gemarkung Straubing, Flst. 102/4', heating_type: 'Gas-Zentralheizung',
      energy_class: 'D', notes: 'Denkmalgeschütztes Altstadthaus, Laden im EG.',
    },
    units: [
      { name: 'EG Laden', usage_type: 'laden', floor: 'EG', area: 140, rooms: 3, target_rent: 2400, features: 'Schaufensterfront, Lager im UG' },
      { name: 'Whg. 1 – 1. OG', usage_type: 'wohnung', floor: '1. OG', area: 98, rooms: 4, target_rent: 1050, features: 'Stuckdecken, Balkon zum Hof' },
      { name: 'Whg. 2 – 2. OG', usage_type: 'wohnung', floor: '2. OG', area: 98, rooms: 4, target_rent: 1050, features: 'Stuckdecken' },
      { name: 'Whg. 3 – 3. OG', usage_type: 'wohnung', floor: '3. OG', area: 85, rooms: 3, target_rent: 920 },
      { name: 'Whg. 4 – DG', usage_type: 'wohnung', floor: 'DG', area: 72, rooms: 2.5, target_rent: 850, features: 'Dachterrasse, Blick auf Stadtturm' },
    ],
  },
  {
    b: {
      name: 'Mehrfamilienhaus Schlesische Straße', street: 'Schlesische Straße', house_number: '48', zip: '94315', city: 'Straubing',
      lat: 48.87415, lng: 12.58702, building_type: 'wohnen', ownership: 'eigen', year_built: 1972, floors: 3,
      plot_area: 780, living_area: 430, purchase_date: ago(7), purchase_price: 890000, market_value: 1150000,
      heating_type: 'Fernwärme', energy_class: 'C', notes: 'Fassadendämmung vor 4 Jahren, 6 Stellplätze.',
    },
    units: [
      { name: 'Whg. 1 EG links', usage_type: 'wohnung', floor: 'EG', area: 72, rooms: 3, target_rent: 690, features: 'Terrasse, Gartenanteil' },
      { name: 'Whg. 2 EG rechts', usage_type: 'wohnung', floor: 'EG', area: 72, rooms: 3, target_rent: 690 },
      { name: 'Whg. 3 1. OG links', usage_type: 'wohnung', floor: '1. OG', area: 72, rooms: 3, target_rent: 700, features: 'Balkon' },
      { name: 'Whg. 4 1. OG rechts', usage_type: 'wohnung', floor: '1. OG', area: 72, rooms: 3, target_rent: 700, features: 'Balkon' },
      { name: 'Whg. 5 2. OG links', usage_type: 'wohnung', floor: '2. OG', area: 71, rooms: 3, target_rent: 710, features: 'Balkon' },
      { name: 'Whg. 6 2. OG rechts', usage_type: 'wohnung', floor: '2. OG', area: 71, rooms: 3, target_rent: 710, features: 'Balkon' },
      { name: 'Stellplatz 1', usage_type: 'stellplatz', area: 12.5, target_rent: 40 },
      { name: 'Stellplatz 2', usage_type: 'stellplatz', area: 12.5, target_rent: 40 },
    ],
  },
  {
    b: {
      name: 'Bürohaus Bahnhofstraße', street: 'Bahnhofstraße', house_number: '9', zip: '94315', city: 'Straubing',
      lat: 48.87886, lng: 12.57885, building_type: 'gewerbe', ownership: 'eigen', year_built: 1995, floors: 3,
      plot_area: 650, commercial_area: 780, purchase_date: ago(5), purchase_price: 1850000, market_value: 2100000,
      heating_type: 'Wärmepumpe + Gas-Spitzenlast', energy_class: 'B', notes: 'Aufzug, Tiefgarage mit 12 Plätzen.',
    },
    units: [
      { name: 'EG Praxis', usage_type: 'gewerbe', floor: 'EG', area: 240, rooms: 8, target_rent: 3100, features: 'barrierefrei' },
      { name: '1. OG Büro', usage_type: 'buero', floor: '1. OG', area: 270, rooms: 10, target_rent: 3200 },
      { name: '2. OG Büro', usage_type: 'buero', floor: '2. OG', area: 270, rooms: 9, target_rent: 3200, features: 'Dachterrasse' },
    ],
  },
  {
    b: {
      name: 'Einfamilienhaus Ittlinger Straße', street: 'Ittlinger Straße', house_number: '112', zip: '94315', city: 'Straubing',
      lat: 48.87638, lng: 12.60185, building_type: 'wohnen', ownership: 'eigen', year_built: 2008, floors: 2,
      plot_area: 620, living_area: 148, purchase_date: ago(9), purchase_price: 420000, market_value: 610000,
      heating_type: 'Luft-Wärmepumpe', energy_class: 'A',
      notes: 'Wird als ganzes Haus vermietet – keine einzelnen Mieteinheiten.',
    },
    units: [],
  },
  {
    b: {
      name: 'Gewerbehalle Siemensstraße', street: 'Siemensstraße', house_number: '14', zip: '94315', city: 'Straubing',
      lat: 48.86745, lng: 12.55962, building_type: 'gewerbe', ownership: 'eigen', year_built: 2001, floors: 1,
      plot_area: 3200, commercial_area: 1400, purchase_date: ago(4), purchase_price: 1250000, market_value: 1400000,
      heating_type: 'Gas-Dunkelstrahler', notes: 'Halle 1.100 m² + Büroriegel 300 m², 2 Rolltore.',
    },
    units: [
      { name: 'Halle', usage_type: 'lager', area: 1100, target_rent: 5200, features: 'Hallenhöhe 7 m, 2 Rolltore, Kranbahn' },
      { name: 'Büroriegel', usage_type: 'buero', area: 300, rooms: 9, target_rent: 2400 },
    ],
  },
  {
    b: {
      name: 'Wohnanlage Theresienplatz', street: 'Theresienplatz', house_number: '33', zip: '94315', city: 'Straubing',
      lat: 48.88158, lng: 12.57681, building_type: 'gemischt', ownership: 'teilweise',
      owner_name: 'WEG Theresienplatz 33', owner_contact: 'Hausverwaltung Gäuboden GmbH, Tel. 09421 000000',
      property_manager: 'Hausverwaltung Gäuboden GmbH', year_built: 1965, floors: 5,
      notes: 'Eigentümergemeinschaft – mir gehören nur Whg. 7 und das Café im EG.',
    },
    units: [
      { name: 'EG Café', usage_type: 'gewerbe', ownership: 'eigen', floor: 'EG', area: 95, rooms: 2, target_rent: 1650, features: 'Außenbestuhlung am Platz' },
      { name: 'Whg. 7 – 3. OG', usage_type: 'wohnung', ownership: 'eigen', floor: '3. OG', area: 64, rooms: 2, target_rent: 690, features: 'Balkon, Aufzug' },
      { name: 'Whg. 8 – 3. OG', usage_type: 'wohnung', ownership: 'fremd', owner_name: 'Fam. Berger', floor: '3. OG', area: 78, rooms: 3 },
    ],
  },
  {
    b: {
      name: 'Doppelhaus Regensburger Straße', street: 'Regensburger Straße', house_number: '77', zip: '94315', city: 'Straubing',
      lat: 48.88731, lng: 12.55688, building_type: 'wohnen', ownership: 'fremd',
      owner_name: 'Erbengemeinschaft Huber', owner_contact: 'Herr M. Huber, m.huber@example.de',
      property_manager: 'eigene Verwaltung (Mandat)', year_built: 1958, floors: 2, living_area: 210,
      notes: 'Fremdes Objekt, wird im Auftrag der Eigentümer verwaltet.',
    },
    units: [
      { name: 'Haushälfte Nord', usage_type: 'wohnung', area: 105, rooms: 5, target_rent: 1150, features: 'Garten, Garage' },
      { name: 'Haushälfte Süd', usage_type: 'wohnung', area: 105, rooms: 5, target_rent: 1150, features: 'Garten, Keller' },
    ],
  },
  {
    b: {
      name: 'Grundstück Landshuter Straße', street: 'Landshuter Straße', house_number: '160', zip: '94315', city: 'Straubing',
      lat: 48.87102, lng: 12.56191, building_type: 'sonstiges', ownership: 'fremd',
      owner_name: 'Stadtwerke (Beispiel)', notes: 'Interessantes Objekt in Beobachtung – Kauf angedacht. Noch keine Einheiten erfasst.',
    },
    units: [],
  },
];

const TENANTS = [
  ['gewerblich', 'Buchhandlung Gäuboden GmbH', 'Petra Lindner'],
  ['privat', 'Thomas & Julia Wagner'], ['privat', 'Sabine Hofmann'], ['privat', 'Michael Schneider'],
  ['privat', 'Lukas Bauer'], ['privat', 'Anna Fischer'], ['privat', 'Familie Gruber'],
  ['privat', 'Stefan Meier'], ['privat', 'Katharina Weber'], ['privat', 'Jonas Schmid'],
  ['privat', 'Maria Huber'], ['privat', 'Daniel Koch'], ['privat', 'Elena Popescu'],
  ['gewerblich', 'Physiotherapie am Bahnhof', 'Dr. Andrea Kerscher'],
  ['gewerblich', 'Donau IT Solutions GmbH', 'Markus Riedl'],
  ['gewerblich', 'Steuerkanzlei Brunner & Partner', 'Klaus Brunner'],
  ['gewerblich', 'Niederbayern Logistik KG', 'Sven Achatz'],
  ['gewerblich', 'Café Theresia', 'Lisa Moser'],
  ['privat', 'Familie Obermeier'], ['privat', 'Tobias Ebner'], ['privat', 'Christina Wolf'],
  ['privat', 'Florian Lehner'], ['privat', 'Sophie Krämer'],
];

export function seedDemo(db, uploadDir) {
  const run = db.transaction(() => {
    const tenantIds = {};
    TENANTS.forEach(([kind, name, contact], i) => {
      tenantIds[name] = ins(db, 'tenants', {
        kind, name, contact_person: contact || null,
        email: name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '') + '@example.de',
        phone: `09421 ${String(100000 + i * 7331).slice(0, 6)}`,
        notes: kind === 'gewerblich' ? 'Gewerbemieter' : null,
      });
    });

    const bIds = [], uIds = {};
    for (const { b, units } of BUILDINGS) {
      const bid = ins(db, 'buildings', { country: 'Deutschland', ...b });
      bIds.push(bid);
      for (const u of units) uIds[`${b.name}|${u.name}`] = { id: ins(db, 'units', { building_id: bid, ...u }), bid, u };
    }

    const lease = (key, tenant, start, end, cold, nk, heat, opts = {}) => {
      const target = key.includes('|') ? uIds[key] : null;
      const bid = target ? target.bid : bIds[BUILDINGS.findIndex((x) => x.b.name === key)];
      return ins(db, 'leases', {
        building_id: bid, unit_id: target?.id ?? null, tenant_id: tenantIds[tenant],
        start_date: start, end_date: end, cold_rent: cold, service_charges: nk, heating_charges: heat,
        deposit: opts.deposit ?? cold * 3, deposit_paid: 1, payment_day: 3,
        rent_type: opts.rent_type || 'standard', vat_rate: opts.vat_rate || 0,
        notice_period: opts.notice || '3 Monate', notes: opts.notes || null,
      });
    };
    const change = (leaseId, date, cold, reason, nk) =>
      ins(db, 'rent_changes', { lease_id: leaseId, effective_date: date, cold_rent: cold, reason, service_charges: nk ?? null });

    // --- Ludwigsplatz ---
    const L = 'Wohnhaus Ludwigsplatz|';
    let id = lease(L + 'EG Laden', 'Buchhandlung Gäuboden GmbH', ago(10), null, 2050, 280, 120, { rent_type: 'index', vat_rate: 19, notice: '6 Monate zum Quartalsende' });
    change(id, ago(7), 2150, 'Indexanpassung (VPI)'); change(id, ago(4), 2290, 'Indexanpassung (VPI)'); change(id, ago(1), 2380, 'Indexanpassung (VPI)');
    id = lease(L + 'Whg. 1 – 1. OG', 'Michael Schneider', ago(11), dayBefore(ago(6)), 820, 180, 90);
    change(id, ago(8), 860, 'Mieterhöhung §558 BGB');
    id = lease(L + 'Whg. 1 – 1. OG', 'Thomas & Julia Wagner', ago(6), null, 940, 200, 95);
    change(id, ago(3), 990, 'Mieterhöhung §558 BGB'); change(id, ago(0, 4), 1030, 'Mieterhöhung §558 BGB');
    id = lease(L + 'Whg. 2 – 2. OG', 'Sabine Hofmann', ago(8), null, 900, 190, 95);
    change(id, ago(4), 960, 'Mieterhöhung §558 BGB');
    lease(L + 'Whg. 3 – 3. OG', 'Lukas Bauer', ago(9), dayBefore(ago(3)), 720, 160, 80);
    lease(L + 'Whg. 3 – 3. OG', 'Anna Fischer', ago(3), inFuture(2), 890, 170, 85, { notes: 'Gekündigt durch Mieterin (Umzug nach München).' });
    lease(L + 'Whg. 4 – DG', 'Jonas Schmid', ago(2), null, 830, 140, 70, { rent_type: 'staffel', notes: 'Staffelmiete +30 €/Jahr' });

    // --- Schlesische Straße ---
    const S = 'Mehrfamilienhaus Schlesische Straße|';
    id = lease(S + 'Whg. 1 EG links', 'Familie Gruber', ago(7), null, 590, 210, 0);
    change(id, ago(4), 625, 'Mieterhöhung §558 BGB'); change(id, ago(1), 660, 'Mieterhöhung §558 BGB');
    id = lease(S + 'Whg. 2 EG rechts', 'Stefan Meier', ago(6), null, 610, 210, 0);
    change(id, ago(2), 650, 'Mieterhöhung §558 BGB');
    lease(S + 'Whg. 3 1. OG links', 'Katharina Weber', ago(3), null, 690, 215, 0);
    lease(S + 'Whg. 4 1. OG rechts', 'Daniel Koch', ago(5), dayBefore(ago(0, 2)), 640, 210, 0, { notes: 'Ausgezogen, Wohnung wird renoviert.' });
    lease(S + 'Whg. 5 2. OG links', 'Elena Popescu', ago(1, 6), null, 705, 215, 0);
    lease(S + 'Whg. 6 2. OG rechts', 'Florian Lehner', ago(0, 8), null, 715, 215, 0);
    lease(S + 'Stellplatz 1', 'Stefan Meier', ago(6), null, 35, 0, 0, { deposit: 0, notice: '1 Monat' });
    lease(S + 'Stellplatz 2', 'Familie Gruber', ago(7), null, 35, 0, 0, { deposit: 0, notice: '1 Monat' });

    // --- Bahnhofstraße ---
    const B = 'Bürohaus Bahnhofstraße|';
    id = lease(B + 'EG Praxis', 'Physiotherapie am Bahnhof', ago(5), inFuture(26), 2850, 620, 0, { rent_type: 'index', notice: 'befristet 10 Jahre' });
    change(id, ago(2), 3010, 'Indexanpassung (VPI)');
    id = lease(B + '1. OG Büro', 'Donau IT Solutions GmbH', ago(4), null, 3000, 700, 0, { rent_type: 'index', vat_rate: 19, notice: '6 Monate' });
    change(id, ago(1), 3140, 'Indexanpassung (VPI)');
    lease(B + '2. OG Büro', 'Steuerkanzlei Brunner & Partner', ago(3), inFuture(1), 3050, 690, 0, { vat_rate: 19, notes: 'Verlängerung in Verhandlung.' });

    // --- Einfamilienhaus (als Ganzes vermietet) ---
    id = lease('Einfamilienhaus Ittlinger Straße', 'Familie Obermeier', ago(6), null, 1490, 260, 0);
    change(id, ago(3), 1560, 'Mieterhöhung §558 BGB'); change(id, ago(0, 6), 1640, 'Mieterhöhung §558 BGB');

    // --- Siemensstraße ---
    const G = 'Gewerbehalle Siemensstraße|';
    id = lease(G + 'Halle', 'Niederbayern Logistik KG', ago(4), inFuture(44), 4800, 900, 0, { rent_type: 'index', vat_rate: 19, notice: 'befristet 8 Jahre' });
    change(id, ago(1), 5050, 'Indexanpassung (VPI)');
    // Büroriegel steht leer

    // --- Theresienplatz (teilweise eigen) ---
    const T = 'Wohnanlage Theresienplatz|';
    id = lease(T + 'EG Café', 'Café Theresia', ago(3), null, 1500, 310, 120, { vat_rate: 19, notice: '6 Monate' });
    change(id, ago(1), 1580, 'Staffelmiete');
    lease(T + 'Whg. 7 – 3. OG', 'Christina Wolf', ago(2), null, 670, 230, 0);

    // --- Regensburger Straße (fremd, verwaltet) ---
    const R = 'Doppelhaus Regensburger Straße|';
    lease(R + 'Haushälfte Nord', 'Tobias Ebner', ago(4), null, 1080, 240, 0);
    lease(R + 'Haushälfte Süd', 'Maria Huber', ago(12), dayBefore(ago(1)), 890, 220, 0);
    lease(R + 'Haushälfte Süd', 'Sophie Krämer', ago(1), null, 1150, 240, 0);

    // --- Ereignisse ---
    const ev = (key, date, category, title, cost, contractor, status, description) => {
      const target = key.includes('|') ? uIds[key] : null;
      const bid = target ? target.bid : bIds[BUILDINGS.findIndex((x) => x.b.name === key)];
      return ins(db, 'events', { building_id: bid, unit_id: target?.id ?? null, event_date: date, category, title, cost, contractor, status, description: description || null });
    };
    ev('Wohnhaus Ludwigsplatz', ago(5), 'modernisierung', 'Dacheindeckung erneuert', 48500, 'Dachdeckerei Wallner', 'erledigt');
    ev('Wohnhaus Ludwigsplatz', ago(0, 3), 'wartung', 'Heizungswartung', 420, 'Heizung Sanitär Ziegler', 'erledigt');
    ev(L + 'Whg. 2 – 2. OG', ago(0, 1), 'reparatur', 'Wasserhahn Küche tropft', 140, 'Heizung Sanitär Ziegler', 'erledigt');
    ev(L + 'Whg. 3 – 3. OG', ago(0, 0), 'besichtigung', 'Nachmieter-Besichtigungen', null, null, 'offen', 'Vier Interessenten, Termine Samstag.');
    ev(L + 'EG Laden', ago(2), 'schaden', 'Schaufensterscheibe gesprungen', 1850, 'Glaserei Pichler', 'erledigt', 'Über Glasversicherung reguliert.');
    ev(S + 'Whg. 4 1. OG rechts', ago(0, 1), 'modernisierung', 'Renovierung nach Auszug (Boden, Malerarbeiten)', 6200, 'Malerbetrieb Hirschberger', 'in_arbeit');
    ev('Mehrfamilienhaus Schlesische Straße', ago(4), 'modernisierung', 'Fassadendämmung WDVS', 86000, 'Bau GmbH Straubing', 'erledigt');
    ev('Mehrfamilienhaus Schlesische Straße', ago(0, 0), 'reparatur', 'Haustür schließt nicht richtig', null, null, 'offen');
    ev(B + '1. OG Büro', ago(1), 'reparatur', 'Klimaanlage defekt', 2300, 'Kältetechnik Danner', 'erledigt');
    ev('Bürohaus Bahnhofstraße', ago(0, 2), 'wartung', 'Aufzug TÜV-Prüfung', 680, 'TÜV Süd', 'erledigt');
    ev('Einfamilienhaus Ittlinger Straße', ago(0, 5), 'reparatur', 'Wärmepumpe Störung', 950, 'Heizung Sanitär Ziegler', 'erledigt');
    ev(G + 'Halle', ago(0, 2), 'schaden', 'Rolltor 2 beschädigt (Anfahrschaden)', 3400, 'Torbau Niederbayern', 'in_arbeit');
    ev(G + 'Büroriegel', ago(0, 0), 'besichtigung', 'Besichtigung mit Interessent (Ingenieurbüro)', null, null, 'offen');
    ev(R + 'Haushälfte Süd', ago(1), 'uebergabe', 'Wohnungsübergabe an Sophie Krämer', null, null, 'erledigt');

    // --- Laufende Kosten ---
    const cost = (key, title, category, amount, interval, allocatable = 0) => {
      const bid = bIds[BUILDINGS.findIndex((x) => x.b.name === key)];
      ins(db, 'costs', { building_id: bid, title, category, amount, interval, allocatable });
    };
    cost('Wohnhaus Ludwigsplatz', 'Grundsteuer', 'grundsteuer', 1980, 'jaehrlich', 1);
    cost('Wohnhaus Ludwigsplatz', 'Gebäudeversicherung', 'versicherung', 2450, 'jaehrlich', 1);
    cost('Wohnhaus Ludwigsplatz', 'Darlehen Sparkasse', 'finanzierung', 3900, 'monatlich');
    cost('Mehrfamilienhaus Schlesische Straße', 'Grundsteuer', 'grundsteuer', 1240, 'jaehrlich', 1);
    cost('Mehrfamilienhaus Schlesische Straße', 'Hausmeisterdienst', 'verwaltung', 180, 'monatlich', 1);
    cost('Mehrfamilienhaus Schlesische Straße', 'Darlehen VR-Bank', 'finanzierung', 2650, 'monatlich');
    cost('Bürohaus Bahnhofstraße', 'Darlehen', 'finanzierung', 6800, 'monatlich');
    cost('Bürohaus Bahnhofstraße', 'Aufzugswartung', 'instandhaltung', 450, 'quartal', 1);
    cost('Einfamilienhaus Ittlinger Straße', 'Gebäudeversicherung', 'versicherung', 680, 'jaehrlich', 1);
    cost('Gewerbehalle Siemensstraße', 'Darlehen', 'finanzierung', 4700, 'monatlich');
    cost('Wohnanlage Theresienplatz', 'Hausgeld Whg. 7 + Café', 'hausgeld', 610, 'monatlich');

    // --- Beispieldokumente (Textdateien als Platzhalter) ---
    fs.mkdirSync(uploadDir, { recursive: true });
    const doc = (key, category, title, body) => {
      const target = uIds[key];
      const stored = crypto.randomUUID() + '.txt';
      fs.writeFileSync(path.join(uploadDir, stored), body, 'utf8');
      ins(db, 'documents', {
        building_id: target ? target.bid : bIds[BUILDINGS.findIndex((x) => x.b.name === key)],
        unit_id: target?.id ?? null, category, title,
        original_name: title.replace(/[^\wäöüÄÖÜß -]+/g, '') + '.txt', stored_name: stored,
        mime_type: 'text/plain', size: Buffer.byteLength(body),
      });
    };
    doc(L + 'EG Laden', 'mietvertrag', 'Gewerbemietvertrag Buchhandlung', 'DEMO – Gewerbemietvertrag (Platzhalter)\nMieter: Buchhandlung Gäuboden GmbH\nIndexmiete, 19 % USt.\n');
    doc(L + 'Whg. 1 – 1. OG', 'mietvertrag', 'Mietvertrag Wagner', 'DEMO – Wohnraummietvertrag (Platzhalter)\nMieter: Thomas & Julia Wagner\n');
    doc(L + 'Whg. 1 – 1. OG', 'uebergabeprotokoll', 'Übergabeprotokoll Einzug Wagner', 'DEMO – Übergabeprotokoll\nZählerstände, Schlüssel: 3x Haustür, 2x Wohnung\n');
    doc('Wohnhaus Ludwigsplatz', 'energieausweis', 'Energieausweis Ludwigsplatz 21', 'DEMO – Energieausweis, Klasse D\n');
    doc('Mehrfamilienhaus Schlesische Straße', 'rechnung', 'Rechnung Fassadendämmung', 'DEMO – Rechnung Bau GmbH Straubing über 86.000 €\n');
    doc(B + '1. OG Büro', 'mietvertrag', 'Mietvertrag Donau IT Solutions', 'DEMO – Gewerbemietvertrag Büro 1. OG\n');
    doc('Einfamilienhaus Ittlinger Straße', 'mietvertrag', 'Mietvertrag Familie Obermeier', 'DEMO – Mietvertrag Einfamilienhaus\n');
  });
  run();
}

// Direkter Aufruf: `npm run seed` (setzt die Datenbank zurück und lädt Demodaten)
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await import('dotenv/config');
  const { openDb, DATA_DIR, UPLOAD_DIR } = await import('./db.js');
  const file = path.join(DATA_DIR, 'rentdata.db');
  for (const f of [file, file + '-wal', file + '-shm']) fs.rmSync(f, { force: true });
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
  const db = openDb(file);
  seedDemo(db, UPLOAD_DIR);
  console.log('Demodaten (Straubing) geladen:', db.prepare('SELECT COUNT(*) c FROM buildings').get().c, 'Gebäude');
}

// Berechnungen: aktuelle Miete, Belegung, Kennzahlen je Einheit/Gebäude/Portfolio.

export const today = () => new Date().toISOString().slice(0, 10);

const n = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0);
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export function isActive(lease, date = today()) {
  return lease.start_date <= date && (!lease.end_date || lease.end_date >= date);
}

/** Mietwerte eines Mietverhältnisses zu einem Stichtag (berücksichtigt Mietänderungen). */
export function rentAt(lease, changes, date = today()) {
  let cur = {
    cold_rent: n(lease.cold_rent),
    service_charges: n(lease.service_charges),
    heating_charges: n(lease.heating_charges),
  };
  const relevant = changes
    .filter((c) => c.lease_id === lease.id && c.effective_date <= date)
    .sort((a, b) => a.effective_date.localeCompare(b.effective_date));
  for (const c of relevant) {
    cur = {
      cold_rent: n(c.cold_rent),
      service_charges: c.service_charges == null ? cur.service_charges : n(c.service_charges),
      heating_charges: c.heating_charges == null ? cur.heating_charges : n(c.heating_charges),
    };
  }
  const vat = n(lease.vat_rate) / 100;
  const net = cur.cold_rent + cur.service_charges + cur.heating_charges;
  return { ...cur, warm_rent: round(net), gross_rent: round(net * (1 + vat)) };
}

export function monthlyFactor(interval) {
  return { monatlich: 1, quartal: 1 / 3, jaehrlich: 1 / 12, einmalig: 0 }[interval] ?? 1;
}

export function effectiveUnitOwnership(unit, building) {
  if (unit.ownership && unit.ownership !== 'wie_gebaeude') return unit.ownership;
  return building.ownership === 'eigen' ? 'eigen' : 'fremd';
}

export function wholeBuildingOwnership(building) {
  return building.ownership === 'eigen' ? 'eigen' : 'fremd';
}

/** Lädt alles, was für die Kennzahlen eines oder mehrerer Gebäude nötig ist. */
export function loadPortfolio(db, buildingIds = null) {
  const where = buildingIds ? `WHERE building_id IN (${buildingIds.map(() => '?').join(',')})` : '';
  const args = buildingIds || [];
  const buildings = buildingIds
    ? db.prepare(`SELECT * FROM buildings WHERE id IN (${buildingIds.map(() => '?').join(',')})`).all(...args)
    : db.prepare('SELECT * FROM buildings').all();
  const units = db.prepare(`SELECT * FROM units ${where}`).all(...args);
  const leases = db
    .prepare(
      `SELECT l.*, t.name AS tenant_name, t.kind AS tenant_kind FROM leases l
       JOIN tenants t ON t.id = l.tenant_id ${where.replace('building_id', 'l.building_id')}`
    )
    .all(...args);
  const changes = leases.length
    ? db
        .prepare(`SELECT * FROM rent_changes WHERE lease_id IN (${leases.map(() => '?').join(',')})`)
        .all(...leases.map((l) => l.id))
    : [];
  const costs = db.prepare(`SELECT * FROM costs ${where}`).all(...args);
  const events = db.prepare(`SELECT * FROM events ${where}`).all(...args);
  return { buildings, units, leases, changes, costs, events };
}

export function unitStats(unit, building, ctx, date = today()) {
  const leases = ctx.leases.filter((l) => l.unit_id === unit.id);
  const active = leases.filter((l) => isActive(l, date));
  const rents = active.map((l) => rentAt(l, ctx.changes, date));
  const cold = rents.reduce((s, r) => s + r.cold_rent, 0);
  const warm = rents.reduce((s, r) => s + r.warm_rent, 0);
  const future = leases
    .filter((l) => l.start_date > date)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  return {
    ownership_effective: effectiveUnitOwnership(unit, building),
    // Fremde Einheiten ohne erfasste Mietverhältnisse gelten nicht als Leerstand
    status: active.length ? 'vermietet' : future ? 'reserviert'
      : !leases.length && effectiveUnitOwnership(unit, building) === 'fremd' ? 'fremd' : 'leer',
    current_tenants: active.map((l) => ({ id: l.tenant_id, name: l.tenant_name, lease_id: l.id })),
    current_cold_rent: round(cold),
    current_warm_rent: round(warm),
    rent_per_sqm: unit.area ? round(cold / unit.area) : null,
    lease_count: leases.length,
    next_lease_start: future?.start_date || null,
  };
}

export function buildingStats(building, ctx, date = today()) {
  const year = date.slice(0, 4);
  const units = ctx.units.filter((u) => u.building_id === building.id);
  const unitInfos = units.map((u) => ({ unit: u, stats: unitStats(u, building, ctx, date) }));
  const wholeLeases = ctx.leases.filter((l) => l.building_id === building.id && l.unit_id == null);
  const wholeActive = wholeLeases.filter((l) => isActive(l, date));
  const wholeRents = wholeActive.map((l) => rentAt(l, ctx.changes, date));

  let cold = 0, warm = 0, ownCold = 0, ownWarm = 0;
  for (const { stats } of unitInfos) {
    cold += stats.current_cold_rent;
    warm += stats.current_warm_rent;
    if (stats.ownership_effective === 'eigen') {
      ownCold += stats.current_cold_rent;
      ownWarm += stats.current_warm_rent;
    }
  }
  const wholeOwn = wholeBuildingOwnership(building) === 'eigen';
  for (const r of wholeRents) {
    cold += r.cold_rent;
    warm += r.warm_rent;
    if (wholeOwn) {
      ownCold += r.cold_rent;
      ownWarm += r.warm_rent;
    }
  }

  const managed = unitInfos.filter((i) => i.stats.status !== 'fremd');
  const area = managed.reduce((s, i) => s + n(i.unit.area), 0);
  const rentedArea = unitInfos.filter((i) => i.stats.status === 'vermietet').reduce((s, i) => s + n(i.unit.area), 0);
  const rented = unitInfos.filter((i) => i.stats.status === 'vermietet').length;

  const costs = ctx.costs.filter(
    (c) => c.building_id === building.id && (!c.start_date || c.start_date <= date) && (!c.end_date || c.end_date >= date)
  );
  const monthlyCosts = costs.reduce((s, c) => s + n(c.amount) * monthlyFactor(c.interval), 0);
  const events = ctx.events.filter((e) => e.building_id === building.id);
  const repairCostYear = events
    .filter((e) => e.event_date?.startsWith(year))
    .reduce((s, e) => s + n(e.cost), 0);

  const annualOwnCold = ownCold * 12;
  return {
    unit_count: units.length,
    units_rented: rented,
    units_vacant: unitInfos.filter((i) => i.stats.status === 'leer').length,
    units_owned: unitInfos.filter((i) => i.stats.ownership_effective === 'eigen').length,
    rented_as_whole: wholeActive.length > 0,
    // Belegung nur über selbst verwaltete Einheiten (ohne fremde Einheiten ohne Mietdaten)
    occupancy_rate: managed.length ? round((rented / managed.length) * 100, 1) : wholeActive.length ? 100 : null,
    total_unit_area: round(area),
    rented_area: round(rentedArea),
    monthly_cold_rent: round(cold),
    monthly_warm_rent: round(warm),
    annual_cold_rent: round(cold * 12),
    monthly_cold_rent_own: round(ownCold),
    monthly_warm_rent_own: round(ownWarm),
    annual_cold_rent_own: round(annualOwnCold),
    avg_rent_per_sqm: !units.length && wholeActive.length && (building.living_area || building.commercial_area)
      ? round(cold / (n(building.living_area) + n(building.commercial_area)))
      : rentedArea ? round(unitInfos.filter((i) => i.stats.status === 'vermietet').reduce((s, i) => s + i.stats.current_cold_rent, 0) / rentedArea) : null,
    monthly_costs: round(monthlyCosts),
    monthly_cashflow: round(ownWarm - monthlyCosts),
    repair_costs_year: round(repairCostYear),
    open_events: events.filter((e) => e.status !== 'erledigt').length,
    gross_yield: building.purchase_price ? round((annualOwnCold / building.purchase_price) * 100, 2) : null,
    tenant_count: new Set(
      [...ctx.leases.filter((l) => l.building_id === building.id && isActive(l, date)).map((l) => l.tenant_id)]
    ).size,
  };
}

/** Monatliche Mieteinnahmen (kalt) über die Zeit – für Gebäude- oder Einheiten-Diagramme. */
export function monthlySeries(leases, changes, months = 60, date = today()) {
  if (!leases.length) return [];
  const earliest = leases.reduce((m, l) => (l.start_date < m ? l.start_date : m), date);
  const end = new Date(date.slice(0, 7) + '-01T00:00:00Z');
  let start = new Date(earliest.slice(0, 7) + '-01T00:00:00Z');
  const minStart = new Date(end);
  minStart.setUTCMonth(minStart.getUTCMonth() - (months - 1));
  if (start < minStart) start = minStart;
  const out = [];
  for (let d = new Date(start); d <= end; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const day = d.toISOString().slice(0, 10);
    const active = leases.filter((l) => isActive(l, day));
    const cold = active.reduce((s, l) => s + rentAt(l, changes, day).cold_rent, 0);
    out.push({ month: day.slice(0, 7), cold_rent: round(cold), active_leases: active.length });
  }
  return out;
}

/** Preisentwicklung als Liste von Stufen (Beginn jedes Vertrags + jede Mietänderung). */
export function priceHistory(leases, changes, area) {
  const points = [];
  for (const l of leases) {
    points.push({
      date: l.start_date, lease_id: l.id, tenant_name: l.tenant_name,
      cold_rent: n(l.cold_rent), service_charges: n(l.service_charges), heating_charges: n(l.heating_charges),
      reason: 'Mietbeginn',
    });
    for (const c of changes.filter((c) => c.lease_id === l.id)) {
      points.push({
        date: c.effective_date, lease_id: l.id, tenant_name: l.tenant_name, change_id: c.id,
        cold_rent: n(c.cold_rent), service_charges: c.service_charges, heating_charges: c.heating_charges,
        reason: c.reason || 'Mietänderung',
      });
    }
  }
  points.sort((a, b) => a.date.localeCompare(b.date));
  return points.map((p) => ({ ...p, per_sqm: area ? round(p.cold_rent / area) : null }));
}

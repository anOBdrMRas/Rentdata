import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { seedDemo } from '../server/seed.js';

async function start() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rentdata-'));
  const db = openDb(':memory:');
  const app = createApp(db, { uploadDir: dir });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: res.status, body: res.status === 204 ? null : await res.json() };
  };
  return { db, dir, server, call, base };
}

test('Gebäude mit Einheit, Mieter, Mietvertrag und Mietänderung', async () => {
  const { server, call } = await start();
  try {
    const b = (await call('POST', '/buildings', { name: 'Testhaus', ownership: 'eigen', purchase_price: 120000 })).body;
    const u = (await call('POST', '/units', { building_id: b.id, name: 'Whg. 1', area: 50 })).body;
    const t = (await call('POST', '/tenants', { name: 'Max Muster' })).body;
    const l = (await call('POST', '/leases', { unit_id: u.id, tenant_id: t.id, start_date: '2020-01-01', cold_rent: 500, service_charges: 100 })).body;
    assert.equal(l.building_id, b.id, 'building_id wird aus Einheit abgeleitet');
    await call('POST', '/rent-changes', { lease_id: l.id, effective_date: '2022-01-01', cold_rent: 550 });

    const detail = (await call('GET', '/buildings/' + b.id)).body;
    assert.equal(detail.stats.unit_count, 1);
    assert.equal(detail.stats.monthly_cold_rent, 550);
    assert.equal(detail.stats.annual_cold_rent_own, 6600);
    assert.equal(detail.stats.gross_yield, 5.5);
    assert.equal(detail.units[0].stats.status, 'vermietet');
    assert.equal(detail.units[0].stats.rent_per_sqm, 11);

    const unit = (await call('GET', '/units/' + u.id)).body;
    assert.deepEqual(unit.price_history.map((p) => p.cold_rent), [500, 550]);

    assert.equal((await call('DELETE', '/tenants/' + t.id)).status, 409, 'Mieter mit Vertrag nicht löschbar');
    assert.equal((await call('POST', '/buildings', {})).status, 400);
  } finally {
    server.close();
  }
});

test('Fremdes Gebäude ohne Einheiten, als Ganzes vermietet', async () => {
  const { server, call } = await start();
  try {
    const b = (await call('POST', '/buildings', { name: 'Fremd', ownership: 'fremd', living_area: 100 })).body;
    const t = (await call('POST', '/tenants', { name: 'Firma GmbH', kind: 'gewerblich' })).body;
    await call('POST', '/leases', { building_id: b.id, tenant_id: t.id, start_date: '2021-05-01', cold_rent: 1000 });
    const s = (await call('GET', '/buildings/' + b.id)).body.stats;
    assert.equal(s.rented_as_whole, true);
    assert.equal(s.monthly_cold_rent, 1000);
    assert.equal(s.monthly_cold_rent_own, 0, 'Fremdeigentum zählt nicht zu eigenen Einnahmen');
    assert.equal(s.avg_rent_per_sqm, 10);
  } finally {
    server.close();
  }
});

test('Dokument-Upload und Download', async () => {
  const { server, call, base } = await start();
  try {
    const b = (await call('POST', '/buildings', { name: 'Doku' })).body;
    const fd = new FormData();
    fd.append('building_id', b.id);
    fd.append('category', 'mietvertrag');
    fd.append('files', new Blob(['Hallo']), 'Mietvertrag Müller.txt');
    const res = await fetch(base + '/documents', { method: 'POST', body: fd });
    assert.equal(res.status, 201);
    const [doc] = await res.json();
    assert.equal(doc.original_name, 'Mietvertrag Müller.txt');
    const file = await fetch(`${base}/documents/${doc.id}/file`);
    assert.equal(await file.text(), 'Hallo');
  } finally {
    server.close();
  }
});

test('Demodaten Straubing', async () => {
  const { db, dir, server, call } = await start();
  try {
    seedDemo(db, dir);
    const list = (await call('GET', '/buildings')).body;
    assert.ok(list.length >= 8);
    assert.ok(list.every((b) => b.city === 'Straubing' && b.lat && b.lng));
    assert.ok(list.some((b) => b.ownership === 'fremd'));
    assert.ok(list.some((b) => b.building_type === 'gewerbe'));
    const dash = (await call('GET', '/dashboard')).body;
    assert.ok(dash.totals.monthly_cold_rent > 0);
  } finally {
    server.close();
  }
});

test('Passwortschutz', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rentdata-'));
  const app = createApp(openDb(':memory:'), { uploadDir: dir, auth: { user: 'admin', password: 'geheim' } });
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/api/buildings')).status, 401);
    assert.equal((await fetch(base + '/healthz')).status, 200);
    const bad = 'Basic ' + Buffer.from('admin:falsch').toString('base64');
    assert.equal((await fetch(base + '/api/buildings', { headers: { Authorization: bad } })).status, 401);
    const ok = 'Basic ' + Buffer.from('admin:geheim').toString('base64');
    assert.equal((await fetch(base + '/api/buildings', { headers: { Authorization: ok } })).status, 200);
  } finally {
    server.close();
  }
});

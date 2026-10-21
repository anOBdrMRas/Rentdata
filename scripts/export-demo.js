// Erzeugt dist/demo-data.json für den statischen Prototyp (GitHub Pages):
// lädt die Demodaten in eine temporäre Datenbank und exportiert alle Tabellen als JSON.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { seedDemo } from '../server/seed.js';

const outDir = path.resolve(process.argv[2] || 'dist');
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rentdata-demo-'));
const db = openDb(':memory:');
seedDemo(db, uploadDir);

const tables = ['buildings', 'units', 'tenants', 'leases', 'rent_changes', 'events', 'costs', 'documents'];
const data = Object.fromEntries(tables.map((t) => [t, db.prepare(`SELECT * FROM ${t}`).all()]));
// Dateiinhalte der Beispieldokumente einbetten
for (const d of data.documents) {
  const buf = fs.readFileSync(path.join(uploadDir, d.stored_name));
  d.data = `data:${d.mime_type || 'application/octet-stream'};base64,${buf.toString('base64')}`;
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'demo-data.json'), JSON.stringify(data));
fs.rmSync(uploadDir, { recursive: true, force: true });
console.log(`demo-data.json geschrieben (${data.buildings.length} Gebäude, ${data.units.length} Einheiten)`);

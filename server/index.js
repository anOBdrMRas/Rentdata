import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, UPLOAD_DIR } from './db.js';
import { createApp } from './app.js';
import { seedDemo } from './seed.js';

const db = openDb();

// Beim allerersten Start Demodaten laden (abschaltbar mit DEMO_DATA=false)
const empty = db.prepare('SELECT COUNT(*) AS c FROM buildings').get().c === 0;
if (empty && process.env.DEMO_DATA !== 'false') {
  seedDemo(db, UPLOAD_DIR);
  console.log('Leere Datenbank – Demodaten (Straubing) wurden geladen.');
}

const app = createApp(db, { uploadDir: UPLOAD_DIR, googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '' });

// Gebautes Frontend ausliefern (nach `npm run build`)
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Rentdata läuft auf http://localhost:${port}`));

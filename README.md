# Rentdata – Verwaltung von Gebäuden & Mieteinheiten

Web-App zur Verwaltung von privaten und gewerblichen Mietobjekten: Gebäude, Mieteinheiten,
Mieter, Mietverträge, Preisentwicklung, Reparaturen, laufende Kosten und Dokumente – als Liste
und auf einer Karte (Google Maps oder OpenStreetMap).

## Schnellstart

Voraussetzung: [Node.js](https://nodejs.org) ab Version 20.

```bash
npm install
npm run build     # Frontend bauen
npm start         # startet http://localhost:3000
```

Beim ersten Start werden automatisch **Demodaten aus Straubing** geladen (8 Gebäude: Altstadthaus
mit Laden, Mehrfamilienhaus, Bürohaus, Einfamilienhaus, Gewerbehalle, Eigentümergemeinschaft,
fremd verwaltetes Doppelhaus, beobachtetes Grundstück). Adressen sind reale Straßen, Personen,
Hausnummern und Zahlen sind erfunden.

- Demodaten neu laden (**löscht alle Daten!**): `npm run seed`
- Ohne Demodaten starten: `DEMO_DATA=false npm start`

Für die Entwicklung (automatisches Neuladen): `npm run dev` → http://localhost:5173

## Online stellen

### Variante A: Prototyp auf GitHub Pages (kostenlos, ohne Server)

Die App gibt es auch als **statische Version**, die komplett im Browser läuft: Demodaten sind
eingebaut, Änderungen werden im Browser (localStorage) gespeichert. Ideal zum Ausprobieren und
Zeigen – aber: jeder Besucher hat seine eigenen Daten, nichts wird zentral gespeichert,
Dokumente max. 2 MB.

1. Auf GitHub: **Settings → Pages → Build and deployment → Source: „GitHub Actions“** (einmalig).
2. Bei jedem Push auf den Standard-Branch baut der Workflow `.github/workflows/pages.yml` die
   Seite und veröffentlicht sie unter `https://<benutzer>.github.io/Rentdata/`.
3. Optional Google Maps: Repository-Secret `GOOGLE_MAPS_API_KEY` anlegen
   (Settings → Secrets and variables → Actions). Der Key ist im Browser sichtbar – in der Google
   Cloud Console unbedingt auf die Pages-Adresse beschränken.

Lokal testen: `npm run preview:static` → http://localhost:4173

### Variante B: Vollversion mit Server (Docker)

Der Workflow `.github/workflows/ci.yml` testet bei jedem Push, baut die App und veröffentlicht ein
Docker-Image unter `ghcr.io/anobdrmras/rentdata`. Starten z. B. auf eigenem Server/NAS:

```bash
docker compose up -d      # siehe docker-compose.yml, Daten landen in ./data
```

Das Image läuft auch bei Hostern wie Fly.io, Railway oder Render (persistentes Volume für `/data`
nötig). Für automatisches Deployment kann ein Deploy-Hook als Secret `DEPLOY_HOOK_URL` hinterlegt
werden. **Im Internet immer `APP_PASSWORD` setzen** (Passwortschutz, Benutzer über `APP_USER`).

## Google Maps

Ohne Konfiguration nutzt die Karte **OpenStreetMap** (kostenlos, kein Key nötig).
Für **Google Maps** eine Datei `.env` anlegen (Vorlage: `.env.example`):

```
GOOGLE_MAPS_API_KEY=dein-key
```

Im Google-Cloud-Projekt müssen die **Maps JavaScript API** und die **Geocoding API** aktiviert sein.
Der Key wird auch für „📍 Aus Adresse ermitteln“ (Adresse → Koordinaten) verwendet; ohne Key
übernimmt das Nominatim/OpenStreetMap.

## Funktionen

**Gebäude**
- Stammdaten: Adresse, Koordinaten, Art (Wohnen/Gewerbe/gemischt), Baujahr, Flächen, Heizung,
  Energieklasse, Grundbuch, Kaufpreis, Verkehrswert, Hausverwaltung
- Eigentum: **eigen**, **fremd** (z. B. Verwaltung im Auftrag) oder **teilweise** (z. B. einzelne
  Eigentumswohnungen in einer WEG). Fremde Objekte zählen nicht zu den eigenen Einnahmen.
- Kennzahlen: Anzahl Einheiten, Belegung, Kalt-/Warmmiete, Jahreseinnahmen (gesamt und eigen),
  Ø Miete/m², laufende Kosten, Cashflow, Bruttorendite, Reparaturkosten, offene Vorgänge
- Gebäude **können Mieteinheiten haben, müssen aber nicht** – ein Haus kann auch als Ganzes
  vermietet werden. Einheiten lassen sich jederzeit hinzufügen.

**Mieteinheiten** (Wohnung, Gewerbe, Büro, Laden, Lager, Stellplatz …)
- Stammdaten inkl. Fläche, Zimmer, Etage, Ausstattung, Zähler, Soll-Miete, eigenes Eigentum
- Aktuelle und frühere Mieter mit Verträgen (Kaltmiete, NK, Heizkosten, USt. bei Gewerbe,
  Kaution, Index-/Staffelmiete, Kündigungsfrist)
- **Preisentwicklung**: jede Mietänderung mit Grund, Diagramm und Tabelle (€/m², Veränderung in %)
- Ereignisse (Reparatur, Wartung, Schaden, Modernisierung, Übergabe, Besichtigung) mit Kosten
- Dokumente (Mietverträge, Protokolle, Rechnungen, Fotos …) per Drag & Drop

**Weitere Ansichten**
- Übersicht/Dashboard mit Portfolio-Kennzahlen, Einnahmen-Verlauf, offenen Vorgängen,
  auslaufenden Verträgen und Leerstand
- **Karte**: alle Gebäude farbig nach Eigentum, Klick zeigt Kennzahlen → „Gebäude öffnen“ →
  Einheiten
- Listen für Mieteinheiten, Mieter (privat/gewerblich, aktuell/ehemalig), Ereignisse, Dokumente

## Technik

- Backend: Node.js, Express, SQLite (`better-sqlite3`), Datei-Uploads mit `multer`
- Frontend: React + Vite, Leaflet bzw. Google Maps JavaScript API
- Daten liegen in `./data/` (Datenbank `rentdata.db` und Ordner `uploads/`) – für ein Backup
  einfach diesen Ordner sichern. Speicherort änderbar über `DATA_DIR`.
- Tests: `npm test`

Hinweis: Ohne `APP_PASSWORD` ist die Vollversion ohne Anmeldung erreichbar – das ist nur für den
eigenen Rechner bzw. das Heimnetz gedacht.

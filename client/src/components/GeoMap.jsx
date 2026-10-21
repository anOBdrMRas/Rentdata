import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { getConfig } from '../api.js';

// Karte mit Google Maps (wenn ein API-Key konfiguriert ist) oder OpenStreetMap/Leaflet.
// markers: [{ id, lat, lng, color, title, popup?: () => HTMLElement }]

const DEFAULT_CENTER = { lat: 48.8817, lng: 12.5736 }; // Straubing

let googlePromise;
function loadGoogle(key) {
  if (window.google?.maps?.Map) return Promise.resolve();
  googlePromise ??= new Promise((resolve, reject) => {
    window.__rentdataGmInit = () => resolve();
    window.gm_authFailure = () => reject(new Error('Google Maps: API-Key ungültig'));
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=__rentdataGmInit&language=de&region=DE`;
    s.async = true;
    s.onerror = () => reject(new Error('Google Maps konnte nicht geladen werden'));
    document.head.appendChild(s);
  });
  return googlePromise;
}

function leafletAdapter(el, { center, zoom, onMapClick }) {
  const map = L.map(el, { scrollWheelZoom: true }).setView([center.lat, center.lng], zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap-Mitwirkende',
  }).addTo(map);
  if (onMapClick) map.on('click', (e) => onMapClick.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
  let layer = L.layerGroup().addTo(map);
  const byId = {};
  return {
    kind: 'osm',
    setMarkers(markers) {
      layer.clearLayers();
      for (const m of markers) {
        const mk = L.circleMarker([m.lat, m.lng], {
          radius: m.big ? 11 : 9, color: '#ffffff', weight: 2, fillColor: m.color, fillOpacity: 1,
        }).addTo(layer);
        if (m.title) mk.bindTooltip(m.title, { direction: 'top', offset: [0, -8] });
        if (m.popup) mk.bindPopup(() => m.popup(), { minWidth: 220 });
        byId[m.id] = mk;
      }
    },
    fit(markers) {
      if (!markers.length) return;
      if (markers.length === 1) map.setView([markers[0].lat, markers[0].lng], Math.max(map.getZoom(), zoom, 15), { animate: false });
      else map.fitBounds(L.latLngBounds(markers.map((m) => [m.lat, m.lng])), { padding: [40, 40], maxZoom: 16, animate: false });
    },
    open(id) {
      const mk = byId[id];
      if (mk) { map.setView(mk.getLatLng(), Math.max(map.getZoom(), 15)); mk.openPopup(); }
    },
    resize: () => map.invalidateSize(),
    destroy: () => {
      // laufende Zoom-/Pan-Animationen stoppen, sonst wirft Leaflet beim Entfernen Fehler
      map.stop();
      map.off();
      map.remove();
    },
  };
}

function googleAdapter(el, { center, zoom, onMapClick }) {
  const g = window.google.maps;
  const map = new g.Map(el, { center, zoom, mapTypeControl: true, streetViewControl: true, fullscreenControl: true });
  if (onMapClick) map.addListener('click', (e) => onMapClick.current?.({ lat: e.latLng.lat(), lng: e.latLng.lng() }));
  const info = new g.InfoWindow();
  let list = [];
  const byId = {};
  const openFor = (m, mk) => {
    if (!m.popup) return;
    info.setContent(m.popup());
    info.open({ map, anchor: mk });
  };
  return {
    kind: 'google',
    setMarkers(markers) {
      list.forEach((mk) => mk.setMap(null));
      list = markers.map((m) => {
        const mk = new g.Marker({
          position: { lat: m.lat, lng: m.lng }, map, title: m.title,
          icon: { path: g.SymbolPath.CIRCLE, scale: m.big ? 11 : 9, fillColor: m.color, fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2 },
        });
        mk.addListener('click', () => openFor(m, mk));
        byId[m.id] = { m, mk };
        return mk;
      });
    },
    fit(markers) {
      if (!markers.length) return;
      if (markers.length === 1) { map.setCenter(markers[0]); map.setZoom(Math.max(zoom, 15)); return; }
      const b = new g.LatLngBounds();
      markers.forEach((m) => b.extend(m));
      map.fitBounds(b, 50);
    },
    open(id) {
      const x = byId[id];
      if (x) { map.panTo(x.mk.getPosition()); openFor(x.m, x.mk); }
    },
    resize: () => {},
    destroy: () => { list.forEach((mk) => mk.setMap(null)); info.close(); },
  };
}

/** Liest eine CSS-Variable (für Markerfarben, die Karten nicht als var() verstehen). */
export const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export default function GeoMap({ markers = [], height = 420, zoom = 13, center, onMapClick, fitOnChange = true, apiRef }) {
  const el = useRef(null);
  const adapter = useRef(null);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const opts = { center: center || markers[0] || DEFAULT_CENTER, zoom, onMapClick: onMapClick ? clickRef : null };
    getConfig().then(async ({ googleMapsApiKey }) => {
      if (cancelled) return;
      if (googleMapsApiKey) {
        try {
          await loadGoogle(googleMapsApiKey);
          if (cancelled) return;
          adapter.current = googleAdapter(el.current, opts);
        } catch (e) {
          setNote(e.message + ' – es wird OpenStreetMap verwendet.');
        }
      }
      if (cancelled) return;
      if (!adapter.current) adapter.current = leafletAdapter(el.current, opts);
      if (apiRef) apiRef.current = adapter.current;
      setReady(true);
    });
    return () => {
      cancelled = true;
      adapter.current?.destroy();
      adapter.current = null;
      if (el.current) el.current.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const key = markers.map((m) => `${m.id}:${m.lat}:${m.lng}:${m.color}`).join('|');
  useEffect(() => {
    if (!ready || !adapter.current) return;
    adapter.current.setMarkers(markers);
    if (fitOnChange) adapter.current.fit(markers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, key]);

  return (
    <div>
      <div ref={el} className="map" style={{ height }} />
      {note && <div className="small muted" style={{ marginTop: 4 }}>{note}</div>}
    </div>
  );
}

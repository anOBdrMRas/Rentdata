import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { STATIC } from './api.js';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* GitHub Pages kennt kein Server-Routing → dort Hash-URLs (#/gebaeude/1) */}
    {STATIC ? <HashRouter><App /></HashRouter> : <BrowserRouter><App /></BrowserRouter>}
  </React.StrictMode>
);

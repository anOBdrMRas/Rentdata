import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { label } from '../schema.js';

/** Lädt Daten von der API und liefert [data, reload, error]. */
export function useData(url) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    if (!url) return;
    api.get(url).then((d) => { setData(d); setError(null); }).catch(setError);
  }, [url]);
  useEffect(load, [load]);
  return [data, load, error];
}

export function Loading({ error }) {
  if (error) return <div className="error">{error.message}</div>;
  return <div className="empty">Lade …</div>;
}

export function Modal({ title, onClose, children, footer, width }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { width } : undefined} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose} aria-label="Schließen">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Kpi({ label: l, value, sub }) {
  return (
    <div className="card kpi">
      <div className="k-label">{l}</div>
      <div className="k-value">{value}</div>
      {sub && <div className="k-sub">{sub}</div>}
    </div>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={active === t.id} className={active === t.id ? 'active' : ''} onClick={() => onChange(t.id)}>
          {t.label}
          {t.count != null && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function OwnershipBadge({ value, group = 'ownership' }) {
  const color = { eigen: 'var(--own-eigen)', fremd: 'var(--own-fremd)', teilweise: 'var(--own-teilweise)' }[value];
  return (
    <span className="badge">
      {color && <span className="dot" style={{ background: color }} />}
      {label(group, value)}
    </span>
  );
}

export function StatusBadge({ status }) {
  const cls = { vermietet: 'good', leer: 'danger', reserviert: 'info', fremd: '', offen: 'warn', in_arbeit: 'info', erledigt: 'good' }[status];
  const group = ['offen', 'in_arbeit', 'erledigt'].includes(status) ? 'event_status' : 'unit_status';
  return <span className={`badge ${cls || ''}`}>{label(group, status)}</span>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export async function confirmDelete(what, fn) {
  if (!window.confirm(`${what} wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) return false;
  try {
    await fn();
    return true;
  } catch (e) {
    window.alert(e.message);
    return false;
  }
}

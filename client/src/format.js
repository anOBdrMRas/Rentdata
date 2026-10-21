const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const eur0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

export const money = (v, digits = 2) => (v == null || v === '' ? '–' : (digits ? eur : eur0).format(v));
export const number = (v, unit = '') => (v == null || v === '' ? '–' : num.format(v) + (unit ? ' ' + unit : ''));
export const pct = (v) => (v == null ? '–' : num.format(v) + ' %');
export const date = (v) => (v ? new Date(v + (v.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('de-DE') : '–');
export const bytes = (v) => (v > 1e6 ? num.format(v / 1e6) + ' MB' : num.format(Math.ceil(v / 1e3)) + ' KB');
export const address = (b) =>
  [[b.street, b.house_number].filter(Boolean).join(' '), [b.zip, b.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

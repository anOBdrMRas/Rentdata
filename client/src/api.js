// Im statischen Modus (GitHub Pages) läuft die API im Browser, sonst auf dem Server.
export const STATIC = import.meta.env.VITE_STATIC === 'true';

let staticBackend;
const backend = () => (staticBackend ??= import('./static/backend.js'));

async function request(method, url, body) {
  if (STATIC) return (await backend()).handle(method, url, body);
  const opts = { method, headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch('/api' + url, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Fehler ${res.status}`);
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b),
  put: (u, b) => request('PUT', u, b),
  del: (u) => request('DELETE', u),
};

let configPromise;
export const getConfig = () => (configPromise ??= api.get('/config').catch(() => ({})));

/** Props für einen Link auf ein Dokument (Ansehen oder Herunterladen) */
export function docLinkProps(id, download = false) {
  if (!STATIC) return { href: `/api/documents/${id}/file${download ? '?download=1' : ''}`, target: download ? undefined : '_blank', rel: 'noreferrer' };
  return {
    href: '#',
    onClick: (e) => {
      e.preventDefault();
      backend().then((b) => b.openDocument(id, download));
    },
  };
}

export async function resetDemoData() {
  if (STATIC) await (await backend()).resetStaticData();
}

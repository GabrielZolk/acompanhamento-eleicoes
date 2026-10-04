// Cliente dos arquivos públicos de resultados do TSE (resultados.tse.jus.br).
// Usa ETag/If-None-Match para que consultas sem mudança custem um 304.

export const TSE_HOST = 'https://resultados.tse.jus.br';
export const AMBIENTE = process.env.TSE_AMBIENTE || 'oficial';
export const CICLO = process.env.TSE_CICLO || 'ele2026';
export const BASE = `${TSE_HOST}/${AMBIENTE}/${CICLO}`;

const pad = (v, n) => String(v).padStart(n, '0');

export const urls = {
  unificado: (ele, cargo, uf, mun = '') =>
    `${BASE}/${ele}/dados/${uf}/${uf}${mun ? pad(mun, 5) : ''}-c${pad(cargo, 4)}-e${pad(ele, 6)}-u.json`,
  acompanhamento: (ele, uf = 'br') => `${BASE}/${ele}/dados/${uf}/${uf}-e${pad(ele, 6)}-ab.json`,
  municipios: (ele) => `${BASE}/${ele}/config/mun-e${pad(ele, 6)}-cm.json`,
  foto: (ele, uf, sqcand) => `${BASE}/${ele}/fotos/${uf}/${sqcand}.jpeg`,
  config: () => `${TSE_HOST}/${AMBIENTE}/comum/config/ele-c.json`,
};

const cache = new Map(); // url -> { etag, data, fetchedAt }
export const stats = { requests: 0, notModified: 0, errors: 0, lastError: null };

export async function fetchJson(url, { timeoutMs = 15000 } = {}) {
  const hit = cache.get(url);
  const headers = { 'User-Agent': 'apuracao-2026-painel/1.0', Accept: 'application/json' };
  if (hit?.etag) headers['If-None-Match'] = hit.etag;
  stats.requests++;
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (res.status === 304 && hit) {
      stats.notModified++;
      hit.fetchedAt = Date.now();
      return { data: hit.data, changed: false };
    }
    if (res.status === 404) return { data: null, changed: false, missing: true };
    if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
    const data = await res.json();
    cache.set(url, { etag: res.headers.get('etag'), data, fetchedAt: Date.now() });
    return { data, changed: true };
  } catch (err) {
    stats.errors++;
    stats.lastError = { message: err.message, at: Date.now() };
    if (hit) return { data: hit.data, changed: false, stale: true };
    throw err;
  }
}

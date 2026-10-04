// Cliente dos arquivos públicos de resultados do TSE (resultados.tse.jus.br).
// Usa ETag/If-None-Match para que consultas sem mudança custem um 304.
// Todas as consultas passam por um limitador: o TSE responde 429 acima de ~2.000 req/s
// por IP, e na Vercel todos os visitantes compartilham poucos IPs.

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

export const stats = { requests: 0, notModified: 0, errors: 0, limitado: 0, lastError: null };

// ---------------------------------------------------------------- limitador
// O limite real do TSE é bem menor do que o cabeçalho anuncia (ele soma a carga ao longo de
// minutos), por isso o orçamento é conservador e o mapa por cidade tem uma cota própria.
const MAX_SIMULTANEAS = 16;
const POR_SEGUNDO = { alta: 100, baixa: 30 };
const filas = { alta: [], baixa: [] }; // painel/versão passam na frente do mapa por cidade
const janelas = { alta: { inicio: 0, n: 0 }, baixa: { inicio: 0, n: 0 } };
const pausas = { alta: 0, baixa: 0 };
let ativas = 0;
let agendado = false;

function podeAgora(p, agora) {
  if (agora < pausas[p]) return pausas[p] - agora;
  const j = janelas[p];
  if (agora - j.inicio >= 1000) { j.inicio = agora; j.n = 0; }
  return j.n < POR_SEGUNDO[p] ? 0 : 1000 - (agora - j.inicio);
}

function bombear() {
  agendado = false;
  while (ativas < MAX_SIMULTANEAS) {
    const agora = Date.now();
    let p = null, espera = Infinity;
    for (const q of ['alta', 'baixa']) {
      if (!filas[q].length) continue;
      const w = podeAgora(q, agora);
      if (w === 0) { p = q; break; }
      espera = Math.min(espera, w);
    }
    if (!p) return espera < Infinity ? agendar(espera) : undefined;
    janelas[p].n++;
    ativas++;
    filas[p].shift()();
  }
}
function agendar(ms) {
  if (agendado) return;
  agendado = true;
  setTimeout(bombear, Math.max(5, ms));
}

export async function comLimite(fn, { prioridade = 'alta' } = {}) {
  await new Promise((resolve) => {
    filas[prioridade].push(resolve);
    bombear();
  });
  try {
    return await fn();
  } finally {
    ativas--;
    bombear();
  }
}

// O TSE pediu para desacelerar (429): o painel espera alguns segundos; o mapa por cidade, 5 minutos.
export function frear(res) {
  const s = Number(res?.headers?.get('retry-after')) || 5;
  const agora = Date.now();
  pausas.alta = Math.max(pausas.alta, agora + Math.min(60, s) * 1000);
  pausas.baixa = Math.max(pausas.baixa, agora + 5 * 60e3);
  stats.limitado++;
}
export const pausado = (p = 'alta') => Date.now() < pausas[p];

// ---------------------------------------------------------------- JSON com ETag
const cache = new Map(); // url -> { etag, data, fetchedAt }

export async function fetchJson(url, { timeoutMs = 15000, prioridade = 'alta' } = {}) {
  const hit = cache.get(url);
  if (hit && pausado()) return { data: hit.data, changed: false, stale: true };
  const headers = { 'User-Agent': 'apuracao-2026-painel/1.0', Accept: 'application/json' };
  if (hit?.etag) headers['If-None-Match'] = hit.etag;
  stats.requests++;
  try {
    const res = await comLimite(() => fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) }), { prioridade });
    if (res.status === 304 && hit) {
      stats.notModified++;
      hit.fetchedAt = Date.now();
      return { data: hit.data, changed: false };
    }
    if (res.status === 404) return { data: null, changed: false, missing: true };
    if (res.status === 429) frear(res);
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

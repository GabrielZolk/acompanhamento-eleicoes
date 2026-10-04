const TZ = 'America/Sao_Paulo';
const nf = new Intl.NumberFormat('pt-BR');
const hm = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const dm = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: 'long' });

export const int = (n) => nf.format(Math.round(n || 0));

export const pct = (n, casas = 1) =>
  (n || 0).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }) + '%';

export const sinal = (n, casas = 1) => (n >= 0 ? '+' : '−') + pct(Math.abs(n), casas);

export function compacto(n) {
  if (n >= 1e6) return (n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
  if (n >= 1e3) return (n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil';
  return int(n);
}

// 19:36
export const horaMin = (ms) => (ms ? hm.format(new Date(ms)) : '--:--');
// 19h36
export const hora = (ms) => (ms ? hm.format(new Date(ms)).replace(':', 'h') : '--h--');
// 04 de outubro
export const dataExtenso = (ms) => dm.format(new Date(ms));

const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du']);
export function nomeProprio(s = '') {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i, arr) => (i > 0 && i < arr.length - 1 && PARTICULAS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

export function iniciais(nome = '') {
  const w = nome.split(/\s+/).filter((x) => x && !PARTICULAS.has(x.toLowerCase()));
  if (!w.length) return '?';
  const ult = w[w.length - 1];
  if (ult.length === 1) return ult.toUpperCase();
  return (w[0][0] + (w.length > 1 ? ult[0] : '')).toUpperCase();
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const semAcento = (s = '') => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const ufLabel = (uf) => (uf === 'zz' ? 'EX' : uf.toUpperCase());

// Mistura duas cores hex (t = 0 -> a, t = 1 -> b)
export function mix(a, b, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

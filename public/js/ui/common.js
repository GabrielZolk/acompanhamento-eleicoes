import { esc, iniciais, pct, int } from '../format.js';

// Fotos que falharam não são pedidas de novo (evita piscar a cada atualização).
const fotosQuebradas = new Set();
function fotoFalhou(img) {
  fotosQuebradas.add(img.getAttribute('src'));
  img.remove();
}
// Erros de imagem não sobem na árvore; ouvindo na fase de captura pegamos todas as fotos.
document.addEventListener('error', (ev) => {
  const img = ev.target;
  if (img instanceof HTMLImageElement && img.closest('.avatar')) fotoFalhou(img);
}, true);

export function avatar(c, cls = '') {
  const foto = c.foto && !fotosQuebradas.has(c.foto) ? c.foto : null;
  return `<div class="avatar ${cls}" style="--c:${c.cor}">
    <div class="avatar__inner"><span>${esc(iniciais(c.nome))}</span>${
      foto ? `<img src="${esc(foto)}" alt="" loading="lazy" decoding="async">` : ''
    }</div></div>`;
}

// Número que conta até o novo valor quando muda (ver morph.js).
export function cnt(v, f = 'int', casas = 1, sufixo = '') {
  const n = Number(v) || 0;
  const txt = (f === 'pct' ? pct(n, casas) : int(n)) + sufixo;
  return `<span class="cnt" data-v="${n}" data-f="${f}" data-c="${casas}"${sufixo ? ` data-s="${esc(sufixo)}"` : ''}>${txt}</span>`;
}

// Linha das listas dos modais. O nome fica sozinho na 1ª linha (pode ser cortado com "…");
// o selo (Eleito, Dentro, 2º turno…), a UF e os detalhes vão na 2ª, com o selo sempre visível.
export function linhaLista({ pos, avatarHtml, nome, titulo = '', selo = '', uf = '', det = '', valor, votos, cor, casas = 1 }) {
  return `<div class="mrow" style="--c:${cor}">
    <span class="mrow__n">${pos}</span>
    ${avatarHtml}
    <div class="mrow__info">
      <div class="mrow__nome" title="${esc(titulo || nome)}">${esc(nome)}</div>
      <div class="mrow__det">${selo}${uf ? `<span class="uf-chip">${esc(uf)}</span>` : ''}${det ? `<span class="mrow__txt" title="${esc(det)}">${esc(det)}</span>` : ''}</div>
    </div>
    <div class="bar" style="margin:0"><i style="width:${Math.min(100, valor || 0).toFixed(2)}%"></i></div>
    <div class="mrow__num"><b>${pct(valor, casas)}</b><small>${int(votos)} votos</small></div>
  </div>`;
}

// Selo de vitória matematicamente garantida (o TSE só marca ao fim da totalização do lugar):
// mesma cor do selo oficial, com contorno e cadeado para não se confundir com ele.
export const DICA_GARANTIDO = 'Matematicamente garantido · o TSE confirma ao fim da totalização';
export function seloGarantido(tipo, rotulo = tipo === 'eleito' ? 'Eleito' : '2º turno') {
  return `<span class="pill ${tipo === 'eleito' ? 'pill--eleito' : 'pill--turno'} pill--garantido" title="${DICA_GARANTIDO}">${rotulo}${ICON.cadeado}</span>`;
}

export function avatarPartido(p, cls = '') {
  return `<div class="avatar avatar--party ${cls}" style="--c:${p.cor}"><div class="avatar__inner"><span>${esc(p.sigla.slice(0, 6))}</span></div></div>`;
}

export function donut(valor, size, stroke, labelSize, id) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, valor || 0));
  const dash = (c * v) / 100;
  return `<div class="donut" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#34e3a4"/><stop offset="1" stop-color="#1fb85c"/></linearGradient></defs>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#222938" stroke-width="${stroke}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${stroke}" stroke-linecap="${v > 0 ? 'round' : 'butt'}" stroke-dasharray="${dash.toFixed(2)} ${c.toFixed(2)}"/>
    </svg>
    <span class="donut__label" style="font-size:${labelSize}px">${cnt(v, 'pct')}</span>
  </div>`;
}

export const ICON = {
  share: `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  chevRight: `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  chevDown: `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  arrowRight: `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7h10M8 3l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  people: `<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><circle cx="7.5" cy="6" r="3" fill="currentColor" opacity=".9"/><path d="M1.8 16.5c.6-3.2 2.9-5 5.7-5s5.1 1.8 5.7 5" fill="currentColor" opacity=".9"/><circle cx="14" cy="7" r="2.3" fill="currentColor" opacity=".55"/><path d="M13.6 11.2c2.4.1 4.2 1.7 4.7 4.6h-4" fill="currentColor" opacity=".55"/></svg>`,
  clock: `<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 5.8V10l2.8 1.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  cadeado: `<svg width="9" height="9" viewBox="0 0 12 12" aria-hidden="true"><rect x="2" y="5.2" width="8" height="5.8" rx="1.3" fill="currentColor"/><path d="M4 5.4V3.9a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`,
};

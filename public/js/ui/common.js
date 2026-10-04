import { esc, iniciais, pct } from '../format.js';

// Fotos que falharam não são pedidas de novo (evita piscar a cada atualização).
const fotosQuebradas = new Set();
window.__fotoFalhou = (img) => {
  fotosQuebradas.add(img.getAttribute('src'));
  img.remove();
};

export function avatar(c, cls = '') {
  const foto = c.foto && !fotosQuebradas.has(c.foto) ? c.foto : null;
  return `<div class="avatar ${cls}" style="--c:${c.cor}">
    <div class="avatar__inner"><span>${esc(iniciais(c.nome))}</span>${
      foto ? `<img src="${esc(foto)}" alt="" loading="lazy" decoding="async" onerror="__fotoFalhou(this)">` : ''
    }</div></div>`;
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
    <span class="donut__label" style="font-size:${labelSize}px">${pct(v)}</span>
  </div>`;
}

export const ICON = {
  chevRight: `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  chevDown: `<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  arrowRight: `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7h10M8 3l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  people: `<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><circle cx="7.5" cy="6" r="3" fill="currentColor" opacity=".9"/><path d="M1.8 16.5c.6-3.2 2.9-5 5.7-5s5.1 1.8 5.7 5" fill="currentColor" opacity=".9"/><circle cx="14" cy="7" r="2.3" fill="currentColor" opacity=".55"/><path d="M13.6 11.2c2.4.1 4.2 1.7 4.7 4.6h-4" fill="currentColor" opacity=".55"/></svg>`,
  clock: `<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 5.8V10l2.8 1.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

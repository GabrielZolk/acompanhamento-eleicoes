// Mapa coroplético por UF: um único tom (azul claro -> escuro), escala sequencial neutra.
import { esc, mix } from '../format.js';
import { UF_BY_CODE } from '../ufs.js';
import { fmtValor, rotuloPeriodo, detectarPeriodicidade } from './serie.js';

const CLARO = '#c9d6ff';
const ESCURO = '#1f3a9e';

let geoPromessa = null;
export function carregarGeo() {
  if (!geoPromessa) {
    geoPromessa = fetch('/data/brasil-uf.json')
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return geoPromessa;
}

// Último valor de cada UF no período mais recente comum a todas (ou o mais recente de cada uma).
export function valoresRecentes(porUF) {
  const ufs = Object.keys(porUF || {});
  const ultimos = ufs.map((uf) => porUF[uf]?.at?.(-1)?.[0]).filter(Boolean).sort();
  const periodo = ultimos[0] || null; // o mais antigo dos "últimos" = comum a todas
  const valores = {};
  for (const uf of ufs) {
    const s = porUF[uf] || [];
    const p = s.find((q) => q[0] === periodo) || s.at(-1);
    if (p && Number.isFinite(p[1])) valores[uf] = { v: p[1], periodo: p[0] };
  }
  return { valores, periodo };
}

export function htmlMapa(geo, porUF, ind, ufSel) {
  if (!geo?.states) return `<p class="vazio">Mapa indisponível.</p>`;
  const { valores, periodo } = valoresRecentes(porUF);
  const vs = Object.values(valores).map((x) => x.v);
  if (!vs.length) return `<p class="vazio">Sem dados por UF.</p>`;
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const cor = (v) => mix(CLARO, ESCURO, hi === lo ? 0.5 : (v - lo) / (hi - lo));
  const per = periodo ? rotuloPeriodo(periodo, detectarPeriodicidade(Object.values(porUF)[0])) : '';

  let paths = '';
  for (const [uf, s] of Object.entries(geo.states)) {
    const val = valores[uf];
    const nome = UF_BY_CODE[uf]?.nome || uf.toUpperCase();
    const rot = `${nome}: ${val ? fmtValor(val.v, ind) : 'sem dado'}`;
    paths += `<path class="umapa__uf${uf === ufSel ? ' is-sel' : ''}" d="${s.d}" data-uf="${uf}" fill="${val ? cor(val.v) : '#1b2230'}" tabindex="0" role="button" aria-label="${esc(rot)}"><title>${esc(rot)}</title></path>`;
  }
  // Estado selecionado redesenhado por cima para o contorno não ficar escondido.
  const sel = ufSel && geo.states[ufSel] ? `<path class="umapa__contorno" d="${geo.states[ufSel].d}"/>` : '';

  return `<div class="umapa">
    <svg class="umapa__svg" viewBox="0 0 ${geo.w} ${geo.h}" role="group" aria-label="Mapa: ${esc(ind.curto || ind.titulo)} por UF, ${esc(per)}">${paths}${sel}</svg>
    <div class="umapa__leg">
      <span>${esc(fmtValor(lo, ind))}</span>
      <i style="background:linear-gradient(90deg, ${CLARO}, ${ESCURO})"></i>
      <span>${esc(fmtValor(hi, ind))}</span>
    </div>
    <p class="umapa__nota">Último dado por UF: ${esc(per)}. Clique em um estado para ver a série.</p>
  </div>`;
}

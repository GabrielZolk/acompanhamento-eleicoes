// Comparação direta entre os dois últimos governos (Bolsonaro 2019–2022 × Lula 2023–hoje):
// cartões lado a lado, com o sentido de cada indicador ("quanto menor, melhor") e o selo de
// qual governo teve o melhor resultado. A regra de cada indicador é fixa e aparece no cartão.
import { esc } from '../format.js';
import { CORES_PARTIDO } from '../colors.js';
import { fmtValor, fmtVariacao, rotuloPeriodo, mandatoDoPonto } from './serie.js';

// Os dois governos comparados (ids de indice.json → mandatos), com as cores dos partidos no painel.
export const DUELO = [
  { id: 'bolsonaro', nome: 'Jair Bolsonaro', curto: 'Bolsonaro', cor: CORES_PARTIDO.PL },
  { id: 'lula3', nome: 'Lula', curto: 'Lula', cor: CORES_PARTIDO.PT },
];

// melhor: sentido em que o indicador é considerado melhor para a população.
// criterio: "media" = média dos valores no mandato; "variacao" = fim − início (indicadores de
// estoque, como a dívida, em que o nível médio esconde se ela subiu ou caiu).
// aviso: ressalva curta que aparece no cartão.
export const REGRAS = {
  ipca: { melhor: 'menor', criterio: 'media' },
  desemprego: { melhor: 'menor', criterio: 'media' },
  renda: { melhor: 'maior', criterio: 'media' },
  pib: { melhor: 'maior', criterio: 'media', aviso: 'Bolsonaro inclui 2020, ano da pandemia.' },
  salario: { melhor: 'maior', criterio: 'media' },
  selic: { melhor: 'menor', criterio: 'media', aviso: 'Juros menores barateiam o crédito. A Selic é definida pelo Banco Central, autônomo desde 2021.' },
  dolar: { melhor: 'menor', criterio: 'media', aviso: 'Dólar mais baixo barateia importados, combustível e viagens.' },
  divida: { melhor: 'menor', criterio: 'variacao', aviso: 'Dívida é estoque: compara-se quanto subiu ou caiu durante o mandato.' },
};
const regra = (ind) => REGRAS[ind.id] || { melhor: 'menor', criterio: 'media' };

// Diferença mínima para declarar um governo melhor: 3% do valor (média) ou 1 ponto (variação).
const EMPATE_REL = 0.03, EMPATE_ABS = 1;

export function mandatosDuelo(mandatos) {
  return DUELO.map((g) => {
    const m = mandatos.find((x) => x.id === g.id);
    return m ? { ...m, ...g, nome: m.nome, curtoGov: g.curto, nomeGov: g.nome } : null;
  }).filter(Boolean);
}

// Valor de cada governo segundo o critério do indicador e o vencedor (índice 0/1 ou null = empate).
export function compararIndicador(ind, pts, mandatos) {
  const gov = mandatosDuelo(mandatos);
  if (gov.length < 2) return null;
  const r = regra(ind);
  const lados = gov.map((m) => {
    const dentro = pts.filter((p) => mandatoDoPonto(p, mandatos)?.id === m.id);
    if (!dentro.length) return null;
    const ini = dentro[0], fim = dentro[dentro.length - 1];
    const media = dentro.reduce((s, p) => s + p.v, 0) / dentro.length;
    const valor = r.criterio === 'variacao' ? fim.v - ini.v : media;
    return { m, dentro, ini, fim, media, valor };
  });
  if (lados.some((l) => !l)) return null;
  const [a, b] = lados;
  const dif = r.melhor === 'menor' ? b.valor - a.valor : a.valor - b.valor; // > 0: Bolsonaro melhor
  const limite = r.criterio === 'variacao' ? EMPATE_ABS : EMPATE_REL * Math.max(Math.abs(a.valor), Math.abs(b.valor));
  const vencedor = Math.abs(dif) < limite ? null : dif > 0 ? 0 : 1;
  return { regra: r, lados, vencedor };
}

const ICONE = {
  menor: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8M2.5 6.5 6 10l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  maior: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10V2M2.5 5.5 6 2l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trofeu: '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" fill="currentColor"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v3M8.5 20h7M10 17h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  igual: '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5h8M3 9h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
};

export const seloSentido = (ind) => {
  const r = regra(ind);
  return `<span class="sentido sentido--${r.melhor}">${ICONE[r.melhor]}Quanto ${r.melhor}, melhor</span>`;
};

function seloVencedor(cmp) {
  if (cmp.vencedor == null) return `<span class="selo selo--igual">${ICONE.igual}Praticamente igual</span>`;
  const m = cmp.lados[cmp.vencedor].m;
  return `<span class="selo" style="--c:${m.cor}">${ICONE.trofeu}Melhor no governo ${esc(m.curtoGov)}</span>`;
}

// Número que conta até o valor quando o cartão aparece (ver animarNumeros).
function numero(v, ind, sinal) {
  const txt = sinal ? fmtVariacao(0, v, ind) : fmtValor(v, ind);
  return `<span class="conta" data-v="${v}"${sinal ? ' data-sinal="1"' : ''}>${esc(txt)}</span>`;
}

function anos(m, lado) {
  const a = m.inicio.slice(0, 4);
  return m.fim ? `${a}–${m.fim.slice(0, 4)}` : `${a}–hoje`;
}

function htmlLado(l, i, cmp, ind, periodicidade) {
  const variacao = cmp.regra.criterio === 'variacao';
  const vence = cmp.vencedor === i;
  const rot = variacao ? 'variação no mandato' : 'média no mandato';
  return `<div class="lado${vence ? ' lado--vence' : ''}" style="--c:${l.m.cor}">
      <div class="lado__nome"><i></i>${esc(l.m.curtoGov)} <small>${anos(l.m)}</small></div>
      <div class="lado__valor">${numero(l.valor, ind, variacao)}</div>
      <div class="lado__rot">${rot}</div>
      <div class="lado__ext">${esc(fmtValor(l.ini.v, ind))} <span aria-hidden="true">→</span> ${esc(fmtValor(l.fim.v, ind))}<small>${esc(rotuloPeriodo(l.ini.periodo, periodicidade))} a ${esc(rotuloPeriodo(l.fim.periodo, periodicidade))}</small></div>
    </div>`;
}

// Minigráfico dos dois mandatos na mesma escala, cada um na cor do seu governo, com a média tracejada.
function graficoDuelo(cmp, ind) {
  const W = 320, H = 86, pt = 8, pb = 6;
  const todos = cmp.lados.flatMap((l) => l.dentro);
  const t0 = todos[0].ini, t1 = todos[todos.length - 1].fim;
  let lo = Infinity, hi = -Infinity;
  for (const p of todos) { lo = Math.min(lo, p.v); hi = Math.max(hi, p.v); }
  const folga = (hi - lo) * 0.08 || 1;
  lo -= folga; hi += folga;
  const x = (t) => ((t - t0) / (t1 - t0)) * W;
  const y = (v) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  let svg = `<svg class="duelo__svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">`;
  if (lo < 0 && hi > 0) svg += `<line class="spark__zero" x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" vector-effect="non-scaling-stroke"/>`;
  cmp.lados.forEach((l, i) => {
    const xa = x(Math.max(l.m.t0, t0)), xb = x(Math.min(l.m.t1, t1));
    const ps = l.dentro;
    const d = ps.map((p, k) => `${k ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join('');
    const base = y(lo);
    svg += `<rect x="${xa.toFixed(1)}" y="0" width="${(xb - xa).toFixed(1)}" height="${H}" fill="${l.m.cor}" fill-opacity=".07"/>`;
    svg += `<path d="${d}L${x(ps[ps.length - 1].t).toFixed(1)} ${base}L${x(ps[0].t).toFixed(1)} ${base}Z" fill="${l.m.cor}" fill-opacity=".14"/>`;
    if (cmp.regra.criterio === 'media') {
      svg += `<line class="duelo__media" x1="${xa.toFixed(1)}" x2="${xb.toFixed(1)}" y1="${y(l.media).toFixed(1)}" y2="${y(l.media).toFixed(1)}" stroke="${l.m.cor}" vector-effect="non-scaling-stroke"/>`;
    }
    svg += `<path class="duelo__linha" style="--d:${0.15 + i * 0.55}s" d="${d}" stroke="${l.m.cor}" pathLength="1" vector-effect="non-scaling-stroke"/>`;
  });
  return svg + '</svg>';
}

// Cartão de um indicador. compacto = grade (abre o detalhe ao clicar); senão, bloco do detalhe.
export function htmlDuelo(ind, pts, mandatos, periodicidade, { compacto = true } = {}) {
  const cmp = compararIndicador(ind, pts, mandatos);
  if (!cmp) return '';
  const r = cmp.regra;
  const venc = cmp.vencedor == null ? null : cmp.lados[cmp.vencedor].m;
  const resumo = `${ind.titulo}: ${cmp.lados.map((l) => `${l.m.curtoGov} ${r.criterio === 'variacao' ? fmtVariacao(0, l.valor, ind) : fmtValor(l.valor, ind)}`).join(', ')}. Quanto ${r.melhor}, melhor. ${venc ? `Melhor no governo ${venc.curtoGov}.` : 'Praticamente igual.'}`;
  const tag = compacto ? 'button' : 'div';
  return `<${tag} ${compacto ? 'type="button" ' : ''}class="duelo${compacto ? '' : ' duelo--det'}" data-id="${esc(ind.id)}"${venc ? ` style="--v:${venc.cor}"` : ''}${compacto ? ` aria-label="${esc(resumo)} Abrir detalhes"` : ''}>
      <div class="duelo__topo">
        <h2 class="duelo__titulo">${compacto ? esc(ind.curto || ind.titulo) : 'Bolsonaro × Lula'}</h2>
        ${seloSentido(ind)}
      </div>
      <div class="duelo__lados">
        ${htmlLado(cmp.lados[0], 0, cmp, ind, periodicidade)}
        <span class="duelo__vs" aria-hidden="true">vs</span>
        ${htmlLado(cmp.lados[1], 1, cmp, ind, periodicidade)}
      </div>
      <div class="duelo__graf">${graficoDuelo(cmp, ind)}</div>
      <div class="duelo__pe">
        ${seloVencedor(cmp)}
        ${compacto ? '<span class="duelo__mais">Ver detalhes <span aria-hidden="true">→</span></span>' : ''}
      </div>
      ${r.aviso ? `<p class="duelo__aviso">${esc(r.aviso)}</p>` : ''}
    </${tag}>`;
}

// Cabeçalho da comparação: os dois governos frente a frente.
export function htmlPlacar(mandatos, ultimoDado) {
  const [a, b] = mandatosDuelo(mandatos);
  if (!a || !b) return '';
  const cab = (m, extra) => `<div class="frente" style="--c:${m.cor}">
      <span class="frente__ini">${esc(m.curtoGov.slice(0, 1))}</span>
      <span class="frente__txt"><b>${esc(m.nomeGov)}</b><small>${anos(m)}${extra}</small></span>
    </div>`;
  return `<div class="placar">
      ${cab(a, '')}
      <span class="placar__vs">VS</span>
      ${cab(b, ultimoDado ? ` · dados até ${esc(ultimoDado)}` : '')}
    </div>`;
}

// Contagem animada dos números quando entram na tela (uma vez por elemento).
let observador = null;
export function animarNumeros(raiz, ind, reduzir) {
  const els = raiz.querySelectorAll('.conta:not([data-ok])');
  if (reduzir || !('IntersectionObserver' in window)) return;
  observador ||= new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      observador.unobserve(e.target);
      contar(e.target);
    }
  }, { threshold: 0.4 });
  els.forEach((el) => {
    el.dataset.ok = '1';
    el._ind = typeof ind === 'function' ? ind(el) : ind;
    el._txt = el.textContent;
    observador.observe(el);
  });
}

function contar(el) {
  const alvo = Number(el.dataset.v), ind = el._ind, sinal = el.dataset.sinal;
  if (!ind || !Number.isFinite(alvo)) return;
  const dur = 1100, t0 = performance.now();
  const passo = (agora) => {
    const k = Math.min(1, (agora - t0) / dur);
    const v = alvo * (1 - (1 - k) ** 3);
    el.textContent = k < 1 ? (sinal ? fmtVariacao(0, v, ind) : fmtValor(v, ind)) : el._txt;
    if (k < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

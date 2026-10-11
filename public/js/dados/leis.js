// Aba "Leis e programas": o que cada governo aprovou, lançou ou encerrou, lado a lado, com a norma
// e a fonte oficial de cada item (data/indicadores/leis.json, levantamento curado).
import { esc } from '../format.js';
import { DUELO } from './comparar.js';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const dataCurta = (s) => {
  const [a, m] = (s || '').split('-').map(Number);
  return a ? `${MESES[(m || 1) - 1]}/${a}` : '';
};

function cartao(it, i) {
  return `<article class="lei" style="animation-delay:${Math.min(i, 20) * 0.03}s">
      <div class="lei__topo"><span class="lei__area">${esc(it.area || '')}</span><span class="lei__data">${esc(dataCurta(it.data))}</span></div>
      <h3 class="lei__titulo">${esc(it.titulo)}</h3>
      <p class="lei__txt">${esc(it.oQueFaz || '')}</p>
      ${it.alcance ? `<p class="lei__alcance">${esc(it.alcance)}</p>` : ''}
      ${it.nota ? `<p class="lei__nota">${esc(it.nota)}</p>` : ''}
      <div class="lei__pe">
        ${it.origem && it.origem !== 'governo' ? `<span class="tx__chip">origem: ${esc(it.origem)}</span>` : ''}
        ${it.fonteUrl ? `<a href="${esc(it.fonteUrl)}" target="_blank" rel="noopener noreferrer">${esc(it.norma || 'Fonte')}</a>` : esc(it.norma || '')}
      </div>
    </article>`;
}

// area: "" = todas
export function htmlLeis(dados, area = '') {
  const itens = (dados?.itens || []).slice().sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  if (!itens.length) return '<p class="vazio">Levantamento de leis e programas indisponível no momento.</p>';
  const areas = [...new Set(itens.map((i) => i.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const chip = (v, txt) => `<button type="button" data-area="${esc(v)}" aria-pressed="${area === v}">${esc(txt)}</button>`;
  const colunas = DUELO.map((g) => {
    const lista = itens.filter((i) => i.governo === g.id && (!area || i.area === area));
    return `<div class="tx-col" style="--c:${g.cor}">
        <h3 class="tx-col__titulo"><i></i>Governo ${esc(g.curto)} <small>${lista.length} itens</small></h3>
        ${lista.map(cartao).join('') || '<p class="vazio">Nenhum item nesta área.</p>'}
      </div>`;
  }).join('');
  return `<div class="lei-areas" role="group" aria-label="Filtrar por área">${chip('', 'Todas')}${areas.map((a) => chip(a, a)).join('')}</div>
    <div class="tx-cols">${colunas}</div>
    <p class="tab__nota">${esc(dados.criterio || '')} Levantamento atualizado em ${esc(dataCurta(dados.atualizadoEm))}.</p>`;
}

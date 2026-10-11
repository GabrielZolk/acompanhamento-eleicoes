// Aba "Impostos": placar de medidas federais que subiram ou baixaram tributos em cada governo,
// os indicadores de impostos e contas públicas lado a lado e a lista de medidas, com a norma e a
// fonte oficial de cada uma (data/indicadores/impostos.json, levantamento curado).
import { esc } from '../format.js';
import { DUELO } from './comparar.js';

const SOBE = new Set(['aumento', 'criacao']);
const DESCE = new Set(['reducao', 'extincao']);
const ROTULO_TIPO = { aumento: 'Imposto maior', criacao: 'Imposto novo', reducao: 'Imposto menor', extincao: 'Imposto extinto', misto: 'Misto' };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const dataCurta = (s) => {
  const [a, m, d] = (s || '').split('-').map(Number);
  return a ? `${d ? `${d} ` : ''}${MESES[(m || 1) - 1]}/${a}` : '';
};
const bi = (v) => `R$ ${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} bi`;

function placar(medidas) {
  return DUELO.map((g) => {
    const ms = medidas.filter((m) => m.governo === g.id);
    const sobe = ms.filter((m) => SOBE.has(m.tipo));
    const desce = ms.filter((m) => DESCE.has(m.tipo));
    const misto = ms.filter((m) => m.tipo === 'misto');
    const soma = (lista) => lista.reduce((s, m) => s + (Number.isFinite(m.impactoBiAno) ? m.impactoBiAno : 0), 0);
    const comImpacto = ms.filter((m) => Number.isFinite(m.impactoBiAno)).length;
    return `<div class="tx-placar__gov" style="--c:${g.cor}">
        <div class="tx-placar__nome"><i></i>${esc(g.curto)}</div>
        <div class="tx-placar__nums">
          <div class="tx-num tx-num--sobe"><b>${sobe.length}</b><span>subiram ou criaram imposto</span>${sobe.length && soma(sobe) ? `<small>+${bi(soma(sobe))}/ano estimados</small>` : ''}</div>
          <div class="tx-num tx-num--desce"><b>${desce.length}</b><span>baixaram ou zeraram imposto</span>${desce.length && soma(desce) ? `<small>−${bi(soma(desce))}/ano estimados</small>` : ''}</div>
          ${misto.length ? `<div class="tx-num"><b>${misto.length}</b><span>mistas (sobe para uns, cai para outros)</span></div>` : ''}
        </div>
        <p class="tx-placar__nota">${ms.length} medidas no levantamento; estimativa oficial de impacto disponível para ${comImpacto}.</p>
      </div>`;
  }).join('<span class="placar__vs">VS</span>');
}

function cartaoMedida(m, i) {
  const dir = SOBE.has(m.tipo) ? 'sobe' : DESCE.has(m.tipo) ? 'desce' : 'misto';
  const impacto = Number.isFinite(m.impactoBiAno) && m.impactoBiAno !== 0
    ? `<span class="tx-imp tx-imp--${m.impactoBiAno > 0 ? 'sobe' : 'desce'}">${m.impactoBiAno > 0 ? '+' : '−'}${bi(m.impactoBiAno)}/ano${m.impactoNota ? ` <small>(${esc(m.impactoNota)})</small>` : ''}</span>`
    : '';
  return `<article class="tx tx--${dir}" style="animation-delay:${Math.min(i, 20) * 0.03}s">
      <div class="tx__topo">
        <span class="tx__tipo">${dir === 'sobe' ? '▲' : dir === 'desce' ? '▼' : '◆'} ${esc(ROTULO_TIPO[m.tipo] || m.tipo)}</span>
        <span class="tx__tributo">${esc(m.tributo || '')}</span>
        <span class="tx__data">${esc(dataCurta(m.data))}</span>
      </div>
      <h3 class="tx__titulo">${esc(m.titulo)}</h3>
      <p class="tx__resumo">${esc(m.resumo || '')}</p>
      <div class="tx__meta">
        ${impacto}
        ${m.temporaria ? '<span class="tx__chip">temporária</span>' : ''}
        ${m.vigencia ? `<span class="tx__chip">${esc(m.vigencia)}</span>` : ''}
        ${m.origem && m.origem !== 'governo' ? `<span class="tx__chip">origem: ${esc(m.origem)}</span>` : ''}
      </div>
      <div class="tx__fonte">${m.fonteUrl ? `<a href="${esc(m.fonteUrl)}" target="_blank" rel="noopener noreferrer">${esc(m.norma || 'Fonte')}</a>` : esc(m.norma || '')}${m.fonte2Url ? ` · <a href="${esc(m.fonte2Url)}" target="_blank" rel="noopener noreferrer">outra fonte</a>` : ''}</div>
    </article>`;
}

// filtro: "todos" | "sobe" | "desce"
export function htmlImpostos(dados, cartoesIndicadores, filtro = 'todos') {
  const medidas = (dados?.medidas || []).slice().sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  const passa = (m) => filtro === 'todos' || (filtro === 'sobe' ? SOBE.has(m.tipo) : DESCE.has(m.tipo));
  const colunas = DUELO.map((g) => {
    const lista = medidas.filter((m) => m.governo === g.id && passa(m));
    return `<div class="tx-col" style="--c:${g.cor}">
        <h3 class="tx-col__titulo"><i></i>Governo ${esc(g.curto)} <small>${lista.length} medidas</small></h3>
        ${lista.map(cartaoMedida).join('') || '<p class="vazio">Nenhuma medida neste filtro.</p>'}
      </div>`;
  }).join('');
  const filtroBtn = (v, txt) => `<button type="button" data-tx="${v}" aria-pressed="${filtro === v}">${txt}</button>`;
  return `${medidas.length ? `<section class="tx-placar" aria-label="Placar de medidas sobre impostos">${placar(medidas)}</section>` : ''}
    ${cartoesIndicadores ? `<h2 class="tema">Carga de impostos e contas do governo</h2><div class="duelos">${cartoesIndicadores}</div>` : ''}
    ${medidas.length ? `<h2 class="tema">Medida por medida</h2>
      <div class="tx-ctrl"><div class="seg" role="group" aria-label="Filtrar medidas">${filtroBtn('todos', 'Todas')}${filtroBtn('sobe', '▲ Subiram imposto')}${filtroBtn('desce', '▼ Baixaram imposto')}</div></div>
      <div class="tx-cols">${colunas}</div>
      <p class="tab__nota">${esc(dados.criterio || '')}${dados.observacoes?.length ? ' ' + dados.observacoes.map(esc).join(' ') : ''} Contar medidas não mede o peso de cada uma: veja o impacto estimado quando houver. Levantamento atualizado em ${esc(dataCurta(dados.atualizadoEm))}.</p>` : '<p class="vazio">Levantamento de medidas indisponível no momento.</p>'}`;
}

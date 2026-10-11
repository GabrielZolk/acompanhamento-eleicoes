// Abas sobre a disputa de 2026: "Checagens" (boatos checados por agências ou derrubados pelo TSE,
// separados por quem eles atingem, com a mesma regra para os dois candidatos) e "Propostas" (os
// planos de governo registrados no TSE, lado a lado por tema). Também a linha do tempo "Quem criou
// cada programa", que fica na aba de leis. Dados: checagens.json, propostas.json, origens.json.
import { esc } from '../format.js';
import { CORES_PARTIDO } from '../colors.js';

export const CANDIDATOS = [
  { id: 'flavio', nome: 'Flávio Bolsonaro', curto: 'Flávio', partido: 'PL', cor: CORES_PARTIDO.PL },
  { id: 'lula', nome: 'Lula', curto: 'Lula', partido: 'PT', cor: CORES_PARTIDO.PT },
];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const dia = (s) => {
  const [a, m, d] = (s || '').split('-').map(Number);
  return a ? `${d ? `${d}/` : ''}${MESES[(m || 1) - 1]}${d ? '' : `/${a}`}` : '';
};
const link = (url, txt) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(txt)}</a>` : esc(txt));

// ------------------------------------------------------------------ Checagens
const VEREDITO = {
  falso: ['Falso', '#ef4444'],
  enganoso: ['Enganoso', '#f97316'],
  'sem contexto': ['Sem contexto', '#eab308'],
  verdadeiro: ['Verdadeiro', '#22c55e'],
  'removido pelo TSE': ['Removido pelo TSE', '#a855f7'],
};

function cartaoChecagem(it, i) {
  const [rot, cor] = VEREDITO[it.veredito] || [it.veredito, '#8a93a6'];
  return `<article class="ck" style="--v:${cor};animation-delay:${Math.min(i, 20) * 0.03}s">
      <div class="ck__topo"><span class="ck__ver">${esc(rot)}</span><span class="tx__data">${esc(dia(it.data))}</span></div>
      <p class="ck__alegacao">“${esc(it.alegacao)}”</p>
      <p class="ck__exp">${esc(it.explicacao || '')}</p>
      ${it.origem ? `<p class="ck__origem">Origem apontada pela checagem: ${esc(it.origem)}</p>` : ''}
      <div class="lei__pe">${(it.checadores || []).map((c) => link(c.url, c.nome)).join(' · ')}${it.tse ? ` · ${link(it.tse.url, `TSE: ${it.tse.decisao}`)}` : ''}</div>
    </article>`;
}

export function htmlChecagens(dados) {
  const itens = (dados?.itens || []).slice().sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  if (!itens.length) return '<p class="vazio">Levantamento de checagens indisponível no momento.</p>';
  const contra = (id) => itens.filter((i) => i.alvo === id || i.alvo === 'ambos');
  const processo = itens.filter((i) => i.alvo === 'processo eleitoral');
  const contagem = (lista) => Object.entries(VEREDITO).map(([k, [rot, cor]]) => {
    const n = lista.filter((i) => i.veredito === k).length;
    return n ? `<span class="ck__n" style="--v:${cor}">${n} ${esc(rot.toLowerCase())}</span>` : '';
  }).join('');
  const resumo = `<section class="resumo" aria-label="Resumo das checagens">
      <div class="resumo__placar">
        <div class="resumo__rot">Boatos checados contra cada candidato</div>
        <div class="resumo__nums">
          ${CANDIDATOS.map((c) => `<div class="rnum" style="--c:${c.cor}"><b>${contra(c.id).length}</b><span>${esc(c.curto)}</span><small>alvo</small></div>`).join('<span class="rvs">×</span>')}
          ${processo.length ? `<div class="rnum rnum--neutro"><b>${processo.length}</b><span>sobre urna e votação</span></div>` : ''}
        </div>
      </div>
      <ul class="resumo__topicos">
        ${CANDIDATOS.map((c) => `<li><b style="color:${c.cor}">Contra ${esc(c.nome)}:</b> ${contagem(contra(c.id)) || 'nenhum no levantamento'}</li>`).join('')}
        ${processo.length ? `<li><b>Sobre urna e votação:</b> ${contagem(processo)}</li>` : ''}
        <li>Separados por <b>quem o boato atinge</b>, não por quem espalhou (a origem aparece quando a checagem a identifica).</li>
      </ul>
      <p class="resumo__nota">${esc(dados.criterio || '')} ${esc(dados.metodo || '')}</p>
    </section>`;
  const coluna = (c) => `<div class="tx-col" style="--c:${c.cor}">
      <h3 class="tx-col__titulo"><i></i>Contra ${esc(c.nome)} <small>${contra(c.id).length} itens</small></h3>
      ${contra(c.id).map(cartaoChecagem).join('') || '<p class="vazio">Nenhum item no levantamento.</p>'}
    </div>`;
  return `${resumo}
    <div class="tx-cols">${CANDIDATOS.map(coluna).join('')}</div>
    ${processo.length ? `<h2 class="tema">Sobre a urna e a votação</h2><div class="ck-grade">${processo.map(cartaoChecagem).join('')}</div>` : ''}
    <p class="tab__nota">Levantamento atualizado em ${esc(dia(dados.atualizadoEm))}/${esc((dados.atualizadoEm || '').slice(0, 4))}. Cada item tem o link da checagem original.</p>`;
}

// ------------------------------------------------------------------ Propostas
export function htmlPropostas(dados) {
  const temas = dados?.temas || [];
  if (!temas.length) return '<p class="vazio">Planos de governo indisponíveis no momento.</p>';
  const fontes = dados.fontes || {};
  const resumo = `<section class="resumo" aria-label="Sobre os planos">
      <div class="resumo__placar">
        <div class="resumo__rot">Planos registrados no TSE</div>
        <div class="resumo__nums">${CANDIDATOS.map((c) => `<div class="rnum" style="--c:${c.cor}"><b>${temas.filter((t) => (t[c.id] || []).length && !/não trata/i.test((t[c.id] || [])[0] || '')).length}</b><span>${esc(c.curto)}</span><small>temas com proposta</small></div>`).join('<span class="rvs">×</span>')}</div>
      </div>
      <ul class="resumo__topicos">
        ${CANDIDATOS.map((c) => `<li><b style="color:${c.cor}">${esc(c.nome)} (${esc(c.partido)}):</b> ${link(fontes[c.id]?.url, fontes[c.id]?.titulo || 'plano de governo')}${fontes[c.id]?.paginas ? ` · ${fontes[c.id].paginas} páginas` : ''}</li>`).join('')}
        <li>Resumo por tema, com a página do PDF original. Quando um plano não trata do tema, está escrito.</li>
      </ul>
    </section>`;
  const linhas = temas.map((t) => `<div class="pp">
      <h3 class="pp__tema">${esc(t.tema)}</h3>
      <div class="pp__cols">${CANDIDATOS.map((c) => `<div class="pp__col" style="--c:${c.cor}">
          <div class="pp__nome"><i></i>${esc(c.curto)}${t.paginas?.[c.id] ? ` <small>${esc(t.paginas[c.id])}</small>` : ''}</div>
          <ul>${(t[c.id] || []).map((p) => `<li>${esc(p)}</li>`).join('') || '<li class="vazio">—</li>'}</ul>
        </div>`).join('')}</div>
    </div>`).join('');
  return `${resumo}${linhas}<p class="tab__nota">${(dados.notas || []).map(esc).join(' ')}</p>`;
}

// ------------------------------------------------------------------ Quem criou cada programa
const COR_GOV = { 'Lula 1': CORES_PARTIDO.PT, 'Lula 2': CORES_PARTIDO.PT, 'Lula 3': CORES_PARTIDO.PT, 'Dilma 1': CORES_PARTIDO.PT, 'Dilma 2': CORES_PARTIDO.PT, Bolsonaro: CORES_PARTIDO.PL, Temer: '#2fbf71', 'FHC 1': '#60a5fa', 'FHC 2': '#60a5fa', Itamar: '#a3a3a3', Collor: '#a3a3a3', Sarney: '#a3a3a3' };

export function htmlOrigens(dados) {
  const progs = dados?.programas || [];
  if (!progs.length) return '';
  return `<h2 class="tema">Quem criou cada programa</h2>
    <p class="intro__txt">Criação, mudanças, novos nomes e fim de programas conhecidos, de todos os governos desde 1988. Muitos passaram por vários presidentes.</p>
    <div class="og">${progs.map((p) => `<details class="og__prog">
        <summary><b>${esc(p.nome)}</b><span class="og__chips">${(p.eventos || []).map((e) => `<i style="--c:${COR_GOV[e.governo] || '#8a93a6'}" title="${esc(`${e.governo}: ${e.tipo}`)}">${esc(e.governo)}</i>`).join('')}</span></summary>
        <ol class="og__ev">${(p.eventos || []).map((e) => `<li style="--c:${COR_GOV[e.governo] || '#8a93a6'}"><span class="og__quando">${esc((e.data || '').slice(0, 4))} · ${esc(e.governo)} · ${esc(e.tipo)}</span>${esc(e.texto)}${e.norma ? ` <span class="og__norma">${link(e.url, e.norma)}</span>` : ''}</li>`).join('')}</ol>
      </details>`).join('')}</div>
    <p class="tab__nota">${esc(dados.criterio || '')}</p>`;
}

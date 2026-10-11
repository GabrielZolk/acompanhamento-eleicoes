// Aba "Processos": situação judicial oficial de cada processo ou investigação envolvendo Lula,
// Flávio Bolsonaro e Jair Bolsonaro, e os grandes casos de corrupção e fraude desde 2003, com o
// período dos fatos. Regra fixa, igual para todos (processos.json); nada de manchete escolhida.
import { esc } from '../format.js';
import { CORES_PARTIDO } from '../colors.js';

const PESSOAS = [
  { nome: 'Lula', cor: CORES_PARTIDO.PT },
  { nome: 'Flávio Bolsonaro', cor: CORES_PARTIDO.PL },
  { nome: 'Jair Bolsonaro', cor: CORES_PARTIDO.PL },
];
const COR_GOV = { Lula: CORES_PARTIDO.PT, Dilma: CORES_PARTIDO.PT, Bolsonaro: CORES_PARTIDO.PL, Temer: '#2fbf71', FHC: '#60a5fa' };
const corGov = (g) => COR_GOV[Object.keys(COR_GOV).find((k) => g.startsWith(k))] || '#8a93a6';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const quando = (s) => {
  const [a, m, d] = (s || '').split('-').map(Number);
  return a ? `${d ? `${d}/` : ''}${m ? `${MESES[m - 1]}/` : ''}${a}` : '';
};
const link = (url, txt) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(txt)}</a>` : esc(txt));

// Cor da situação: condenação em vigor, em andamento, anulado/prescrito/arquivado, absolvido.
function tomSituacao(s = '') {
  const t = s.toLowerCase();
  if (/absolvi/.test(t)) return ['#22c55e', 'absolvido'];
  if (/anulad|prescri|arquivad|extint/.test(t)) return ['#a3a3a3', 'encerrado sem condenação válida'];
  if (/condena/.test(t)) return ['#ef4444', 'condenação'];
  return ['#f5b13d', 'em andamento'];
}

function cartaoPessoa(p, i) {
  const [cor] = tomSituacao(p.situacao);
  return `<details class="pr" style="--s:${cor};animation-delay:${Math.min(i, 20) * 0.03}s">
      <summary><span class="pr__caso">${esc(p.caso)}</span><span class="pr__sit">${esc(p.situacao)}</span></summary>
      <ol class="og__ev">${(p.eventos || []).map((e) => `<li style="--c:${cor}"><span class="og__quando">${esc(quando(e.data))} · ${esc(e.fase || '')}</span>${esc(e.texto || '')} ${e.fonteUrl ? `<span class="og__norma">${link(e.fonteUrl, 'fonte')}</span>` : ''}</li>`).join('')}</ol>
    </details>`;
}

export function htmlProcessos(dados) {
  const pessoas = dados?.pessoas || [];
  const casos = dados?.casos || [];
  if (!pessoas.length && !casos.length) return '<p class="vazio">Levantamento indisponível no momento.</p>';
  const porPessoa = PESSOAS.map((p) => ({ ...p, itens: pessoas.filter((x) => x.pessoa === p.nome) })).filter((p) => p.itens.length);
  const conta = (itens) => {
    const c = {};
    for (const it of itens) { const [, rot] = tomSituacao(it.situacao); c[rot] = (c[rot] || 0) + 1; }
    return Object.entries(c).map(([rot, n]) => `${n} ${rot}`).join(' · ');
  };
  const resumo = `<section class="resumo" aria-label="Resumo dos processos">
      <div class="resumo__placar">
        <div class="resumo__rot">Processos e investigações formais</div>
        <div class="resumo__nums">${porPessoa.map((p) => `<div class="rnum" style="--c:${p.cor}"><b>${p.itens.length}</b><span>${esc(p.nome)}</span></div>`).join('')}</div>
      </div>
      <ul class="resumo__topicos">
        ${porPessoa.map((p) => `<li><b style="color:${p.cor}">${esc(p.nome)}:</b> ${esc(conta(p.itens))}.</li>`).join('')}
        <li>Situação <b>oficial</b> de cada processo. Quando uma condenação foi anulada, está escrito o motivo jurídico e se o mérito voltou a ser julgado.</li>
        ${casos.length ? `<li><b>${casos.length} grandes casos</b> de corrupção e fraude desde 2003, com o período em que os fatos aconteceram (vários atravessam mais de um governo).</li>` : ''}
      </ul>
      <details class="resumo__nota"><summary>Ver o critério</summary><p>${esc(dados.criterio || '')}</p></details>
    </section>`;
  const colunas = porPessoa.map((p) => `<div class="tx-col" style="--c:${p.cor}">
      <h3 class="tx-col__titulo"><i></i>${esc(p.nome)} <small>${p.itens.length}</small></h3>
      ${p.itens.map(cartaoPessoa).join('')}
    </div>`).join('');
  const listaCasos = casos.map((c, i) => `<article class="ck pc" style="--v:#8a93a6;animation-delay:${Math.min(i, 20) * 0.03}s">
      <div class="ck__topo"><b class="pc__nome">${esc(c.caso)}</b><span class="tx__data">fatos: ${esc(c.periodoFatos || '')}</span></div>
      <div class="og__chips">${(c.governos || []).map((g) => `<i style="--c:${corGov(g)}">${esc(g)}</i>`).join('')}</div>
      ${c.dano ? `<p class="pc__dano">Dano estimado: <b>${esc(c.dano)}</b></p>` : ''}
      <p class="ck__exp">${esc(c.texto || '')}</p>
      ${c.situacao ? `<p class="ck__origem">Situação: ${esc(c.situacao)}</p>` : ''}
      <div class="lei__pe">${(c.fontes || []).map((u, k) => link(u, `fonte ${k + 1}`)).join(' · ')}</div>
    </article>`).join('');
  return `${resumo}
    ${colunas ? `<h2 class="tema">Os candidatos e o ex-presidente</h2><div class="tx-cols tx-cols--3">${colunas}</div>` : ''}
    ${listaCasos ? `<h2 class="tema">Grandes casos de corrupção e fraude</h2><div class="ck-grade">${listaCasos}</div>` : ''}
    <p class="tab__nota">Ninguém é culpado antes de decisão definitiva da Justiça. Os textos descrevem só o andamento oficial dos processos, com link para a fonte.</p>`;
}

// Avisos de virada: compara cada atualização com a anterior do mesmo cargo e avisa quando
// muda o primeiro colocado (no país e nos estados) ou, no Senado, quem está dentro das vagas.
import { esc, pct, nomeProprio } from '../format.js';
import { UF_BY_CODE } from '../ufs.js';

const MAX_VISIVEIS = 3;
const DURACAO_MS = 9000;
const MIN_APURADO = 1; // % de seções: abaixo disso a liderança ainda oscila muito
const lugar = (uf) => (uf === 'br' ? 'no Brasil' : uf === 'zz' ? 'no exterior' : `em ${UF_BY_CODE[uf]?.nome || uf.toUpperCase()}`);
const curto = (c) => nomeProprio(c.nome).split(' ').slice(0, 2).join(' ');

function comparar(onde, antes, depois, secoes, vagas = 1) {
  if (!antes?.length || !depois?.length || !(secoes?.pct >= MIN_APURADO)) return null;
  const a = antes.slice(0, vagas).map((c) => c.n).sort().join(',');
  const b = depois.slice(0, vagas).map((c) => c.n).sort().join(',');
  if (a === b || !(depois[0].votos > 0)) return null;
  if (vagas === 1) {
    const novo = depois[0];
    const antigo = depois.find((c) => c.n === antes[0].n) || antes[0];
    return { onde, novo, antigo, secoes, texto: `${curto(novo)} passa ${curto(antigo)} ${lugar(onde)}` };
  }
  const entrou = depois.slice(0, vagas).find((c) => !a.split(',').includes(c.n));
  const saiu = antes.slice(0, vagas).find((c) => !b.split(',').includes(c.n));
  if (!entrou || !saiu) return null;
  const antigo = depois.find((c) => c.n === saiu.n) || saiu;
  return { onde, novo: entrou, antigo, secoes, texto: `${curto(entrou)} entra nas vagas no lugar de ${curto(antigo)} ${lugar(onde)}` };
}

// antes/depois: payloads do mesmo cargo. Devolve a lista de viradas.
export function detectarViradas(antes, depois) {
  if (!antes || !depois || antes.cargo.key !== depois.cargo.key || depois.cargo.proporcional) return [];
  const cores = depois.cores || {};
  const nomes = Object.fromEntries((depois.nacional.candidatos || []).map((c) => [c.n, c]));
  const completar = (lista) =>
    (lista || []).map((c) => ({ ...c, nome: c.nome || nomes[c.n]?.nome || c.n, cor: c.cor || nomes[c.n]?.cor || cores[c.n] || '#94a3b8' }));
  const viradas = [];
  if (depois.cargo.federal) {
    const v = comparar('br', completar(antes.nacional.candidatos), completar(depois.nacional.candidatos), depois.nacional.secoes);
    if (v) viradas.push(v);
  }
  for (const [uf, e] of Object.entries(depois.estados)) {
    const vagas = depois.cargo.key === 'senado' ? e.vagas || 1 : 1;
    const v = comparar(uf, completar(antes.estados[uf]?.candidatos), completar(e.candidatos), e.secoes, vagas);
    if (v) viradas.push(v);
  }
  return viradas;
}

let caixa = null;
export function mostrarViradas(viradas, { cargo, onClique } = {}) {
  if (!viradas.length) return;
  if (!caixa) {
    caixa = document.createElement('div');
    caixa.className = 'avisos';
    caixa.setAttribute('aria-live', 'polite');
    document.body.appendChild(caixa);
    caixa.addEventListener('click', (ev) => {
      const t = ev.target.closest('.aviso');
      if (!t) return;
      if (!ev.target.closest('.aviso__x')) onClique?.(t.dataset.uf);
      fechar(t);
    });
  }
  for (const v of viradas.slice(0, MAX_VISIVEIS)) {
    const t = document.createElement('div');
    t.className = 'aviso';
    t.dataset.uf = v.onde;
    t.style.setProperty('--c', v.novo.cor);
    t.innerHTML = `<span class="aviso__tag">Virada${cargo ? ` · ${esc(cargo)}` : ''}</span>
      <div class="aviso__txt">${esc(v.texto)}</div>
      <div class="aviso__det"><b style="color:${v.novo.cor}">${esc(curto(v.novo))} ${pct(v.novo.pct)}</b> × <span style="color:${v.antigo.cor}">${esc(curto(v.antigo))} ${pct(v.antigo.pct)}</span> · ${pct(v.secoes.pct)} apurado</div>
      <button class="aviso__x" aria-label="Fechar">×</button>
      <i class="aviso__tempo"></i>`;
    caixa.prepend(t);
    setTimeout(() => fechar(t), DURACAO_MS);
  }
  while (caixa.children.length > MAX_VISIVEIS) caixa.lastElementChild.remove();
}

function fechar(t) {
  if (!t.isConnected || t.classList.contains('saindo')) return;
  t.classList.add('saindo');
  setTimeout(() => t.remove(), 350);
}

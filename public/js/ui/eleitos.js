// Eleitos por lugar: Presidente, governadores, Senado e deputados. Oficial (TSE) quando a
// totalização do lugar termina; antes disso, quem lidera / está dentro das vagas (provisório).
import { int, pct, esc, nomeProprio, semAcento } from '../format.js';
import { UFS, UF_BY_CODE } from '../ufs.js';
import { corPartido } from '../colors.js';
import { avatar } from './common.js';
import * as modal from './modais.js';

const ABAS = [
  ['presidente', 'Presidente'],
  ['governador', 'Governadores'],
  ['senado', 'Senado'],
  ['camara', 'Dep. federais'],
  ['assembleia', 'Dep. estaduais'],
];

const nome = (c) => nomeProprio(c.nome);
const selo = {
  eleito: '<span class="pill pill--eleito">Eleito</span>',
  turno: '<span class="pill pill--turno">2º turno</span>',
  lidera: '<span class="pill pill--dentro">Lidera · provisório</span>',
  dentro: '<span class="pill pill--dentro">Dentro · provisório</span>',
};

function pessoa(c, tipo) {
  const cor = corPartido(c.partido);
  return `<div class="el-pessoa" style="--c:${cor}">
    ${avatar({ nome: c.nome, cor, foto: c.foto }, 'avatar--sm')}
    <div class="el-pessoa__info"><div class="el-pessoa__nome">${esc(nome(c))}</div>
      <div class="el-pessoa__det">${selo[tipo] || ''}<span>${esc(c.partido)} · ${pct(c.pct)}</span></div></div>
  </div>`;
}

// Situação de uma disputa majoritária (Presidente, governador, Senado).
function majoritario(m) {
  if (m.eleitos.length) return m.eleitos.map((c) => pessoa(c, 'eleito')).join('');
  if (m.segundoTurno.length) return m.segundoTurno.map((c) => pessoa(c, 'turno')).join('');
  if (!m.lideres.length) return '<span class="el-vazio">Sem votos apurados ainda</span>';
  const n = Math.max(1, m.vagas || 1);
  return m.lideres.slice(0, n).map((c) => pessoa(c, n > 1 ? 'dentro' : 'lidera')).join('');
}

const barra = (s) => `<div class="el-apurado" title="${pct(s?.pct)} das seções apuradas"><i style="width:${(s?.pct || 0).toFixed(1)}%"></i><span>${pct(s?.pct)}</span></div>`;

function conta(estados, chave) {
  let eleitos = 0, turno = 0, apurando = 0;
  for (const e of Object.values(estados)) {
    if (chave === 'prop') {
      if (e.oficiais) eleitos++;
      else apurando++;
    } else if (e.eleitos.length) eleitos++;
    else if (e.segundoTurno.length) turno++;
    else apurando++;
  }
  return { eleitos, turno, apurando };
}

function filtra(termo, textos) {
  const t = semAcento(termo.trim());
  return !t || textos.some((x) => semAcento(x || '').includes(t));
}

function abaPresidente(d, termo) {
  const m = d.presidente;
  if (!m) return '<p class="empty">Resultado indisponível.</p>';
  const situacao = m.eleitos.length ? 'Eleito no 1º turno' : m.segundoTurno.length ? 'Haverá 2º turno' : 'Em apuração';
  return `<div class="el-resumo"><b>${situacao}</b>${m.eleitos.length || m.segundoTurno.length ? ' · oficial do TSE' : ' · resultado provisório'}</div>
    <div class="el-linha el-linha--grande">
      <span class="uf-chip">BR</span>
      <div class="el-pessoas">${majoritario(m)}</div>
      ${barra(m.secoes)}
    </div>`;
}

function abaMajoritaria(estados, termo, cargo) {
  const c = conta(estados);
  const linhas = UFS.filter((u) => estados[u.uf])
    .filter((u) => filtra(termo, [u.nome, u.uf, ...(estados[u.uf].lideres || []).concat(estados[u.uf].eleitos, estados[u.uf].segundoTurno).map((p) => p.nome)]))
    .map((u) => `<div class="el-linha"><span class="uf-chip" title="${esc(u.nome)}">${u.uf.toUpperCase()}</span><div class="el-pessoas">${majoritario(estados[u.uf])}</div>${barra(estados[u.uf].secoes)}</div>`)
    .join('');
  const total = Object.keys(estados).length;
  return `<div class="el-resumo"><b>${c.eleitos}</b> de ${total} ${cargo === 'senado' ? 'estados com senadores eleitos' : 'eleitos'}${c.turno ? ` · <b>${c.turno}</b> com 2º turno` : ''} · <b>${c.apurando}</b> em apuração</div>
    <div class="el-lista">${linhas || '<p class="empty">Nada encontrado.</p>'}</div>`;
}

function abaDeputados(estados, termo) {
  const c = conta(estados, 'prop');
  const linhas = UFS.filter((u) => estados[u.uf])
    .map((u) => {
      const e = estados[u.uf];
      const lista = e.lista.filter((p) => filtra(termo, [p.nome, p.partido, u.nome, u.uf]));
      if (termo && !lista.length) return '';
      const porPartido = {};
      for (const p of e.lista) porPartido[p.partido] = (porPartido[p.partido] || 0) + 1;
      const resumo = Object.entries(porPartido).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([sg, n]) => `${sg} ${n}`).join(' · ');
      return `<details class="el-dep" ${termo ? 'open' : ''}>
        <summary><span class="uf-chip">${u.uf.toUpperCase()}</span><span class="el-dep__t">${e.vagas} vagas · ${e.oficiais ? `<b class="el-ok">${e.oficiais} eleitos (TSE)</b>` : '<span class="el-prov">provisório</span>'}</span><span class="el-dep__p">${esc(resumo)}</span>${barra(e.secoes)}</summary>
        <div class="el-dep__lista">${lista
          .map((p) => `<div class="el-dep__item" style="--c:${corPartido(p.partido)}"><i></i><span class="el-dep__nome">${esc(nome(p))}</span><span class="el-dep__part">${esc(p.partido)}</span><span class="el-dep__votos">${int(p.votos)}</span></div>`)
          .join('')}</div>
      </details>`;
    })
    .join('');
  return `<div class="el-resumo"><b>${c.eleitos}</b> de ${Object.keys(estados).length} estados com eleitos oficiais · nos demais, quem está dentro das vagas agora (provisório)</div>
    <div class="el-lista">${linhas || '<p class="empty">Nada encontrado.</p>'}</div>`;
}

export function abrirEleitos(abaInicial = 'presidente') {
  const st = { aba: abaInicial, termo: '', dados: null };
  modal.abrir(`<h3>Eleitos</h3>
    <p class="card__sub">Oficial do TSE quando a totalização do lugar termina · antes disso, quem lidera ou está dentro das vagas (provisório)</p>
    <div class="mtabs mtabs--scroll" data-abas>${ABAS.map(([k, t]) => `<button data-aba-el="${k}" class="${k === st.aba ? 'is-active' : ''}">${t}</button>`).join('')}</div>
    <label class="cbusca__input el-busca"><svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <input type="search" data-el-busca placeholder="Buscar nome, partido ou estado" autocomplete="off" aria-label="Buscar"></label>
    <div data-el-corpo><p class="empty">Carregando…</p></div>`);
  const body = modal.corpo;
  const render = () => {
    const d = st.dados;
    if (!d) return;
    const alvo = body.querySelector('[data-el-corpo]');
    if (st.aba === 'presidente') alvo.innerHTML = abaPresidente(d, st.termo);
    else if (st.aba === 'camara' || st.aba === 'assembleia') alvo.innerHTML = abaDeputados(d[st.aba].estados, st.termo);
    else alvo.innerHTML = abaMajoritaria(d[st.aba].estados, st.termo, st.aba);
  };
  body.querySelector('[data-abas]').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-aba-el]');
    if (!b) return;
    st.aba = b.dataset.abaEl;
    body.querySelectorAll('[data-aba-el]').forEach((x) => x.classList.toggle('is-active', x === b));
    render();
  });
  body.querySelector('[data-el-busca]').addEventListener('input', (ev) => {
    st.termo = ev.target.value;
    render();
  });
  fetch('/api/eleitos')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
    .then((d) => {
      st.dados = d;
      if (modal.aberto()) render();
    })
    .catch(() => {
      if (modal.aberto()) body.querySelector('[data-el-corpo]').innerHTML = '<p class="empty">Não foi possível carregar agora. Tente de novo em instantes.</p>';
    });
}

// Botão fixo no canto da tela.
export function criarBotaoEleitos(onAbrir) {
  const b = document.createElement('button');
  b.className = 'fab-eleitos';
  b.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M17 5h3v2a4 4 0 0 1-4 4M7 5H4v2a4 4 0 0 0 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg><span>Eleitos</span>`;
  b.title = 'Ver os eleitos de cada lugar';
  b.addEventListener('click', () => onAbrir());
  document.body.appendChild(b);
  return b;
}

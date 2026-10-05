// Eleitos por lugar: Presidente, governadores, Senado e deputados. Três níveis: oficial (TSE) quando
// a totalização do lugar termina; garantido quando os votos que faltam já não mudam o resultado
// (calculado no servidor, ver server/garantia.js); e, nos demais, quem lidera / está dentro das vagas.
import { int, pct, esc, nomeProprio, semAcento } from '../format.js';
import { UFS, UF_BY_CODE } from '../ufs.js';
import { corPartido } from '../colors.js';
import { avatar, seloGarantido } from './common.js';
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
  eleito: '<span class="pill pill--eleito" title="Confirmado pelo TSE">Eleito (TSE)</span>',
  eleitoGarantido: seloGarantido('eleito', 'Eleito · garantido'),
  turno: '<span class="pill pill--turno" title="Confirmado pelo TSE">2º turno (TSE)</span>',
  turnoGarantido: seloGarantido('segundoTurno', '2º turno · garantido'),
  turnoProv: '<span class="pill pill--dentro" title="O 2º turno já é certo, mas esta vaga ainda pode mudar">2º turno · provisório</span>',
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
  // 2º turno já certo pela conta: os dois primeiros, cada um garantido ou ainda provisório.
  if (m.haveraSegundoTurno) return m.lideres.slice(0, 2).map((c) => pessoa(c, c.garantido === 'segundoTurno' ? 'turnoGarantido' : 'turnoProv')).join('');
  const n = Math.max(1, m.vagas || 1);
  return m.lideres.slice(0, n).map((c) => pessoa(c, c.garantido === 'eleito' ? 'eleitoGarantido' : n > 1 ? 'dentro' : 'lidera')).join('');
}

const barra = (s) => `<div class="el-apurado" title="${pct(s?.pct)} das seções apuradas"><i style="width:${(s?.pct || 0).toFixed(1)}%"></i><span>${pct(s?.pct)}</span></div>`;

// Situação de um lugar majoritário: oficial do TSE, garantida pela conta ou ainda em apuração.
function situacao(m) {
  if (m.eleitos.length) return 'eleitoTSE';
  if (m.segundoTurno.length) return 'turnoTSE';
  if ((m.lideres || []).some((c) => c.garantido === 'eleito')) return 'eleitoGarantido';
  if (m.haveraSegundoTurno) return 'turnoGarantido';
  return 'apurando';
}

function conta(estados, chave) {
  const r = { eleitos: 0, eleitosTSE: 0, turno: 0, turnoTSE: 0, apurando: 0 };
  for (const e of Object.values(estados)) {
    const s = chave === 'prop' ? (e.oficiais ? 'eleitoTSE' : 'apurando') : situacao(e);
    if (s === 'eleitoTSE' || s === 'eleitoGarantido') r.eleitos++;
    if (s === 'turnoTSE' || s === 'turnoGarantido') r.turno++;
    if (s === 'eleitoTSE') r.eleitosTSE++;
    if (s === 'turnoTSE') r.turnoTSE++;
    if (s === 'apurando') r.apurando++;
  }
  return r;
}

// " (2 pelo TSE · 5 garantidos)": de onde vem a contagem.
function origem(tse, garantidos) {
  const p = [tse ? `${tse} pelo TSE` : '', garantidos ? `${garantidos} ${garantidos === 1 ? 'garantido' : 'garantidos'}` : ''].filter(Boolean);
  return p.length ? ` (${p.join(' · ')})` : '';
}

function filtra(termo, textos) {
  const t = semAcento(termo.trim());
  return !t || textos.some((x) => semAcento(x || '').includes(t));
}

function abaPresidente(d, termo) {
  const m = d.presidente;
  if (!m) return '<p class="empty">Resultado indisponível.</p>';
  const s = situacao(m);
  const titulo = s.startsWith('eleito') ? 'Eleito no 1º turno' : s.startsWith('turno') ? 'Haverá 2º turno' : 'Em apuração';
  const fonte = s.endsWith('TSE') ? 'oficial do TSE' : s === 'apurando' ? 'resultado provisório' : 'garantido pela conta dos votos que faltam · o TSE confirma ao fim da totalização';
  return `<div class="el-resumo"><b>${titulo}</b> · ${fonte}</div>
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
  let resumo;
  if (cargo === 'senado') {
    // No Senado a conta é por cadeira: um estado pode ter uma vaga definida e a outra ainda em disputa.
    let vagas = 0, tse = 0, garantidos = 0, abertos = 0;
    for (const e of Object.values(estados)) {
      const g = e.eleitos.length ? 0 : (e.lideres || []).filter((p) => p.garantido === 'eleito').length;
      vagas += e.vagas || 1;
      tse += e.eleitos.length;
      garantidos += g;
      if (e.eleitos.length + g < (e.vagas || 1)) abertos++;
    }
    resumo = `<b>${tse + garantidos}</b> de ${vagas} senadores eleitos${origem(tse, garantidos)} · <b>${abertos}</b> ${abertos === 1 ? 'estado' : 'estados'} com vaga em disputa`;
  } else {
    resumo = `<b>${c.eleitos}</b> de ${total} eleitos${origem(c.eleitosTSE, c.eleitos - c.eleitosTSE)}${c.turno ? ` · <b>${c.turno}</b> com 2º turno${origem(c.turnoTSE, c.turno - c.turnoTSE)}` : ''} · <b>${c.apurando}</b> em apuração`;
  }
  return `<div class="el-resumo">${resumo}</div>
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
    <p class="card__sub">Oficial do TSE quando a totalização do lugar termina · antes disso, <b>garantido</b> quando os votos que faltam já não mudam o resultado e provisório para quem só lidera ou está dentro das vagas</p>
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

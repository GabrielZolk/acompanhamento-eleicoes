import { morph } from './morph.js';
import { CARGOS, UF_BY_CODE, UFS, REGIOES } from './ufs.js';
import { vistaExterior } from './exterior.js';
import { mesclarHistorico } from './historico.js';
import { createHeader } from './ui/header.js';
import { createMapa } from './ui/mapa.js';
import { renderDisputa } from './ui/disputa.js';
import { renderRegioes, prepararIcones } from './ui/regioes.js';
import { renderResumo, renderUpdates, renderPrevisao } from './ui/paineis.js';
import { renderEvolucao } from './ui/evolucao.js';
import * as modal from './ui/modais.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const state = {
  cargo: CARGOS[params.get('cargo')] ? params.get('cargo') : 'presidente',
  uf: UF_BY_CODE[params.get('uf')] && params.get('uf') !== 'zz' ? params.get('uf') : 'sp',
  incluirExterior: params.get('exterior') !== '0',
  mapaModo: 'lider',
  regiaoModo: 'validos',
  regiaoAberta: null,
  pins: null,
  data: null,
  erro: null,
};

const cache = {}; // cargo -> último payload (troca de aba instantânea)

// Dados já ajustados ao checkbox "Incluir exterior".
const vista = () => vistaExterior(state.data, state.incluirExterior);

function syncURL() {
  const p = new URLSearchParams();
  if (state.cargo !== 'presidente') p.set('cargo', state.cargo);
  if (!CARGOS[state.cargo].federal) p.set('uf', state.uf);
  if (!state.incluirExterior) p.set('exterior', '0');
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

// ------------------------------------------------------------------ ações
function setCargo(cargo) {
  if (cargo === state.cargo) return;
  state.cargo = cargo;
  state.mapaModo = 'lider';
  state.regiaoAberta = null;
  state.pins = null;
  state.data = cache[cargo] || null;
  syncURL();
  render();
  carregar();
}

function setExterior(incluir) {
  state.incluirExterior = incluir;
  if (!incluir && state.pins) state.pins = state.pins.filter((p) => p !== 'zz');
  syncURL();
  render();
}

function selecionarUF(uf) {
  const federal = CARGOS[state.cargo].federal;
  if (!UF_BY_CODE[uf] || (uf === 'zz' && (!federal || !state.incluirExterior))) return;
  const pins = state.pins || [];
  if (federal) {
    if (pins[1] === uf) state.pins = [pins[0]];
    else if (pins[0] === uf) state.pins = pins[1] ? [pins[1]] : [];
    else state.pins = [pins[0] || 'sp', uf].filter(Boolean);
    if (state.pins[0] === state.pins[1]) state.pins = [state.pins[0]];
  } else {
    state.uf = uf;
    state.pins = [uf, ...(pins[0] && pins[0] !== uf ? [pins[0]] : [])];
    syncURL();
  }
  render();
}

function desafixar(uf) {
  state.pins = (state.pins || []).filter((p) => p !== uf);
  render();
}

async function abrirMunicipio(m) {
  const cargo = m.uf === 'zz' ? 'presidente' : state.cargo;
  const titulo = `${m.nome} (${m.uf === 'zz' ? 'Exterior' : m.uf.toUpperCase()})`;
  modal.abrir(modal.modalMunicipio({ titulo }));
  try {
    const r = await fetch(`/api/municipio?cargo=${cargo}&uf=${m.uf}&mun=${m.cd}`);
    const j = await r.json();
    if (modal.aberto()) modal.corpo.innerHTML = modal.modalMunicipio(r.ok ? j : { titulo, erro: j.erro || 'Não foi possível carregar o resultado.' });
  } catch {
    if (modal.aberto()) modal.corpo.innerHTML = modal.modalMunicipio({ titulo, erro: 'Falha de conexão com o servidor.' });
  }
}

// ------------------------------------------------------------------ componentes
const header = createHeader({
  onCargo: setCargo,
  onUF: selecionarUF,
  onMunicipio: abrirMunicipio,
});

const mapa = createMapa({
  stage: $('mapa-stage'),
  svg: $('mapa-svg'),
  overlay: $('mapa-overlay'),
  tooltip: $('mapa-tooltip'),
  legenda: $('mapa-legenda'),
  select: $('mapa-modo'),
  sub: $('mapa-sub'),
  onSelect: selecionarUF,
  onUnpin: desafixar,
  onModo: (m) => {
    state.mapaModo = m;
    render();
  },
});

$('disputa').addEventListener('click', (ev) => {
  if (ev.target.closest('[data-action="todos"]') && state.data) {
    modal.abrir(modal.modalTodos(vista(), state));
  }
});
$('disputa').addEventListener('change', (ev) => {
  if (ev.target.matches('[data-action="uf"]')) selecionarUF(ev.target.value);
  if (ev.target.matches('[data-action="exterior"]')) setExterior(ev.target.checked);
});
$('modal').addEventListener('click', (ev) => {
  const aba = ev.target.closest('[data-aba]');
  if (aba && state.data) modal.corpo.innerHTML = modal.modalTodos(vista(), state, aba.dataset.aba);
});
$('regioes').addEventListener('click', (ev) => {
  const r = ev.target.closest('[data-reg]');
  if (!r) return;
  state.regiaoAberta = state.regiaoAberta === r.dataset.reg ? null : r.dataset.reg;
  render();
});
$('regioes').addEventListener('change', (ev) => {
  if (ev.target.matches('[data-action="regiao-modo"]')) {
    state.regiaoModo = ev.target.value;
    render();
  }
});
$('updates').addEventListener('click', (ev) => {
  if (ev.target.closest('[data-action="updates"]') && state.data) modal.abrir(modal.modalUpdates(vista()));
});

// ------------------------------------------------------------------ render
function pinsPadrao(d) {
  if (!CARGOS[state.cargo].federal) return [state.uf];
  const recente = d.atualizacoes.find((u) => u.uf !== 'sp' && u.uf !== 'zz')?.uf;
  return ['sp', recente || 'ce'];
}

function skeleton() {
  const linhas = '<div class="cand skeleton"></div>'.repeat(6);
  $('disputa').innerHTML = `<div class="disputa__head"><h2 class="card__title">${CARGOS[state.cargo].titulo}</h2><p class="card__sub">Carregando…</p></div><div class="disputa__list">${linhas}</div>`;
}

function render() {
  const d = vista();
  header.renderStatus(d, state);
  if (!d) {
    skeleton();
    return;
  }
  if (!state.pins) state.pins = pinsPadrao(d);
  morph($('disputa'), renderDisputa(d, state));
  mapa.update(d, state);
  morph($('regioes'), renderRegioes(d, state));
  morph($('resumo'), renderResumo(d, state));
  morph($('updates'), renderUpdates(d, state));
  renderBottom();
}

function renderBottom() {
  const d = vista();
  if (!d) return;
  const el = $('evolucao');
  const chart = el.querySelector('.evolucao__chart');
  const largura = chart ? chart.clientWidth : el.clientWidth - 300;
  morph(el, renderEvolucao(d, largura, state));
  morph($('previsao'), renderPrevisao(d, state));
}
new ResizeObserver(() => renderBottom()).observe($('evolucao'));

// ------------------------------------------------------------------ dados
let emVoo = null, pendente = false;
const versoes = {}; // cargo -> versão (idg do TSE) do último painel carregado

async function carregar(versao) {
  if (emVoo) {
    pendente = true;
    return emVoo;
  }
  const alvo = state.cargo;
  emVoo = (async () => {
    try {
      const r = await fetch(`/api/painel?cargo=${alvo}${versao ? `&v=${encodeURIComponent(versao)}` : ''}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
      const d = mesclarHistorico(j);
      versoes[alvo] = j.versao;
      cache[alvo] = d;
      if (alvo === state.cargo) {
        state.data = d;
        state.erro = null;
      }
    } catch (err) {
      state.erro = err.message;
    } finally {
      emVoo = null;
      render();
      if (pendente || alvo !== state.cargo) {
        pendente = false;
        carregar();
      }
    }
  })();
  return emVoo;
}

// A cada 5 s pergunta qual é a publicação atual do TSE (resposta de poucos bytes) e só baixa o
// painel completo quando ela muda. Se o painel vier atrasado em relação à versão, a próxima
// checagem percebe a diferença e baixa de novo.
const CHECAGEM = 5000;
async function checarVersao() {
  if (document.visibilityState !== 'visible' || emVoo) return;
  try {
    const r = await fetch(`/api/versao?cargo=${state.cargo}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const { versao } = await r.json();
    if (versao && versao !== versoes[state.cargo]) carregar(versao);
    else if (state.erro) carregar();
  } catch (err) {
    state.erro = err.message;
    header.renderStatus(vista(), state);
  }
}
setInterval(checarVersao, CHECAGEM);
setInterval(() => {
  if (document.visibilityState === 'visible') carregar();
}, 120000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checarVersao();
});

// ------------------------------------------------------------------ início
(async () => {
  render();
  const geo = await mapa.init();
  prepararIcones(geo, REGIOES.map((r) => ({ id: r.id, ufs: UFS.filter((u) => u.regiao === r.id).map((u) => u.uf) })));
  await carregar();
})();

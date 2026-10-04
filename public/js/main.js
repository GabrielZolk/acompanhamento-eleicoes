import { morph } from './morph.js';
import { CARGOS, UF_BY_CODE, UFS, REGIOES } from './ufs.js';
import { vistaExterior } from './exterior.js';
import { mesclarHistorico } from './historico.js';
import { createHeader } from './ui/header.js';
import { createMapa } from './ui/mapa.js';
import { renderDisputa } from './ui/disputa.js';
import { renderRegioes, prepararIcones } from './ui/regioes.js';
import { renderResumo, renderUpdates, renderPrevisao } from './ui/paineis.js';
import { renderEvolucao, tickAoVivo } from './ui/evolucao.js';
import * as modal from './ui/modais.js';
import { abrirCandidatos } from './ui/candidatos.js';
import { abrirCadeiras } from './ui/cadeiras.js';
import { abrirPartidos, listaPartidos } from './ui/partidos.js';
import { detectarViradas, mostrarViradas } from './ui/avisos.js';
import { compartilhar } from './ui/compartilhar.js';
import { criarModoTV } from './ui/tv.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

const state = {
  cargo: CARGOS[params.get('cargo')] ? params.get('cargo') : 'presidente',
  uf: UF_BY_CODE[params.get('uf')] && params.get('uf') !== 'zz' ? params.get('uf') : 'sp',
  incluirExterior: params.get('exterior') !== '0',
  mapaModo: 'lider',
  regiaoModo: 'validos',
  evoModo: ['candidatos', 'projecao'].includes(params.get('grafico')) ? params.get('grafico') : 'secoes',
  mapaNivel: params.get('mapa') === 'cidades' ? 'mun' : 'uf',
  regiaoAberta: null,
  visaoDep: 'partidos',
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
  if (state.mapaNivel === 'mun') p.set('mapa', 'cidades');
  if (state.evoModo !== 'secoes' && CARGOS[state.cargo].federal) p.set('grafico', state.evoModo);
  const qs = p.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
}

// ------------------------------------------------------------------ ações
function setCargo(cargo) {
  if (cargo === state.cargo) return;
  document.body.classList.remove('troca');
  void document.body.offsetWidth;
  document.body.classList.add('troca');
  setTimeout(() => document.body.classList.remove('troca'), 600);
  state.cargo = cargo;
  setTimeout(() => carregarMapaCidades(true), 0);
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
  onPartido: (sigla) => abrirPartidos(sigla),
  listaPartidos,
  onTV: () => tv.entrar(),
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
  nivelEl: $('mapa-nivel'),
  dica: $('mapa-dica'),
  onNivel: (n) => {
    state.mapaNivel = n;
    syncURL();
    render();
    if (n === 'mun') carregarMapaCidades(true);
  },
  onMunicipio: (m) => abrirMunicipio(m),
  onSelect: selecionarUF,
  onUnpin: desafixar,
  onModo: (m) => {
    state.mapaModo = m;
    render();
  },
});

$('disputa').addEventListener('click', (ev) => {
  const partido = ev.target.closest('[data-partido]');
  if (partido) return abrirPartidos(partido.dataset.partido);
  const alvo = ev.target.closest('[data-action]');
  if (!alvo || !state.data) return;
  const acao = alvo.dataset.action;
  if (acao === 'todos') modal.abrir(modal.modalTodos(vista(), state));
  else if (acao === 'candidatos') abrirCandidatos({ cargo: state.cargo, uf: state.uf, cores: state.data.cores });
  else if (acao === 'cadeiras') abrirCadeiras(state.data, state.uf, (sigla) => abrirPartidos(sigla));
  else if (acao === 'compartilhar') {
    alvo.classList.add('is-busy');
    compartilhar(vista(), state.uf)
      .then((r) => r === 'baixado' && mostrarAviso('Imagem do resultado baixada'))
      .catch(() => mostrarAviso('Não foi possível gerar a imagem'))
      .finally(() => alvo.classList.remove('is-busy'));
  }
  else if (acao === 'dep-tipo') setCargo(alvo.dataset.cargo);
  else if (acao === 'visao') {
    state.visaoDep = alvo.dataset.v;
    render();
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
  document.body.classList.toggle('apurando', d?.status === 'apurando');
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
// Contador ao vivo: só troca os textos, ~11 vezes por segundo, com a aba visível.
setInterval(() => {
  if (document.visibilityState === 'visible' && state.data) tickAoVivo(vista());
}, 90);
$('evolucao').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-evo]');
  if (!b) return;
  state.evoModo = b.dataset.evo;
  syncURL();
  renderBottom();
});

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
      const antes = cache[alvo];
      versoes[alvo] = j.versao;
      cache[alvo] = d;
      if (alvo === state.cargo && antes) {
        const viradas = detectarViradas(vistaExterior(antes, state.incluirExterior), vistaExterior(d, state.incluirExterior));
        mostrarViradas(viradas, { cargo: CARGOS[alvo].nome, onClique: (uf) => uf !== 'br' && selecionarUF(uf) });
      }
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
// Radar: a linha do topo corre a cada checagem; quando chega dado novo, pisca em verde.
const radar = document.getElementById('radar');
function pulsoRadar(cls) {
  const dot = document.querySelector('.live__dot');
  if (dot) {
    dot.classList.remove('live__dot--ping');
    void dot.offsetWidth;
    dot.classList.add('live__dot--ping');
  }
  if (!radar) return;
  radar.classList.remove('radar--checa', 'radar--novo');
  void radar.offsetWidth;
  radar.classList.add(cls);
}

async function checarVersao() {
  if (document.visibilityState !== 'visible' || emVoo) return;
  pulsoRadar('radar--checa');
  try {
    const r = await fetch(`/api/versao?cargo=${state.cargo}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const { versao } = await r.json();
    if (versao && versao !== versoes[state.cargo]) {
      pulsoRadar('radar--novo');
      carregar(versao);
    } else if (state.erro) carregar();
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

// ------------------------------------------------------------------ mapa por cidade
// Cada UF vem de /api/municipios-mapa (o servidor agrega os arquivos municipais do TSE).
const cidades = { cargo: null, em: 0, carregando: false };
async function carregarMapaCidades(forcar = false) {
  const cargo = state.cargo;
  if (state.mapaNivel !== 'mun' || CARGOS[cargo].proporcional || cidades.carregando) return;
  if (!forcar && cidades.cargo === cargo && Date.now() - cidades.em < 90000) return;
  if (cidades.cargo !== cargo) mapa.limparMunicipios();
  cidades.cargo = cargo;
  cidades.carregando = true;
  // Estados mais populosos primeiro, para o mapa encher rápido onde há mais cidades.
  const fila = ['sp', 'mg', 'rj', 'ba', 'pr', 'rs', 'pe', 'ce', 'pa', 'sc', 'go', 'ma', 'am', 'pb', 'es', 'mt', 'rn', 'pi', 'al', 'df', 'ms', 'se', 'ro', 'to', 'ac', 'ap', 'rr'];
  const trabalho = async () => {
    while (fila.length) {
      const uf = fila.shift();
      try {
        const r = await fetch(`/api/municipios-mapa?cargo=${cargo}&uf=${uf}`);
        if (!r.ok) continue;
        const j = await r.json();
        if (state.cargo === cargo) mapa.definirMunicipios(uf, j.municipios);
        // Parte das cidades ainda estava sendo consultada no servidor: pede o resto em seguida.
        if (j.parcial) {
          fila.push(uf);
          await new Promise((ok) => setTimeout(ok, 8000));
        }
      } catch {
        /* tenta de novo na próxima atualização */
      }
    }
  };
  await Promise.all(Array.from({ length: 3 }, trabalho));
  cidades.em = Date.now();
  cidades.carregando = false;
  if (state.cargo !== cargo) carregarMapaCidades(true); // trocou de cargo durante a carga
}
setInterval(() => {
  if (document.visibilityState === 'visible') carregarMapaCidades();
}, 90000);

// ------------------------------------------------------------------ modo TV
// Alterna entre Presidente (com os três gráficos) e os cargos estaduais, trocando de estado a cada vez.
const TV_UFS = ['sp', 'mg', 'rj', 'ba', 'pr', 'rs', 'pe', 'ce', 'pa', 'sc', 'go', 'ma', 'am', 'pb', 'es', 'mt', 'rn', 'pi', 'al', 'df', 'ms', 'se', 'ro', 'to', 'ac', 'ap', 'rr'];
const TV_SEQ = [
  { cargo: 'presidente', evo: 'secoes' },
  { cargo: 'governador' },
  { cargo: 'presidente', evo: 'candidatos' },
  { cargo: 'senado' },
  { cargo: 'presidente', evo: 'projecao' },
  { cargo: 'camara' },
];
let tvPasso = -1, tvUF = -1;
const tv = criarModoTV({
  proximo() {
    tvPasso = (tvPasso + 1) % TV_SEQ.length;
    const p = TV_SEQ[tvPasso];
    modal.fechar();
    if (p.evo) state.evoModo = p.evo;
    if (!CARGOS[p.cargo].federal) {
      tvUF = (tvUF + 1) % TV_UFS.length;
      state.uf = TV_UFS[tvUF];
      state.pins = null;
    }
    if (p.cargo !== state.cargo) setCargo(p.cargo);
    else render();
    return `${CARGOS[p.cargo].nome} · ${CARGOS[p.cargo].federal ? 'Brasil' : UF_BY_CODE[state.uf].nome}`;
  },
});

// Aviso curto (ex.: "Imagem baixada"), reaproveitando a pilha de avisos.
function mostrarAviso(texto) {
  const caixa = document.querySelector('.avisos') || Object.assign(document.createElement('div'), { className: 'avisos' });
  if (!caixa.isConnected) document.body.appendChild(caixa);
  const t = document.createElement('div');
  t.className = 'aviso aviso--simples';
  t.textContent = texto;
  caixa.prepend(t);
  setTimeout(() => {
    t.classList.add('saindo');
    setTimeout(() => t.remove(), 350);
  }, 3000);
}

// ------------------------------------------------------------------ pessoas acompanhando
// A aba avisa o servidor a cada minuto enquanto está visível. Se o contador estiver desligado
// (404) ele some; se falhar seguidamente, passa a tentar só a cada 5 minutos.
const presenca = {
  id: (() => {
    try {
      let v = localStorage.getItem('apuracao2026:id');
      if (!v) localStorage.setItem('apuracao2026:id', (v = crypto.randomUUID().replace(/-/g, '')));
      return v;
    } catch {
      return Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
  })(),
  falhas: 0,
  pulos: 0,
  desligado: false,
};
function mostrarPresenca(total) {
  if (state.presenca === total) return;
  state.presenca = total;
  header.renderStatus(vista(), state);
}
async function avisarPresenca() {
  if (presenca.desligado || document.visibilityState !== 'visible') return;
  if (presenca.falhas >= 3 && ++presenca.pulos % 5) return;
  try {
    const r = await fetch(`/api/presenca?id=${presenca.id}`, { cache: 'no-store' });
    if (r.status === 404) {
      presenca.desligado = true;
      return mostrarPresenca(null);
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    presenca.falhas = 0;
    mostrarPresenca((await r.json()).total);
  } catch {
    if (++presenca.falhas >= 3) mostrarPresenca(null);
  }
}
setInterval(avisarPresenca, 60000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') avisarPresenca();
});

// ------------------------------------------------------------------ início
(async () => {
  render();
  const geo = await mapa.init();
  prepararIcones(geo, REGIOES.map((r) => ({ id: r.id, ufs: UFS.filter((u) => u.regiao === r.id).map((u) => u.uf) })));
  avisarPresenca();
  await carregar();
  carregarMapaCidades(true);
})();

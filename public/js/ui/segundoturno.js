// 2º turno: destaque no card do Presidente (presidente eleito, 2º turno certo ou muito provável) e o
// modal "2º turno", com a data, a contagem regressiva, o par do Presidente e os governadores com 2º turno.
//
// Três níveis, do mais forte para o mais fraco, como no modal de eleitos: oficial (marcação do TSE ao
// fim da totalização do lugar), garantido (os votos que faltam já não mudam o resultado; calculado no
// servidor, ver server/garantia.js) e provável (estimativa do painel, ver segundoTurnoProvavel).
import { esc, pct, int, nomeProprio, compacto } from '../format.js';
import { UFS } from '../ufs.js';
import { corPartido } from '../colors.js';
import { avatar, cnt, ICON, DICA_GARANTIDO, seloGarantido } from './common.js';
import * as modal from './modais.js';
import { PRIMEIRO_TURNO, SEGUNDO_TURNO, utc, diasAte, dataSegundoTurno, contagem } from '../datas.js';

export { PRIMEIRO_TURNO, SEGUNDO_TURNO, diasAte, dataSegundoTurno, contagem };
const diaMes = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', day: 'numeric', month: 'short' });

// ------------------------------------------------------------------ situação
// "2º turno muito provável" é estimativa: não há modelo probabilístico. Só vale para disputas por
// maioria absoluta (Presidente e governador). Regra conservadora, com os votos válidos já apurados:
//   - pelo menos 60% das seções apuradas e o líder abaixo de 50% dos válidos; e
//   - o líder tem no máximo 48,5% (1,5 ponto abaixo da maioria) ou precisaria de pelo menos 75% dos
//     votos válidos que faltam para passar de 50% (supondo que eles sejam proporcionais às seções
//     ainda não apuradas). A segunda condição cobre o fim da apuração, quando 49% já não vira
//     (governador do RJ na noite do 1º turno: 49,3% com 99,9% das seções).
export const PROVAVEL = { apuradoMin: 60, liderMax: 48.5, fatiaMin: 75 };
export function segundoTurnoProvavel(liderPct, apuradoPct) {
  if (!(apuradoPct >= PROVAVEL.apuradoMin) || !(liderPct > 0) || liderPct >= 50) return false;
  if (liderPct <= PROVAVEL.liderMax) return true;
  const f = Math.min(1, apuradoPct / 100);
  return f >= 1 || (50 - liderPct * f) / (1 - f) >= PROVAVEL.fatiaMin;
}

const vaiAo2T = (c) => /2º turno/i.test(c?.situacao || '');
// Os dois do 2º turno: primeiro os que já têm a vaga garantida, depois os mais votados.
const par = (cands) => [...cands.filter((c) => c.garantido === 'segundoTurno'), ...cands.filter((c) => c.garantido !== 'segundoTurno')].slice(0, 2);

// Presidente nos dados exibidos (d = vista do painel, já com o filtro de exterior). Devolve
// { tipo: 'eleito' | 'turno', nivel: 'oficial' | 'garantido' | 'provavel', cands } ou null enquanto
// nada é certo nem muito provável.
export function situacaoPresidente(d) {
  const n = d?.cargo?.federal ? d.nacional : null;
  const cands = n?.candidatos || [];
  if (!cands.length || !(n.secoes?.apuradas > 0) || !(cands[0].votos > 0)) return null;
  const eleito = cands.find((c) => c.eleito) || cands.find((c) => c.garantido === 'eleito');
  if (eleito) return { tipo: 'eleito', nivel: eleito.eleito ? 'oficial' : 'garantido', cands: [eleito] };
  if (d.turno !== 1 || cands.length < 2) return null;
  const oficial = cands.filter(vaiAo2T);
  if (oficial.length >= 2) return { tipo: 'turno', nivel: 'oficial', cands: oficial.slice(0, 2) };
  if (n.haveraSegundoTurno || cands.some((c) => c.garantido === 'segundoTurno')) return { tipo: 'turno', nivel: 'garantido', cands: par(cands) };
  if (segundoTurnoProvavel(cands[0].pct, n.secoes.pct)) return { tipo: 'turno', nivel: 'provavel', cands: cands.slice(0, 2) };
  return null;
}

// Governador de uma UF, no formato de /api/eleitos (server/eleitos.js): { nivel, cands } quando há
// 2º turno (oficial, garantido ou provável); null se alguém foi eleito ou nada é certo ainda.
function situacaoUF(m) {
  if (!m || m.eleitos?.length) return null;
  if (m.segundoTurno?.length >= 2) return { nivel: 'oficial', cands: m.segundoTurno.slice(0, 2) };
  const lideres = m.lideres || [];
  if (lideres.length < 2 || lideres.some((c) => c.garantido === 'eleito')) return null;
  if (m.haveraSegundoTurno) return { nivel: 'garantido', cands: par(lideres) };
  if (segundoTurnoProvavel(lideres[0].pct, m.secoes?.pct)) return { nivel: 'provavel', cands: lideres.slice(0, 2) };
  return null;
}

// ------------------------------------------------------------------ destaque no card
const nome = (c) => nomeProprio(c.nome);
const DICA = {
  oficial: 'Confirmado pelo TSE',
  garantido: DICA_GARANTIDO,
};
const marcaNivel = (nivel) =>
  nivel === 'oficial' ? '<span class="t2__tse">TSE</span>' : nivel === 'garantido' ? ICON.cadeado : '';

// Contador do canto: "faltam / 21 / dias", "falta / 1 / dia" ou "hoje".
function relogio(dias) {
  if (dias > 0) return `<span class="t2__conta"><small>${dias === 1 ? 'falta' : 'faltam'}</small><b>${dias}</b><small>${dias === 1 ? 'dia' : 'dias'}</small></span>`;
  if (dias === 0) return '<span class="t2__conta"><small>é</small><b class="t2__hoje">hoje</b><small>2º turno</small></span>';
  return '';
}

// Faixa do topo do card "Disputa para Presidente". Ocupa o lugar do 6º candidato, com a mesma altura:
// o card não cresce e a tela de 1672×941 continua sem rolagem. Vazia enquanto nada é certo nem provável.
export function destaqueSegundoTurno(d) {
  const s = situacaoPresidente(d);
  if (!s) return '';
  const [a, b] = s.cands;
  const acao = 'data-key="t2" data-action="segundo-turno"';
  if (s.tipo === 'eleito') {
    const dica = s.nivel === 'oficial' ? `Eleito no ${d.turno}º turno · confirmado pelo TSE` : DICA_GARANTIDO;
    return `<button class="t2 t2--eleito t2--${s.nivel}" ${acao} style="--c1:${a.cor};--c2:${a.cor}" title="${esc(dica)}"
      aria-label="${esc(`Presidente eleito: ${nome(a)}, ${a.partido}, ${pct(a.pct)} dos votos válidos. Abrir o 2º turno nos estados`)}">
      <span class="t2__fotos">${avatar(a)}</span>
      <span class="t2__txt">
        <span class="t2__tag">Presidente eleito(a)${marcaNivel(s.nivel)}</span>
        <span class="t2__nomes">${esc(nome(a))}</span>
        <span class="t2__sub">${esc(a.partido)} · ${d.turno === 1 ? 'no 1º turno' : 'no 2º turno'}</span>
      </span>
      <span class="t2__conta t2__conta--pct"><b>${cnt(a.pct, 'pct')}</b><small>dos válidos</small></span>
    </button>`;
  }
  const dias = diasAte();
  const provavel = s.nivel === 'provavel';
  const dica = provavel
    ? `Estimativa: com ${pct(d.nacional.secoes.pct)} das seções apuradas, ${nome(a)} tem ${pct(a.pct, 2)} dos válidos e não deve passar de 50%`
    : DICA[s.nivel];
  const falta = contagem(dias);
  return `<button class="t2 t2--turno t2--${s.nivel}" ${acao} style="--c1:${a.cor};--c2:${b.cor}" title="${esc(dica)}"
      aria-label="${esc(`${provavel ? '2º turno muito provável (estimativa)' : 'Vai ter 2º turno'}: ${nome(a)} contra ${nome(b)}, ${dataSegundoTurno()}${falta ? `, ${falta}` : ''}. Abrir detalhes do 2º turno`)}">
      <span class="t2__fotos">${avatar(a)}${avatar(b)}</span>
      <span class="t2__txt">
        <span class="t2__tag">${provavel ? '2º turno muito provável' : 'Vai ter 2º turno'}${marcaNivel(s.nivel)}</span>
        <span class="t2__nomes">${esc(nome(a))}<i>×</i>${esc(nome(b))}</span>
        <span class="t2__sub">${provavel ? `<span class="tag-estimativa">estimativa</span>${esc(dataSegundoTurno(false))}` : esc(dataSegundoTurno())}</span>
      </span>
      ${relogio(dias)}
    </button>`;
}

// ------------------------------------------------------------------ modal
const SELO = {
  turno: {
    oficial: '<span class="pill pill--turno" title="Confirmado pelo TSE">2º turno (TSE)</span>',
    garantido: seloGarantido('segundoTurno', '2º turno · garantido'),
    provavel: '<span class="pill pill--dentro" title="Estimativa do painel, sem modelo estatístico">2º turno · provável</span>',
  },
  eleito: {
    oficial: '<span class="pill pill--eleito" title="Confirmado pelo TSE">Eleito (TSE)</span>',
    garantido: seloGarantido('eleito', 'Eleito · garantido'),
  },
};
const cadeado = `<span class="t2m__cad" title="${DICA_GARANTIDO}">${ICON.cadeado}</span>`;
const provisorio = '<span class="t2m__prov" title="O 2º turno é certo, mas esta vaga ainda pode mudar">provisório</span>';

const maiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// "2,15 pontos"
const pontos = (v) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${Math.abs(v) === 1 ? 'ponto' : 'pontos'}`;

// Contagem regressiva com a linha do tempo entre os dois turnos.
function hero(dias) {
  const total = Math.max(1, Math.round((utc(SEGUNDO_TURNO) - utc(PRIMEIRO_TURNO)) / 864e5));
  const andou = Math.min(100, Math.max(0, ((total - dias) / total) * 100));
  const conta = dias > 0 ? `<b>${dias}</b><span>${dias === 1 ? 'dia' : 'dias'}</span>` : dias === 0 ? '<b class="t2m__hoje">Hoje</b><span>é o dia</span>' : '<b>✓</b><span>realizado</span>';
  return `<div class="t2m__hero">
    <div class="t2m__conta">${conta}</div>
    <div class="t2m__quando">
      <div class="t2m__dia">${esc(maiuscula(dataSegundoTurno()))}</div>
      <div class="t2m__falta">${dias >= 0 ? `${maiuscula(contagem(dias))} · Presidente e, nos estados sem eleito no 1º turno, governador` : 'O 2º turno já aconteceu'}</div>
      <div class="t2m__linha" aria-hidden="true"><i style="width:${andou.toFixed(1)}%"></i></div>
      <div class="t2m__marcos"><span>1º turno · ${esc(diaMes.format(utc(PRIMEIRO_TURNO)))}</span><span>2º turno · ${esc(diaMes.format(utc(SEGUNDO_TURNO)))}</span></div>
    </div>
  </div>`;
}

function cartao(c, marca = '') {
  return `<div class="t2m__cand" style="--c:${c.cor}">
    ${avatar(c)}
    <div class="t2m__info"><div class="t2m__nome" title="${esc(nomeProprio(c.nomeCompleto || c.nome))}">${esc(nome(c))}</div><div class="t2m__part">${esc(c.partido)}${marca}</div></div>
    <div class="t2m__num"><b>${pct(c.pct, 2)}</b><small>${int(c.votos)} votos</small></div>
  </div>`;
}

const btnSimular = `<button class="t2m__sim" data-t2m-sim>Simular o 2º turno ${ICON.arrowRight}</button>
  <p class="t2m__erro" data-t2m-sim-erro hidden></p>`;

function blocoPresidente(p) {
  const n = p?.nacional;
  if (!n?.candidatos?.length || !(n.secoes?.apuradas > 0)) return '<div class="t2m__sec">Presidente</div><p class="empty">Sem votos apurados ainda.</p>';
  const s = situacaoPresidente(p);
  const onde = p.semExterior ? 'Brasil, sem o exterior' : 'Brasil e exterior';
  if (s?.tipo === 'eleito') {
    const c = s.cands[0];
    return `<div class="t2m__sec">Presidente ${SELO.eleito[s.nivel]}</div>
      <div class="t2m__par t2m__par--um">${cartao(c)}</div>
      <p class="t2m__nota">Eleito(a) no ${p.turno}º turno com <b>${pct(c.pct, 2)}</b> dos votos válidos (${esc(onde)}).${p.turno === 1 ? ' Não haverá 2º turno para Presidente.' : ''}</p>`;
  }
  const [a, b] = s?.cands || n.candidatos.slice(0, 2);
  if (!b) return '<div class="t2m__sec">Presidente</div><p class="empty">Resultado indisponível no momento.</p>';
  const marca = (c) => (s?.nivel === 'garantido' ? (c.garantido === 'segundoTurno' ? cadeado : provisorio) : '');
  const soma = a.votos + b.votos;
  const pa = soma ? (a.votos / soma) * 100 : 50;
  const demais = Math.max(0, (n.votos?.validos || 0) - soma);
  const titulo = s ? SELO.turno[s.nivel] : '<span class="pill pill--dentro">ainda indefinido</span>';
  const intro = s
    ? s.nivel === 'provavel'
      ? '<p class="t2m__nota t2m__nota--topo"><span class="tag-estimativa">estimativa</span>O 2º turno ainda não é certo, mas é muito provável entre:</p>'
      : ''
    : '<p class="t2m__nota t2m__nota--topo">Ainda não dá para saber se haverá 2º turno para Presidente. Os dois mais votados até agora:</p>';
  return `<div class="t2m__sec">Presidente ${titulo}</div>
    ${intro}
    <div class="t2m__par">${cartao(a, marca(a))}<span class="t2m__x" aria-hidden="true">×</span>${cartao(b, marca(b))}</div>
    <div class="t2m__cara" role="img" aria-label="${esc(`Só entre os dois, no 1º turno: ${nome(a)} ${pct(pa)}, ${nome(b)} ${pct(100 - pa)}`)}"><i style="--c:${a.cor};flex:${pa.toFixed(2)}"></i><i style="--c:${b.cor};flex:${(100 - pa).toFixed(2)}"></i></div>
    <div class="t2m__cara-leg"><span>${pct(pa)}</span><span>só entre os dois, no 1º turno</span><span>${pct(100 - pa)}</span></div>
    <p class="t2m__nota">Diferença de <b>${pontos(Math.abs(a.pct - b.pct))}</b> (${int(Math.abs(a.votos - b.votos))} votos) · os demais candidatos somaram <b>${pct(Math.max(0, 100 - a.pct - b.pct), 2)}</b> (${compacto(demais)}${demais >= 1e6 ? ' de' : ''} votos) · ${pct(n.secoes.pct, 2)} das seções apuradas · ${esc(onde)}</p>
    ${btnSimular}`;
}

function pessoaUF(c, nivel) {
  const cor = corPartido(c.partido);
  const marca = nivel === 'garantido' ? (c.garantido === 'segundoTurno' ? cadeado : provisorio) : '';
  return `<span class="t2m__p" style="--c:${cor}">${avatar({ nome: c.nome, cor, foto: c.foto }, 'avatar--sm')}<span class="t2m__pinfo"><b title="${esc(nome(c))}">${esc(nome(c))}</b><small>${esc(c.partido)} · ${pct(c.pct)}${marca}</small></span></span>`;
}

// Seções apuradas. Perto do fim, duas casas: 99,96% não pode aparecer como "100,0%" num lugar ainda aberto.
function barraApurado(s) {
  const v = s?.pct || 0;
  const txt = pct(v, v >= 99.5 && v < 100 ? 2 : 1);
  return `<div class="el-apurado" title="${txt} das seções apuradas"><i style="width:${v.toFixed(1)}%"></i><span>${txt}</span></div>`;
}

const GRUPOS = [
  ['oficial', 'Confirmados pelo TSE', ''],
  ['garantido', 'Garantidos pela conta', 'o TSE confirma ao fim da totalização'],
  ['provavel', 'Muito prováveis', '<span class="tag-estimativa">estimativa</span>'],
];

function blocoGovernadores(dados) {
  const estados = dados?.governador?.estados || {};
  const grupos = { oficial: [], garantido: [], provavel: [] };
  for (const u of UFS) {
    const s = situacaoUF(estados[u.uf]);
    if (s) grupos[s.nivel].push({ u, s, m: estados[u.uf] });
  }
  const certos = grupos.oficial.length + grupos.garantido.length;
  const prov = grupos.provavel.length;
  if (!certos && !prov) return '<p class="empty">Nenhum estado com 2º turno para governador até agora.</p>';
  const origem = [grupos.oficial.length ? `${grupos.oficial.length} pelo TSE` : '', grupos.garantido.length ? `${grupos.garantido.length} ${grupos.garantido.length === 1 ? 'garantido' : 'garantidos'}` : ''].filter(Boolean).join(' · ');
  const resumo = `${certos ? `<b>${certos}</b> ${certos === 1 ? 'estado' : 'estados'} com 2º turno certo${origem ? ` (${origem})` : ''}` : 'Nenhum estado com 2º turno certo ainda'}${prov ? ` · <b>${prov}</b> ${prov === 1 ? 'provável' : 'prováveis'}` : ''}`;
  const listas = GRUPOS.filter(([k]) => grupos[k].length)
    .map(([k, titulo, det]) => `<div class="t2m__grupo">${titulo}${det ? `<small>${det}</small>` : ''}</div>
      <div class="t2m__lista">${grupos[k]
        .map(({ u, s, m }) => `<div class="t2m__uf ${k === 'oficial' ? 't2m__uf--oficial' : ''}">
          <span class="uf-chip" title="${esc(u.nome)}">${u.uf.toUpperCase()}</span>
          <div class="t2m__duelo">${pessoaUF(s.cands[0], k)}<i class="t2m__vs" aria-hidden="true">×</i>${pessoaUF(s.cands[1], k)}</div>
          ${k === 'oficial' ? '' : barraApurado(m.secoes)}
        </div>`)
        .join('')}</div>`)
    .join('');
  return `<p class="t2m__resumo">${resumo}</p>${listas}`;
}

// /api/eleitos só é consultado ao abrir o modal (e reaproveitado por 30 s).
let eleitosMemo = null;
function carregarEleitos() {
  if (eleitosMemo && Date.now() - eleitosMemo.em < 30e3) return Promise.resolve(eleitosMemo.dados);
  return fetch('/api/eleitos')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((dados) => {
      eleitosMemo = { em: Date.now(), dados };
      return dados;
    });
}

const esqueleto = (n) => `<div class="mlist">${'<div class="mrow skeleton" style="height:58px"></div>'.repeat(n)}</div>`;

// painel: dados do Presidente já com o filtro de exterior (ou uma promessa deles). É o mesmo objeto
// entregue ao simulador.
export function abrirSegundoTurno({ painel }) {
  const dias = diasAte();
  modal.abrir(`<div class="t2m" data-t2m>
    <h3>2º turno</h3>
    <p class="card__sub">Quem disputa, com os números do 1º turno · dados oficiais do TSE</p>
    ${hero(dias)}
    <section class="t2m__bloco" data-t2m-pres><div class="t2m__sec">Presidente</div>${esqueleto(1)}</section>
    <section class="t2m__bloco">
      <div class="t2m__sec">Governadores com 2º turno</div>
      <div data-t2m-gov>${esqueleto(3)}</div>
    </section>
    <p class="nota"><b>Oficial</b> é a marcação do TSE ao fim da totalização de cada lugar; <b>garantido</b>, quando nem os votos que ainda faltam conseguem mudar o resultado; <b>provável</b> é estimativa do painel, sem modelo estatístico: com pelo menos ${PROVAVEL.apuradoMin}% das seções apuradas, o líder tem até ${pct(PROVAVEL.liderMax)} dos válidos ou precisaria de ${PROVAVEL.fatiaMin}% dos votos que ainda faltam para passar de 50%.</p>
  </div>`);
  const raiz = modal.corpo.querySelector('[data-t2m]');
  let dadosPainel = null;

  raiz.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-t2m-sim]');
    if (!b || !dadosPainel) return;
    const erro = raiz.querySelector('[data-t2m-sim-erro]');
    erro.hidden = true;
    b.classList.add('is-busy');
    // O simulador fica em outro módulo, carregado só quando pedido.
    import('./simulador.js')
      .then((m) => m.abrirSimulador({ painel: dadosPainel }))
      .catch((err) => {
        console.error('[simulador]', err);
        if (!erro.isConnected) return;
        erro.textContent = 'O simulador não está disponível agora. Tente de novo em instantes.';
        erro.hidden = false;
      })
      .finally(() => b.classList.remove('is-busy'));
  });

  Promise.resolve(painel)
    .then((p) => {
      if (!raiz.isConnected) return;
      dadosPainel = p;
      raiz.querySelector('[data-t2m-pres]').innerHTML = blocoPresidente(p);
    })
    .catch(() => {
      if (raiz.isConnected) raiz.querySelector('[data-t2m-pres]').innerHTML = '<div class="t2m__sec">Presidente</div><p class="empty">Não foi possível carregar o resultado do Presidente agora.</p>';
    });

  carregarEleitos()
    .then((d) => {
      if (raiz.isConnected) raiz.querySelector('[data-t2m-gov]').innerHTML = blocoGovernadores(d);
    })
    .catch(() => {
      if (raiz.isConnected) raiz.querySelector('[data-t2m-gov]').innerHTML = '<p class="empty">Não foi possível carregar os governadores agora. Tente de novo em instantes.</p>';
    });
}

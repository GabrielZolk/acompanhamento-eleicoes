// Raio-X do Brasil: indicadores oficiais em séries longas, com faixas por mandato presidencial.
// Regra de neutralidade: todo mandato recebe exatamente o mesmo tratamento visual e textual.
import { esc } from '../format.js';
import { UFS, UF_BY_CODE } from '../ufs.js';
import {
  prepararSerie, prepararMandatos, estatisticasPorMandato, rotuloPeriodo, fmtValor, partesValor,
  variacaoEmPP, dataBR, detectarPeriodicidade,
} from './serie.js';
import { sparkline, graficoCompleto } from './grafico.js';
import { carregarGeo, htmlMapa } from './mapa.js';

const BASE = '/data/indicadores/';

const estado = {
  indice: null,
  mandatos: [],
  dados: new Map(), // id -> { serie, porUF, atualizadoEm } | null (indisponível)
  atual: null, // id do indicador aberto
  uf: '',
  contexto: true,
  grafico: null,
  observador: null,
  origem: null, // cartão que abriu o detalhe (para devolver o foco)
};

const $ = (s, r = document) => r.querySelector(s);
const grade = $('#grade');
const detalhe = $('#detalhe');
const gradeSec = $('#grade-sec');
const reduzMov = matchMedia('(prefers-reduced-motion: reduce)');

async function buscarJSON(url) {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ grade de cartões
function cartaoCarregando(ind) {
  return `<div class="ind ind--carregando" data-id="${esc(ind.id)}">
    <div class="ind__topo"><h2 class="ind__titulo">${esc(ind.titulo)}</h2></div>
    <div class="ind__valor"><span class="ind__num esqueleto">&nbsp;</span></div>
    <div class="ind__spark esqueleto"></div>
  </div>`;
}

function cartao(ind) {
  const d = estado.dados.get(ind.id);
  const pts = d ? prepararSerie(d.serie, ind.periodicidade) : [];
  if (!pts.length) {
    return `<div class="ind ind--off" data-id="${esc(ind.id)}" aria-disabled="true">
      <div class="ind__topo"><h2 class="ind__titulo">${esc(ind.titulo)}</h2></div>
      <p class="ind__indisp">Dados indisponíveis</p>
      <p class="ind__fonte">${esc(ind.fonte || '')}</p>
    </div>`;
  }
  const ult = pts[pts.length - 1];
  const pv = partesValor(ult.v, ind);
  const desde = rotuloPeriodo(pts[0].periodo, ind.periodicidade).replace(/^.*?(\d{4})$/, '$1');
  return `<button type="button" class="ind" data-id="${esc(ind.id)}" aria-label="${esc(`${ind.titulo}: ${fmtValor(ult.v, ind)} em ${rotuloPeriodo(ult.periodo, ind.periodicidade)}. Abrir detalhes`)}">
    <div class="ind__topo">
      <h2 class="ind__titulo">${esc(ind.titulo)}</h2>
      <span class="ind__abrir" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 7h10M8 3l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    </div>
    <div class="ind__valor">
      ${pv.pre ? `<span class="ind__pre">${esc(pv.pre)}</span>` : ''}<span class="ind__num">${esc(pv.num)}</span>${pv.suf ? `<span class="ind__suf">${esc(pv.suf)}</span>` : ''}
    </div>
    <div class="ind__per">${esc(rotuloPeriodo(ult.periodo, ind.periodicidade))} · série desde ${esc(desde)}</div>
    <div class="ind__spark">${sparkline(pts, estado.mandatos, ind, ind.periodicidade)}</div>
    <p class="ind__fonte">Fonte: ${esc(ind.fonte || '')}</p>
  </button>`;
}

function atualizarCartao(ind) {
  const velho = grade.querySelector(`[data-id="${CSS.escape(ind.id)}"]`);
  if (!velho) return;
  const tmp = document.createElement('div');
  tmp.innerHTML = cartao(ind);
  const novo = tmp.firstElementChild;
  novo.style.animationDelay = velho.style.animationDelay;
  velho.replaceWith(novo);
}

grade.addEventListener('click', (ev) => {
  const c = ev.target.closest('button.ind');
  if (!c) return;
  estado.origem = c.dataset.id;
  abrir(c.dataset.id, '', true);
});

// ------------------------------------------------------------------ detalhe
function serieAtual(ind) {
  const d = estado.dados.get(ind.id);
  if (!d) return { pts: [], periodicidade: ind.periodicidade, nome: 'Brasil' };
  if (estado.uf && d.porUF?.[estado.uf]) {
    const s = d.porUF[estado.uf];
    const periodicidade = detectarPeriodicidade(s, 'trimestral');
    return { pts: prepararSerie(s, periodicidade), periodicidade, nome: UF_BY_CODE[estado.uf]?.nome || estado.uf.toUpperCase() };
  }
  return { pts: prepararSerie(d.serie, ind.periodicidade), periodicidade: ind.periodicidade, nome: 'Brasil' };
}

function htmlTabela(ind, pts, periodicidade) {
  const linhas = estatisticasPorMandato(pts, estado.mandatos, ind, periodicidade);
  if (!linhas.length) return `<p class="vazio">Sem dados dentro dos mandatos.</p>`;
  const notas = [];
  const corpo = linhas.map((l) => {
    const m = l.mandato;
    let marca = '';
    if (m.nota) {
      notas.push(m.nota);
      marca = `<sup>${notas.length}</sup>`;
    }
    const cel = (p) => `${esc(fmtValor(p.v, ind))}<small>${esc(rotuloPeriodo(p.periodo, periodicidade))}</small>`;
    return `<tr>
      <th scope="row"><span class="tab__nome">${esc(m.nome)}${marca}${m.emCurso ? ' <em>(em curso)</em>' : ''}</span>${l.cobertura ? `<small class="tab__cob">${esc(l.cobertura)}</small>` : ''}</th>
      <td data-rot="Início">${cel(l.ini)}</td>
      <td data-rot="Fim">${cel(l.fim)}</td>
      <td data-rot="Variação">${esc(l.variacao)}</td>
      <td data-rot="Média">${esc(fmtValor(l.media, ind))}<small>${l.n} ${periodicidade === 'trimestral' ? (l.n > 1 ? 'trimestres' : 'trimestre') : l.n > 1 ? 'meses' : 'mês'}</small></td>
    </tr>`;
  }).join('');
  const expVar = variacaoEmPP(ind)
    ? 'Variação = fim − início, em pontos percentuais (p.p.).'
    : 'Variação = mudança percentual entre o valor do fim e o do início.';
  return `<div class="tab__wrap"><table class="tab">
      <thead><tr><th scope="col">Mandato</th><th scope="col">Início</th><th scope="col">Fim</th><th scope="col">Variação</th><th scope="col">Média do período</th></tr></thead>
      <tbody>${corpo}</tbody>
    </table></div>
    <p class="tab__nota">Início e fim são o primeiro e o último dado com referência dentro de cada mandato (um mês ou trimestre conta para quem governou a maior parte dele). ${expVar} Indicadores acumulados em 12 meses ou 4 trimestres, no começo de um mandato, ainda refletem meses anteriores.</p>
    ${notas.length ? `<ol class="tab__rodape">${notas.map((n) => `<li>${esc(n)}</li>`).join('')}</ol>` : ''}`;
}

// Lista dos períodos de contexto que caem dentro da série (os rótulos no gráfico podem não caber).
function htmlContexto(pts) {
  if (!pts.length) return '';
  const ini = pts[0].periodo, fim = pts[pts.length - 1].periodo;
  const itens = (estado.indice?.contexto || [])
    .filter((c) => c.inicio.slice(0, 7) <= fim && (!c.fim || c.fim.slice(0, 7) >= ini))
    .map((c) => `<b>${esc(c.rotulo)}</b> (${esc(rotuloPeriodo(c.inicio.slice(0, 7), 'mensal'))}${c.fim ? ` a ${esc(rotuloPeriodo(c.fim.slice(0, 7), 'mensal'))}` : ''})`);
  return itens.length ? `<p class="ctx-lista" id="ctx-lista">Contexto: ${itens.join(' · ')}</p>` : '';
}

function htmlDetalhe(ind) {
  const d = estado.dados.get(ind.id);
  const temUF = ind.porUF && d?.porUF && Object.keys(d.porUF).length > 0;
  const { pts, periodicidade, nome } = serieAtual(ind);
  const ult = pts[pts.length - 1];
  const pv = ult ? partesValor(ult.v, ind) : null;
  const opcoes = temUF
    ? `<option value="">Brasil</option>` + UFS.filter((u) => d.porUF[u.uf]).map((u) => `<option value="${u.uf}"${u.uf === estado.uf ? ' selected' : ''}>${esc(u.nome)}</option>`).join('')
    : '';
  const atualizado = d?.atualizadoEm ? rotuloPeriodo(d.atualizadoEm, 'mensal') : '';

  return `<div class="det__barra">
      <button type="button" class="btn btn--voltar" data-acao="fechar"><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M12 7H2M6 3 2 7l4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>Todos os indicadores</button>
      <button type="button" class="btn" data-acao="compartilhar"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>Compartilhar</button>
    </div>
    <div class="det__cab">
      <div>
        <h1 class="det__titulo" id="det-titulo" tabindex="-1">${esc(ind.titulo)}</h1>
        <p class="det__desc">${esc(ind.descricao || '')}</p>
      </div>
      ${ult ? `<div class="det__agora">
        <div class="ind__valor ind__valor--det">${pv.pre ? `<span class="ind__pre">${esc(pv.pre)}</span>` : ''}<span class="ind__num">${esc(pv.num)}</span>${pv.suf ? `<span class="ind__suf">${esc(pv.suf)}</span>` : ''}</div>
        <div class="ind__per">${esc(nome)} · ${esc(rotuloPeriodo(ult.periodo, periodicidade))}</div>
      </div>` : ''}
    </div>
    <div class="det__ctrl">
      ${temUF ? `<label class="campo"><span>Local</span><select id="sel-uf" aria-label="Escolher Brasil ou uma UF">${opcoes}</select></label>` : ''}
      <label class="chk"><input type="checkbox" id="chk-ctx"${estado.contexto ? ' checked' : ''} /> Mostrar contexto</label>
      <span class="det__leg"><span><i class="leg leg--faixa"></i>Faixas: mandatos presidenciais</span><span><i class="leg leg--ctx"></i>Hachurado: períodos de contexto</span></span>
    </div>
    <div class="graf${estado.contexto ? '' : ' graf--sem-ctx'}" id="graf" tabindex="0" aria-describedby="graf-ajuda"></div>
    ${htmlContexto(pts)}
    <p class="graf__ajuda" id="graf-ajuda">Passe o mouse ou toque no gráfico para ver cada valor; no teclado, use as setas.</p>
    <div class="det__baixo${temUF ? ' det__baixo--uf' : ''}">
      <section class="painel" aria-labelledby="tab-titulo">
        <h2 class="painel__titulo" id="tab-titulo">Por mandato${estado.uf ? ` — ${esc(nome)}` : ''}</h2>
        <div id="tabela">${htmlTabela(ind, pts, periodicidade)}</div>
      </section>
      ${temUF ? `<section class="painel" aria-labelledby="mapa-titulo">
        <h2 class="painel__titulo" id="mapa-titulo">${esc(ind.curto || ind.titulo)} por UF</h2>
        <div id="umapa"><p class="carregando">Carregando mapa…</p></div>
      </section>` : ''}
    </div>
    <section class="painel sobre" aria-label="Sobre o indicador">
      ${ind.nota ? `<p><b>Nota metodológica:</b> ${esc(ind.nota)}</p>` : ''}
      <p><b>Fonte:</b> ${ind.fonteUrl ? `<a href="${esc(ind.fonteUrl)}" target="_blank" rel="noopener noreferrer">${esc(ind.fonte || ind.fonteUrl)}</a>` : esc(ind.fonte || '')}${atualizado ? ` · último dado: ${esc(atualizado)}` : ''}${estado.indice?.geradoEm ? ` · dados coletados em ${esc(dataBR(estado.indice.geradoEm))}` : ''}</p>
      <p class="sobre__neutro">As faixas indicam apenas quem ocupava a Presidência em cada período. Os indicadores dependem de muitos fatores (economia mundial, decisões do Banco Central, do Congresso, de estados e municípios) e de efeitos que se estendem por anos.</p>
    </section>`;
}

function desenharGrafico(animar) {
  const ind = indicador(estado.atual);
  const el = $('#graf');
  if (!ind || !el) return;
  estado.grafico?.destruir();
  const { pts, periodicidade, nome } = serieAtual(ind);
  estado.grafico = graficoCompleto(el, {
    pts,
    mandatos: estado.mandatos,
    contexto: estado.indice?.contexto || [],
    ind,
    periodicidade,
    nomeSerie: nome,
    animar: animar && !reduzMov.matches,
  });
}

async function desenharMapa() {
  const ind = indicador(estado.atual);
  const alvo = $('#umapa');
  if (!ind || !alvo) return;
  const geo = await carregarGeo();
  if (indicador(estado.atual) !== ind || !document.body.contains(alvo)) return;
  alvo.innerHTML = htmlMapa(geo, estado.dados.get(ind.id)?.porUF, ind, estado.uf);
}

const indicador = (id) => estado.indice?.indicadores?.find((i) => i.id === id) || null;

function urlDe(id, uf) {
  const p = new URLSearchParams(location.search);
  p.delete('i');
  p.delete('uf');
  if (id) p.set('i', id);
  if (id && uf) p.set('uf', uf);
  const q = p.toString();
  return location.pathname + (q ? '?' + q : '') + location.hash;
}

// Abre o detalhe. "empilhar" = veio de um clique na grade (o botão Voltar do navegador fecha).
function abrir(id, uf = '', empilhar = false) {
  const ind = indicador(id);
  const d = estado.dados.get(id);
  if (!ind || !d || !prepararSerie(d.serie, ind.periodicidade).length) return fechar(false);
  estado.atual = id;
  estado.uf = uf && d.porUF?.[uf] ? uf : '';
  const url = urlDe(id, estado.uf);
  if (empilhar) history.pushState({ dados: 'detalhe' }, '', url);
  else history.replaceState(history.state, '', url);

  detalhe.innerHTML = htmlDetalhe(ind);
  detalhe.hidden = false;
  detalhe.classList.toggle('det--sem-ctx', !estado.contexto);
  gradeSec.hidden = true;
  detalhe.classList.remove('entra');
  void detalhe.offsetWidth;
  detalhe.classList.add('entra');
  document.title = `${ind.titulo} — Raio-X do Brasil`;
  window.scrollTo({ top: 0, behavior: 'instant' });
  desenharGrafico(true);
  desenharMapa();
  observarLargura();
  $('#det-titulo')?.focus({ preventScroll: true });
}

function fechar(voltarHistorico = true) {
  if (voltarHistorico && history.state?.dados === 'detalhe') {
    history.back(); // o popstate cuida de renderizar a grade
    return;
  }
  estado.grafico?.destruir();
  estado.grafico = null;
  estado.observador?.disconnect();
  estado.atual = null;
  estado.uf = '';
  detalhe.hidden = true;
  detalhe.innerHTML = '';
  gradeSec.hidden = false;
  document.title = 'Raio-X do Brasil — Indicadores oficiais por mandato presidencial';
  if (new URLSearchParams(location.search).has('i')) history.replaceState(null, '', urlDe('', ''));
  const c = estado.origem && grade.querySelector(`[data-id="${CSS.escape(estado.origem)}"]`);
  if (c) c.focus({ preventScroll: false });
}

// Troca de UF: atualiza gráfico, tabela, mapa e URL sem recriar a página.
function trocarUF(uf) {
  const ind = indicador(estado.atual);
  if (!ind) return;
  estado.uf = uf || '';
  history.replaceState(history.state, '', urlDe(ind.id, estado.uf));
  const sel = $('#sel-uf');
  if (sel && sel.value !== estado.uf) sel.value = estado.uf;
  const { pts, periodicidade, nome } = serieAtual(ind);
  const ult = pts[pts.length - 1];
  if (ult) {
    const pv = partesValor(ult.v, ind);
    $('.det__agora').innerHTML = `<div class="ind__valor ind__valor--det">${pv.pre ? `<span class="ind__pre">${esc(pv.pre)}</span>` : ''}<span class="ind__num">${esc(pv.num)}</span>${pv.suf ? `<span class="ind__suf">${esc(pv.suf)}</span>` : ''}</div>
      <div class="ind__per">${esc(nome)} · ${esc(rotuloPeriodo(ult.periodo, periodicidade))}</div>`;
  }
  $('#tab-titulo').textContent = `Por mandato${estado.uf ? ` — ${nome}` : ''}`;
  $('#tabela').innerHTML = htmlTabela(ind, pts, periodicidade);
  desenharGrafico(true);
  desenharMapa();
}

function observarLargura() {
  estado.observador?.disconnect();
  const el = $('#graf');
  if (!el || !('ResizeObserver' in window)) return;
  let largura = el.clientWidth;
  let timer = 0;
  estado.observador = new ResizeObserver(() => {
    if (Math.abs(el.clientWidth - largura) < 2) return;
    largura = el.clientWidth;
    clearTimeout(timer);
    timer = setTimeout(() => desenharGrafico(false), 120);
  });
  estado.observador.observe(el);
}

detalhe.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-acao]');
  if (b?.dataset.acao === 'fechar') fechar();
  else if (b?.dataset.acao === 'compartilhar') compartilhar();
  const uf = ev.target.closest('.umapa__uf')?.dataset.uf;
  if (uf) trocarUF(uf === estado.uf ? '' : uf);
});
detalhe.addEventListener('keydown', (ev) => {
  const uf = ev.target.closest?.('.umapa__uf')?.dataset.uf;
  if (uf && (ev.key === 'Enter' || ev.key === ' ')) {
    ev.preventDefault();
    trocarUF(uf === estado.uf ? '' : uf);
    $(`.umapa__uf[data-uf="${uf}"]`)?.focus();
  }
});
detalhe.addEventListener('change', (ev) => {
  if (ev.target.id === 'sel-uf') trocarUF(ev.target.value);
  if (ev.target.id === 'chk-ctx') {
    estado.contexto = ev.target.checked;
    $('#graf')?.classList.toggle('graf--sem-ctx', !estado.contexto);
    detalhe.classList.toggle('det--sem-ctx', !estado.contexto);
  }
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && estado.atual && !ev.defaultPrevented) fechar();
});
window.addEventListener('popstate', () => rotear(false));

// ------------------------------------------------------------------ compartilhar
let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  t.classList.remove('toast--sai');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.add('toast--sai');
    toastTimer = setTimeout(() => (t.hidden = true), 300);
  }, 2400);
}

async function compartilhar() {
  const ind = indicador(estado.atual);
  if (!ind) return;
  const url = `${location.origin}/dados?i=${encodeURIComponent(ind.id)}${estado.uf ? `&uf=${estado.uf}` : ''}`;
  const titulo = `${ind.titulo}${estado.uf ? ` — ${UF_BY_CODE[estado.uf]?.nome || ''}` : ''} | Raio-X do Brasil`;
  // A folha de compartilhamento nativa só no toque (no desktop, copiar é mais direto).
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title: titulo, url });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copiado');
  } catch {
    toast(`Copie o link: ${url}`);
  }
}

// ------------------------------------------------------------------ início
function rotear(inicial) {
  const p = new URLSearchParams(location.search);
  const id = p.get('i');
  if (id && indicador(id) && estado.dados.get(id)) abrir(id, (p.get('uf') || '').toLowerCase(), false);
  else if (estado.atual || inicial) fechar(false);
}

async function iniciar() {
  const indice = await buscarJSON(BASE + 'indice.json');
  if (!indice?.indicadores?.length) {
    grade.innerHTML = `<p class="vazio">Dados indisponíveis no momento. Tente novamente mais tarde.</p>`;
    return;
  }
  estado.indice = indice;
  estado.mandatos = prepararMandatos(indice.mandatos);
  if (indice.geradoEm) $('#rodape-data').textContent = `Dados coletados em ${dataBR(indice.geradoEm)}.`;

  grade.innerHTML = indice.indicadores.map(cartaoCarregando).join('');
  grade.querySelectorAll('.ind').forEach((c, i) => (c.style.animationDelay = `${Math.min(i, 12) * 0.05}s`));

  const idPedido = new URLSearchParams(location.search).get('i');
  await Promise.all(
    indice.indicadores.map(async (ind) => {
      const j = ind.arquivo ? await buscarJSON(BASE + ind.arquivo) : null;
      estado.dados.set(ind.id, j && Array.isArray(j.serie) ? { serie: j.serie, porUF: j.porUF || null, atualizadoEm: j.atualizadoEm || null } : null);
      atualizarCartao(ind);
      // Link direto: abre assim que o indicador pedido chega, sem esperar os demais.
      if (ind.id === idPedido && !estado.atual) rotear(false);
    }),
  );
  if (idPedido && !estado.atual) rotear(true);
}

iniciar();

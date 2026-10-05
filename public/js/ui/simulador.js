// Simulador do 2º turno de Presidente: quem acessa decide para onde vão os votos de quem ficou de
// fora no 1º turno (eliminados, brancos e nulos e, se quiser, a abstenção) e vê o resultado mudar
// na hora. Ponto de partida: os votos do 1º turno de cada finalista, que repetem o voto.
// O site precisa ser neutro: os cenários prontos são só aritméticos (proporcional, metade para cada,
// ninguém transfere) e o aviso "não é pesquisa nem projeção" fica sempre à vista, inclusive na imagem.
// Para abrir pelo console: import('/js/ui/simulador.js').then((m) => fetch('/api/painel?cargo=presidente')
//   .then((r) => r.json()).then((painel) => m.abrirSimulador({ painel })))
import { int, pct, esc, nomeProprio, compacto, mix } from '../format.js';
import { avatar, ICON } from './common.js';
import { nomeCurto } from './projecoes.js';
import * as modal from './modais.js';

const MIN_PCT = 0.5; // eliminados com menos que isso (% dos válidos) entram juntos em "Outros"
const EMPATE = 0.5; // diferença (em pontos) abaixo da qual o cenário dá "empate técnico"
const DATA_2T = '25 de outubro';
const CINZA = '#94a3b8';
const W = 1080, H = 1350; // imagem 4:5, como a de compartilhar.js

const PRESETS = [
  ['proporcional', 'Proporcional ao 1º turno'],
  ['metade', 'Metade para cada'],
  ['ninguem', 'Ninguém transfere'],
  ['zerar', 'Zerar'],
];

const ICONES = {
  outros: ICON.people,
  brancos: `<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="2.5" width="12" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M7 7h6M7 10h6M7 13h3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  abstencao: `<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 9.2 10 3.5l7 5.7V16a1.2 1.2 0 0 1-1.2 1.2H4.2A1.2 1.2 0 0 1 3 16Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 17.2v-5h4v5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  aviso: `<svg width="16" height="16" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 6v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="10" cy="13.9" r="1.1" fill="currentColor"/></svg>`,
};

// ------------------------------------------------------------------ cálculo (sem DOM)

// Os dois do 2º turno: marcados pelo TSE ("2º turno") ou pela garantia matemática do servidor;
// sem marcação, os dois mais votados. O primeiro é o mais votado no 1º turno (fica à esquerda).
export function finalistas(candidatos = []) {
  const ord = [...candidatos].sort((x, y) => (y.votos || 0) - (x.votos || 0));
  const marcados = ord.filter((c) => /2º turno/i.test(c.situacao || '') || c.garantido === 'segundoTurno');
  return (marcados.length >= 2 ? marcados : ord).slice(0, 2);
}

// Votos que a pessoa distribui: cada eliminado com ≥ 0,5% dos válidos, os menores juntos em
// "Outros", os brancos e nulos e (opcional, desligada no início) a abstenção do 1º turno.
export function montarFontes(nacional, [a, b]) {
  const votos = nacional.votos || {};
  const validos = votos.validos || 0;
  const pctDe = (c) => c.pct ?? (validos ? (c.votos / validos) * 100 : 0);
  const fora = (nacional.candidatos || []).filter((c) => c.n !== a.n && c.n !== b.n && c.votos > 0).sort((x, y) => y.votos - x.votos);
  const grandes = fora.filter((c) => pctDe(c) >= MIN_PCT);
  let menores = fora.filter((c) => pctDe(c) < MIN_PCT);
  // Um só abaixo do corte não vira "Outros": fica com o próprio nome.
  if (menores.length === 1) {
    grandes.push(menores[0]);
    menores = [];
  }
  const fontes = grandes.map((c) => ({
    id: `c${c.n}`,
    tipo: 'candidato',
    nome: nomeProprio(c.nome),
    det: `${c.partido} · ${int(c.votos)} votos · ${pct(pctDe(c))}`,
    votos: c.votos,
    cor: c.cor || CINZA,
    cand: c,
  }));
  if (menores.length) {
    const soma = menores.reduce((s, c) => s + c.votos, 0);
    const nomes = menores.slice(0, 3).map((c) => nomeProprio(c.nome)).join(', ');
    fontes.push({
      id: 'outros',
      tipo: 'outros',
      nome: `Outros candidatos (${menores.length})`,
      curto: `Outros (${menores.length})`,
      det: `${nomes}${menores.length > 3 ? ` e mais ${menores.length - 3}` : ''} · ${int(soma)} votos · ${pct(validos ? (soma / validos) * 100 : 0)}`,
      votos: soma,
      cor: CINZA,
    });
  }
  const bn = (votos.brancos || 0) + (votos.nulos || 0);
  if (bn > 0) {
    fontes.push({
      id: 'brancos',
      tipo: 'brancos',
      nome: 'Brancos e nulos do 1º turno',
      curto: 'Brancos e nulos',
      det: `${int(votos.brancos)} brancos · ${int(votos.nulos)} nulos`,
      votos: bn,
      cor: '#64748b',
    });
  }
  const el = nacional.eleitorado;
  if (el?.abstencao > 0) {
    const pa = el.pctAbstencao ?? (el.abstencao / (el.abstencao + (el.comparecimento || 0))) * 100;
    fontes.push({
      id: 'abstencao',
      tipo: 'abstencao',
      nome: 'Abstenção do 1º turno',
      curto: 'Abstenção',
      det: `${int(el.abstencao)} eleitores não votaram · ${pct(pa)} do eleitorado`,
      votos: el.abstencao,
      cor: '#475569',
      opcional: true,
    });
  }
  return fontes;
}

// Estado de cada fonte: lado = % que vai para o 2º finalista (direita do controle; o resto vai para
// o 1º), participa = % que vota em um dos dois (o resto vira branco, nulo ou abstenção).
export function novoEstado(fontes) {
  return Object.fromEntries(fontes.map((f) => [f.id, { lado: 50, participa: 0, ativo: !f.opcional }]));
}

// Cenários prontos, todos aritméticos. Quem votou branco/nulo ou não foi votar continua assim
// (participa = 0) até a pessoa mudar a linha.
export function aplicarPreset(nome, fontes, cfg, [a, b]) {
  const prop = a.votos + b.votos > 0 ? (b.votos / (a.votos + b.votos)) * 100 : 50;
  for (const f of fontes) {
    const s = cfg[f.id];
    const eleitores = f.tipo === 'candidato' || f.tipo === 'outros';
    if (nome === 'proporcional' || nome === 'metade') {
      s.lado = nome === 'metade' ? 50 : prop;
      s.participa = eleitores ? 100 : 0;
    } else if (nome === 'ninguem') {
      s.participa = 0;
    } else if (nome === 'zerar') {
      Object.assign(s, { lado: 50, participa: 0, ativo: !f.opcional });
    }
  }
  return cfg;
}

export function calcular(fontes, cfg, [a, b]) {
  let va = a.votos, vb = b.votos, fora = 0;
  const porFonte = {};
  for (const f of fontes) {
    const s = cfg[f.id];
    const p = s.ativo ? s.participa / 100 : 0;
    const paraB = f.votos * p * (s.lado / 100);
    const paraA = f.votos * p - paraB;
    const resto = f.votos - paraA - paraB;
    va += paraA;
    vb += paraB;
    fora += resto;
    porFonte[f.id] = { paraA, paraB, fora: resto };
  }
  const validos = va + vb;
  const pa = validos > 0 ? (va / validos) * 100 : 50;
  const pb = 100 - pa;
  const dif = Math.abs(pa - pb);
  // Percentuais exibidos com 1 casa e somando 100,0.
  const pa1 = Math.round(pa * 10) / 10;
  const pb1 = Math.round((100 - pa1) * 10) / 10;
  return { va, vb, validos, pa, pb, pa1, pb1, dif, fora, porFonte, vencedor: dif < EMPATE ? null : pa > pb ? a : b };
}

const pontos = (v) => {
  const r = Math.round(v * 10) / 10;
  return `${r.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${r >= 2 ? 'pontos' : 'ponto'}`;
};

// "No seu cenário, Fulano venceria com X%" (ou empate técnico). quem: "seu" na tela, "meu" na imagem.
export function frase(r, nomes, quem = 'seu') {
  if (!r.vencedor) return `No ${quem} cenário, daria <b>empate técnico</b>: diferença de ${pontos(r.dif)}`;
  const ganhaA = r.pa > r.pb;
  return `No ${quem} cenário, <b class="sim__quem" style="--c:${ganhaA ? r.corA : r.corB}">${esc(ganhaA ? nomes.a : nomes.b)}</b> venceria com <b>${pct(ganhaA ? r.pa1 : r.pb1)}</b> dos votos válidos`;
}

// ------------------------------------------------------------------ modal

function linhaFonte(f, curto) {
  const ico = f.tipo === 'candidato' ? avatar(f.cand, 'avatar--sm') : `<span class="sim__ico">${ICONES[f.tipo]}</span>`;
  const id = `sim-${f.id}`;
  return `<div class="sim__fonte ${f.opcional ? 'is-off' : ''}" data-f="${f.id}" style="--c:${f.cor}">
    <div class="sim__fhead">${ico}
      <div class="sim__finfo"><div class="sim__fnome" id="${id}" title="${esc(f.nome)}">${esc(f.nome)}</div><div class="sim__fsub" title="${esc(f.det)}">${esc(f.det)}</div></div>
      ${f.opcional ? `<label class="sim__switch"><input type="checkbox" role="switch" data-ativo aria-describedby="${id}"><i aria-hidden="true"></i><span>Incluir</span></label>` : ''}
    </div>
    <div class="sim__fcorpo" ${f.opcional ? 'hidden' : ''}>
      <div class="sim__linha sim__linha--lado">
        <span class="sim__rot" aria-hidden="true">Para quem vai</span>
        <div class="sim__lctrl">
          <span class="sim__ponta"><small>${esc(curto.a)}</small><b data-pa></b></span>
          <span class="sim__slider sim__slider--lado"><input class="sim__range" type="range" min="0" max="100" step="1" data-lado aria-label="Para quem vão os votos: ${esc(f.nome)}"></span>
          <span class="sim__ponta sim__ponta--b"><small>${esc(curto.b)}</small><b data-pb></b></span>
        </div>
      </div>
      <div class="sim__linha">
        <span class="sim__rot" aria-hidden="true">Votam em um dos dois</span>
        <div class="sim__pctrl">
          <span aria-hidden="true"></span>
          <span class="sim__slider"><input class="sim__range sim__range--part" type="range" min="0" max="100" step="1" data-part aria-label="Quantos votam em um dos dois: ${esc(f.nome)}"></span>
          <b data-pp></b>
        </div>
      </div>
      <div class="sim__leg" aria-hidden="true">
        <span style="--c:var(--ca)"><i></i>${esc(curto.a)} <b data-la></b></span>
        <span style="--c:var(--cb)"><i></i>${esc(curto.b)} <b data-lb></b></span>
        <span class="sim__leg-f"><i></i>Nenhum dos dois <b data-lf></b></span>
      </div>
    </div>
    <div class="sim__tira" aria-hidden="true"><i class="sim__ta"></i><i class="sim__tb"></i></div>
  </div>`;
}

function ladoPlacar(c, nome, k) {
  return `<div class="sim__lado sim__lado--${k}" data-lado-${k} style="--c:${c.cor}">
    <div class="sim__ltopo">${avatar(c)}<span class="sim__venc">Venceria</span></div>
    <div class="sim__lnome" title="${esc(nome)}">${esc(nome)}</div>
    <div class="sim__lpart">${esc(c.partido || '')}</div>
    <div class="sim__lpct" data-pct-${k}></div>
    <div class="sim__lvotos" data-votos-${k}></div>
  </div>`;
}

export function abrirSimulador({ painel } = {}) {
  const nac = painel?.nacional;
  const par = finalistas(nac?.candidatos);
  if (par.length < 2 || !(par[0].votos > 0 && par[1].votos > 0)) {
    modal.abrir(`<h3 id="modal-title">Simulador do 2º turno</h3>
      <p class="empty">Ainda não há votos suficientes do 1º turno para simular o 2º turno.</p>`);
    return;
  }
  const [a0, b0] = par;
  const a = { ...a0, cor: a0.cor || '#3d7bf5' };
  const b = { ...b0, cor: b0.cor || '#ef4b55' };
  const dupla = [a, b];
  const fontes = montarFontes(nac, dupla);
  const cfg = aplicarPreset('proporcional', fontes, novoEstado(fontes), dupla);
  const nomes = { a: nomeProprio(a.nome), b: nomeProprio(b.nome) };
  const curto = { a: nomeCurto(a.nome), b: nomeCurto(b.nome) };
  const secoes = nac.secoes?.pct || 0;
  const final = painel.status === 'finalizado' || secoes >= 100;
  const apurado = final ? 'resultado final do 1º turno' : `1º turno com ${pct(secoes, 2)} das seções apuradas`;
  const st = { preset: 'proporcional', mostrado: undefined, r: null, anuncio: 0, volta: 0 };
  const propA = (a.votos / (a.votos + b.votos)) * 100;

  modal.abrir(
    `<div class="sim" style="--ca:${a.cor};--cb:${b.cor}">
      <div class="sim__topo">
        <span class="sim__kicker">Presidente · 2º turno · ${DATA_2T}</span>
        <h3 id="modal-title">Simulador do 2º turno</h3>
        <p class="card__sub">Decida para onde vão os votos de quem não passou ao 2º turno e veja quem venceria entre ${esc(nomes.a)} e ${esc(nomes.b)}.</p>
        <p class="sim__aviso">${ICONES.aviso}<span><b>Simulação feita por você;</b> não é pesquisa nem projeção.</span></p>
      </div>
      <div class="sim__grade">
        <div class="sim__ctrl">
          <div class="sim__presets" role="group" aria-label="Cenários prontos">${PRESETS.map(([k, t]) => `<button type="button" class="sim__preset" data-preset="${k}" aria-pressed="false">${t}</button>`).join('')}</div>
          <p class="sim__desc" data-desc></p>
          <div class="sim__fontes">${fontes.map((f) => linhaFonte(f, curto)).join('')}</div>
          <p class="nota">Ponto de partida: ${apurado} (dados oficiais do TSE). Quem votou em ${esc(nomes.a)} ou em ${esc(nomes.b)} repete o voto. Percentuais sobre os votos válidos, como no TSE.</p>
        </div>
        <div class="sim__res">
          <div class="sim__placar">
            <div class="sim__duelo">${ladoPlacar(a, nomes.a, 'a')}<span class="sim__x" aria-hidden="true">×</span>${ladoPlacar(b, nomes.b, 'b')}</div>
            <div class="sim__barra" role="img" data-barra><i class="sim__ba" data-ba></i><i class="sim__bb" data-bb></i><span class="sim__meio" aria-hidden="true"><span>50%</span></span></div>
            <p class="sim__frase" data-frase></p>
            <p class="sim__selo">Simulação · não é pesquisa nem projeção</p>
          </div>
          <div class="sim__det">
            <div class="sim__stat"><span>Votos válidos</span><b data-validos></b></div>
            <div class="sim__stat"><span>Diferença</span><b data-dif></b></div>
            <div class="sim__stat"><span>Brancos, nulos e abstenção</span><b data-fora></b></div>
            <button type="button" class="sim__share" data-share>${ICON.share}<span data-share-txt>Compartilhar meu cenário</span></button>
          </div>
        </div>
      </div>
      <p class="sim__sr" aria-live="polite" data-anuncio></p>
    </div>`,
    {
      onClose: () => {
        clearTimeout(st.anuncio);
        clearTimeout(st.volta);
      },
    },
  );
  const raiz = modal.corpo.querySelector('.sim');
  const $ = (s, el = raiz) => el.querySelector(s);
  const refs = Object.fromEntries(
    fontes.map((f) => {
      const el = $(`[data-f="${f.id}"]`);
      return [f.id, { el, corpo: $('.sim__fcorpo', el), lado: $('[data-lado]', el), part: $('[data-part]', el), ativo: $('[data-ativo]', el), pa: $('[data-pa]', el), pb: $('[data-pb]', el), pp: $('[data-pp]', el), la: $('[data-la]', el), lb: $('[data-lb]', el), lf: $('[data-lf]', el), ta: $('.sim__ta', el), tb: $('.sim__tb', el) }];
    }),
  );
  const pl = {
    ladoA: $('[data-lado-a]'), ladoB: $('[data-lado-b]'), pctA: $('[data-pct-a]'), pctB: $('[data-pct-b]'), votosA: $('[data-votos-a]'), votosB: $('[data-votos-b]'),
    barra: $('[data-barra]'), ba: $('[data-ba]'), bb: $('[data-bb]'), frase: $('[data-frase]'), validos: $('[data-validos]'), dif: $('[data-dif]'), fora: $('[data-fora]'),
  };

  const descricao = {
    proporcional: `Os votos de cada eliminado se dividem como os dois dividiram o 1º turno: ${pct(propA)} para ${esc(curto.a)} e ${pct(100 - propA)} para ${esc(curto.b)}. Quem votou branco ou nulo continua assim.`,
    metade: 'Metade dos votos de cada eliminado vai para cada finalista. Quem votou branco ou nulo continua assim.',
    ninguem: 'Ninguém que votou em outro candidato escolhe um dos dois: fica o placar do 1º turno entre eles.',
    zerar: 'Tudo no meio e ninguém votando em um dos dois. Monte o seu cenário linha a linha.',
  };

  // Valores dos controles a partir do estado (presets e abertura).
  function sincronizar() {
    for (const f of fontes) {
      const s = cfg[f.id], ref = refs[f.id];
      ref.lado.value = s.lado;
      ref.part.value = s.participa;
      if (ref.ativo) ref.ativo.checked = s.ativo;
      ref.corpo.hidden = !s.ativo;
      ref.el.classList.toggle('is-off', !s.ativo);
    }
  }

  function atualizarFonte(f, pf) {
    const s = cfg[f.id], ref = refs[f.id];
    const ia = Math.round(100 - s.lado), ib = 100 - ia;
    ref.pa.textContent = `${ia}%`;
    ref.pb.textContent = `${ib}%`;
    ref.pp.textContent = `${Math.round(s.participa)}%`;
    ref.lado.style.setProperty('--th', mix(a.cor, b.cor, s.lado / 100));
    ref.lado.setAttribute('aria-valuetext', `${ia}% para ${curto.a}, ${ib}% para ${curto.b}`);
    ref.part.style.setProperty('--v', `${s.participa}%`);
    ref.part.setAttribute('aria-valuetext', `${Math.round(s.participa)}% votam em um dos dois; ${100 - Math.round(s.participa)}% em nenhum`);
    ref.el.classList.toggle('is-zero', !(s.participa > 0));
    const mais = (v) => `+${compacto(v)}`;
    ref.la.textContent = mais(pf.paraA);
    ref.lb.textContent = mais(pf.paraB);
    ref.lf.textContent = compacto(pf.fora);
    ref.ta.style.width = `${(pf.paraA / f.votos) * 100}%`;
    ref.tb.style.width = `${(pf.paraB / f.votos) * 100}%`;
  }

  function placar(r) {
    const ganhaA = r.vencedor === a, ganhaB = r.vencedor === b;
    pl.pctA.textContent = pct(r.pa1);
    pl.pctB.textContent = pct(r.pb1);
    pl.votosA.textContent = `${int(r.va)} votos`;
    pl.votosB.textContent = `${int(r.vb)} votos`;
    pl.ladoA.classList.toggle('is-win', ganhaA);
    pl.ladoB.classList.toggle('is-win', ganhaB);
    pl.ba.style.width = `calc(${r.pa}% - 1.5px)`;
    pl.bb.style.width = `calc(${r.pb}% - 1.5px)`;
    pl.ba.classList.toggle('is-win', ganhaA);
    pl.bb.classList.toggle('is-win', ganhaB);
    pl.barra.setAttribute('aria-label', `${nomes.a} ${pct(r.pa1)}, ${nomes.b} ${pct(r.pb1)} dos votos válidos`);
    pl.frase.innerHTML = frase({ ...r, corA: a.cor, corB: b.cor }, nomes);
    pl.validos.textContent = int(r.validos);
    pl.dif.textContent = `${int(Math.abs(r.va - r.vb))} votos · ${pontos(r.dif)}`;
    pl.fora.textContent = int(r.fora);
  }

  // Recalcula tudo a cada movimento: são poucas linhas, cabe folgado num quadro.
  function atualizar() {
    if (!raiz.isConnected) return;
    const r = (st.r = calcular(fontes, cfg, dupla));
    for (const f of fontes) atualizarFonte(f, r.porFonte[f.id]);
    placar(r);
    if (st.mostrado !== st.preset) {
      st.mostrado = st.preset;
      raiz.querySelectorAll('[data-preset]').forEach((bt) => bt.setAttribute('aria-pressed', String(bt.dataset.preset === st.preset)));
      $('[data-desc]').innerHTML = st.preset ? descricao[st.preset] : '<b>Cenário personalizado.</b> Use os botões acima para recomeçar de um cenário pronto.';
    }
    // Leitores de tela: anuncia o resultado só depois que a pessoa para de mexer.
    clearTimeout(st.anuncio);
    st.anuncio = setTimeout(() => {
      if (raiz.isConnected) $('[data-anuncio]').textContent = pl.frase.textContent;
    }, 900);
  }

  $('.sim__presets').addEventListener('click', (ev) => {
    const bt = ev.target.closest('[data-preset]');
    if (!bt) return;
    st.preset = bt.dataset.preset;
    aplicarPreset(st.preset, fontes, cfg, dupla);
    sincronizar();
    atualizar();
  });
  $('.sim__fontes').addEventListener('input', (ev) => {
    const el = ev.target.closest('[data-f]');
    if (!el || !ev.target.matches('[data-lado], [data-part]')) return;
    const s = cfg[el.dataset.f];
    if (ev.target.matches('[data-lado]')) s.lado = Number(ev.target.value);
    else s.participa = Number(ev.target.value);
    st.preset = null;
    atualizar();
  });
  $('.sim__fontes').addEventListener('change', (ev) => {
    if (!ev.target.matches('[data-ativo]')) return;
    const id = ev.target.closest('[data-f]').dataset.f;
    cfg[id].ativo = ev.target.checked;
    st.preset = null;
    sincronizar();
    atualizar();
    if (cfg[id].ativo) refs[id].part.focus();
  });

  const botao = $('[data-share]'), rotulo = $('[data-share-txt]');
  botao.addEventListener('click', async () => {
    if (botao.disabled || !st.r) return;
    clearTimeout(st.volta);
    botao.disabled = true;
    rotulo.textContent = 'Gerando imagem…';
    let fim = 'Compartilhar meu cenário';
    try {
      const res = await compartilharCenario({ dupla, nomes, curto, r: st.r, fontes, cfg, apurado });
      if (res === 'baixado') fim = 'Imagem baixada';
      else if (res === 'compartilhado') fim = 'Cenário compartilhado';
    } catch {
      fim = 'Não foi possível gerar a imagem';
    }
    if (!botao.isConnected) return;
    botao.disabled = false;
    rotulo.textContent = fim;
    st.volta = setTimeout(() => {
      if (botao.isConnected) rotulo.textContent = 'Compartilhar meu cenário';
    }, 2600);
  });

  sincronizar();
  atualizar();
}

// ------------------------------------------------------------------ imagem para compartilhar
// Mesmo estilo de compartilhar.js (4:5, fundo escuro, sem fotos: o TSE não libera CORS para canvas).

function retangulo(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function encurtar(ctx, texto, largura) {
  let t = texto;
  while (ctx.measureText(t).width > largura && t.length > 4) t = t.slice(0, -2) + '…';
  return t;
}

function quebrar(ctx, texto, largura) {
  const linhas = [];
  let atual = '';
  for (const p of texto.split(' ')) {
    const t = atual ? `${atual} ${p}` : p;
    if (atual && ctx.measureText(t).width > largura) {
      linhas.push(atual);
      atual = p;
    } else atual = t;
  }
  if (atual) linhas.push(atual);
  return linhas;
}

export async function gerarImagemCenario({ dupla, nomes, curto, r, fontes, cfg, apurado }) {
  await Promise.all(['400', '600', '700'].map((p) => document.fonts.load(`${p} 40px Inter`).catch(() => {})));
  const [a, b] = dupla;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  const F = (peso, tam) => `${peso} ${tam}px Inter, system-ui, sans-serif`;
  const ganhaA = r.vencedor === a, ganhaB = r.vencedor === b;

  // fundo
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0e1420');
  g.addColorStop(1, '#090c12');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const brilho = (x, y, raio, cor) => {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, raio);
    rg.addColorStop(0, cor);
    rg.addColorStop(1, 'transparent');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, W, H);
  };
  brilho(180, 380, 560, `${a.cor}${ganhaA ? '33' : '22'}`);
  brilho(900, 380, 560, `${b.cor}${ganhaB ? '33' : '22'}`);

  // cabeçalho
  ctx.fillStyle = '#8a93a6';
  ctx.font = F(600, 30);
  ctx.fillText('APURAÇÃO ELEITORAL 2026', 72, 112);
  ctx.fillStyle = '#ffffff';
  ctx.font = F(700, 64);
  ctx.fillText('Simulação do 2º turno', 72, 196);
  ctx.font = F(600, 40);
  ctx.fillStyle = '#c9cfdb';
  ctx.fillText(`Presidente · ${DATA_2T}`, 72, 252);

  // aviso de simulação
  let tam = 24;
  const aviso = 'SIMULAÇÃO FEITA POR MIM · NÃO É PESQUISA NEM PROJEÇÃO';
  ctx.font = F(700, tam);
  while (ctx.measureText(aviso).width > W - 144 - 64 && tam > 16) ctx.font = F(700, --tam);
  const aw = ctx.measureText(aviso).width + 64;
  retangulo(ctx, 72, 282, aw, 50, 25);
  ctx.fillStyle = 'rgba(245, 177, 61, 0.14)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(245, 177, 61, 0.55)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(72 + 26, 307, 6, 0, Math.PI * 2);
  ctx.fillStyle = '#f5b13d';
  ctx.fill();
  ctx.fillStyle = '#f5c46b';
  ctx.fillText(aviso, 72 + 44, 307 + tam * 0.36);

  // os dois finalistas
  const cw = (W - 144 - 24) / 2, ch = 244, cy = 360;
  [[a, nomes.a, r.pa1, r.va, ganhaA], [b, nomes.b, r.pb1, r.vb, ganhaB]].forEach(([c, nome, p, v, ganha], i) => {
    const x = 72 + i * (cw + 24);
    retangulo(ctx, x, cy, cw, ch, 28);
    ctx.fillStyle = ganha ? `${c.cor}26` : '#121824';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = ganha ? `${c.cor}99` : '#1f2735';
    ctx.stroke();
    ctx.font = F(700, 38);
    ctx.fillStyle = '#fff';
    ctx.fillText(encurtar(ctx, nome, cw - 64), x + 32, cy + 60);
    ctx.font = F(600, 26);
    ctx.fillStyle = c.cor;
    ctx.fillText(c.partido || '', x + 32, cy + 96);
    ctx.font = F(700, 80);
    ctx.fillStyle = '#fff';
    if (ganha) {
      ctx.shadowColor = c.cor;
      ctx.shadowBlur = 28;
    }
    ctx.fillText(pct(p), x + 30, cy + 176);
    ctx.shadowBlur = 0;
    ctx.font = F(400, 24);
    ctx.fillStyle = '#8a93a6';
    ctx.fillText(`${int(v)} votos`, x + 32, cy + 218);
    // selo no canto de baixo, longe do nome (que pode ser longo)
    if (ganha) {
      ctx.font = F(700, 20);
      const pw = ctx.measureText('VENCERIA').width + 36;
      retangulo(ctx, x + cw - 26 - pw, cy + ch - 26 - 38, pw, 38, 19);
      ctx.fillStyle = c.cor;
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText('VENCERIA', x + cw - 26 - pw + 18, cy + ch - 26 - 12);
    }
  });

  // barra A × B com a marca dos 50%
  const by = 632, bw = W - 144, wa = Math.max(16, Math.min(bw - 22, (bw * r.pa) / 100));
  [[72, wa - 3, a.cor, ganhaA], [72 + wa + 3, bw - wa - 3, b.cor, ganhaB]].forEach(([x, w, cor, ganha]) => {
    retangulo(ctx, x, by, w, 30, 15);
    ctx.fillStyle = cor;
    ctx.shadowColor = cor;
    ctx.shadowBlur = ganha ? 22 : 0;
    ctx.fill();
    ctx.shadowBlur = 0;
  });
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.beginPath();
  ctx.moveTo(W / 2, by - 10);
  ctx.lineTo(W / 2, by + 40);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = F(600, 20);
  ctx.fillStyle = '#8a93a6';
  ctx.textAlign = 'center';
  ctx.fillText('50%', W / 2, by + 66);
  ctx.textAlign = 'left';

  // veredito
  ctx.font = F(600, 26);
  ctx.fillStyle = '#8a93a6';
  ctx.fillText('NO MEU CENÁRIO', 72, 744);
  const venc = r.vencedor ? `${ganhaA ? nomes.a : nomes.b} venceria com ${pct(ganhaA ? r.pa1 : r.pb1)} dos votos válidos` : `Empate técnico: diferença de ${pontos(r.dif)}`;
  ctx.font = F(700, 46);
  ctx.fillStyle = '#fff';
  quebrar(ctx, venc, W - 144)
    .slice(0, 2)
    .forEach((l, i) => ctx.fillText(l, 72, 798 + i * 56));

  // como os votos foram divididos
  const linhas = fontes.filter((f) => cfg[f.id].ativo).slice(0, 6);
  ctx.font = F(600, 24);
  ctx.fillStyle = '#8a93a6';
  ctx.fillText('COMO DIVIDI OS VOTOS', 72, 920);
  // legenda à direita do título
  ctx.font = F(500, 22);
  const leg = [[curto.a, a.cor], [curto.b, b.cor], ['Nenhum dos dois', '#2f3749']];
  let lx = W - 72;
  for (const [t, cor] of [...leg].reverse()) {
    const tw = ctx.measureText(t).width;
    lx -= tw;
    ctx.fillStyle = '#c9cfdb';
    ctx.fillText(t, lx, 920);
    lx -= 26;
    retangulo(ctx, lx, 904, 16, 16, 4);
    ctx.fillStyle = cor;
    ctx.fill();
    lx -= 22;
  }
  const bx = 440, bl = W - 72 - 100 - bx;
  linhas.forEach((f, i) => {
    const y = 946 + i * 45;
    const pf = r.porFonte[f.id];
    ctx.font = F(600, 26);
    ctx.fillStyle = '#e6eaf2';
    ctx.fillText(encurtar(ctx, f.curto || f.nome, bx - 72 - 24), 72, y + 28);
    retangulo(ctx, bx, y + 12, bl, 18, 9);
    ctx.fillStyle = '#2f3749';
    ctx.fill();
    ctx.save();
    retangulo(ctx, bx, y + 12, bl, 18, 9);
    ctx.clip();
    const w1 = (bl * pf.paraA) / f.votos, w2 = (bl * pf.paraB) / f.votos;
    ctx.fillStyle = a.cor;
    ctx.fillRect(bx, y + 12, w1, 18);
    ctx.fillStyle = b.cor;
    ctx.fillRect(bx + w1, y + 12, w2, 18);
    ctx.restore();
    ctx.font = F(400, 22);
    ctx.fillStyle = '#8a93a6';
    ctx.textAlign = 'right';
    ctx.fillText(compacto(f.votos), W - 72, y + 28);
    ctx.textAlign = 'left';
  });

  // rodapé
  ctx.font = F(400, 24);
  ctx.fillStyle = '#8a93a6';
  ctx.fillText(encurtar(ctx, `Ponto de partida: ${apurado} · dados do TSE`, W - 144), 72, H - 92);
  ctx.font = F(400, 30);
  const conv = 'Faça a sua simulação em ';
  ctx.fillText(conv, 72, H - 48);
  const cx = 72 + ctx.measureText(conv).width;
  ctx.font = F(700, 30);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(location.host, cx, H - 48);

  const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
  const placar = `${nomes.a} ${pct(r.pa1)} × ${pct(r.pb1)} ${nomes.b}`;
  return { blob, arquivo: 'simulacao-2-turno-presidente-2026.png', texto: `Minha simulação do 2º turno: ${placar}. Simulação feita por mim; não é pesquisa nem projeção.` };
}

// Celular: compartilhamento nativo com a imagem. Computador (ou sem suporte): baixa o PNG.
export async function compartilharCenario(dados) {
  const { blob, arquivo, texto } = await gerarImagemCenario(dados);
  const file = new File([blob], arquivo, { type: 'image/png' });
  const url = location.origin + location.pathname;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Simulação do 2º turno', text: `${texto}\nFaça a sua: ${url}` });
      return 'compartilhado';
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelado';
    }
  }
  const el = document.createElement('a');
  el.href = URL.createObjectURL(blob);
  el.download = arquivo;
  document.body.appendChild(el);
  el.click();
  setTimeout(() => {
    URL.revokeObjectURL(el.href);
    el.remove();
  }, 1000);
  return 'baixado';
}

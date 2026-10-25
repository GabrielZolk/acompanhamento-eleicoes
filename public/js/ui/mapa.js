import { esc, pct, mix, nomeProprio } from '../format.js';
import { UF_BY_CODE } from '../ufs.js';
import { morph } from '../morph.js';
import { estado2022, municipio2022, brasilSemExterior2022, candidatosPorPartido, comparar, pp, turno2022, aoCarregar2022, definirTurno2026 } from '../compara2022.js';

const SEM = '#2c313c';
const ESCURO = '#0e131c';
// Área de conteúdo do mapa em unidades do SVG (inclui as caixas de rótulo à direita).
const CONTEUDO = { x: -40, y: -16, w: 1150, h: 1000 };
// Estados pequenos ganham rótulo em caixa, ligado por uma linha.
const CAIXAS = {
  rn: [1046, 250], pb: [1046, 294], pe: [1046, 338], al: [1046, 382], se: [1046, 426],
  es: [884, 652], rj: [748, 772], df: [692, 496],
};
const AJUSTE = { go: [-22, 26], pi: [-6, 16], ma: [-16, 8], ce: [-2, 0], ap: [-2, 8], sc: [8, 0], mg: [8, 4], ba: [4, 8], pa: [6, 0], rs: [0, -6], ms: [-6, 0] };
const ZOOM_MAX = 16;
const FUNDO_MUN = '#232833';
const SVG_NS = 'http://www.w3.org/2000/svg';
// Marcador do exterior (votos para Presidente), no canto noroeste, fora do território.
const EXT = { x: -28, y: -6, w: 152, h: 42 };
const EXT_C = [EXT.x + EXT.w / 2, EXT.y + EXT.h / 2];
// Modo "Variação desde 2022": a cor fica cheia a partir desta mudança (pontos percentuais) na vantagem
// PL × PT; o centro da escala é claro para não se confundir com o cinza de "sem dados".
const VAR_MAX = 10;
const NEUTRO = '#dfe3ea';
// Modo "Diferença de votos": a cor fica cheia a partir desta vantagem (escala logarítmica).
const MARGEM_MAX = { uf: 3_000_000, mun: 100_000 };
// Modo "Ganho desde o 1º turno": cor cheia a partir desta mudança na fatia dos válidos (p.p.).
const GANHO_MAX = 12;
const fmtVotos = (v) => Math.round(v).toLocaleString('pt-BR');

export function createMapa({ stage, svg, overlay, tooltip, legenda, select, sub, nivelEl, dica, onSelect, onUnpin, onModo, onNivel, onMunicipio }) {
  let geo = null;
  // Mapa por cidade: geometria (carregada sob demanda) e resultados resumidos por UF.
  let nivel = 'uf';
  const munGeo = {}, munDados = {}, munPaths = {};
  let munCamada = null, carregandoGeo = null;
  let base = null;
  let z = 1, cx = 0, cy = 0;
  let data = null, st = null;
  let ultimaAtualizacao = null; // para o pulso nos estados que acabaram de receber seções
  let extGrupo = null;
  const paths = {};
  const ancora = (uf) => (uf === 'zz' ? EXT_C : geo?.states[uf]?.c);
  const exteriorVisivel = () => data?.cargo.federal && !data.semExterior;

  overlay.innerHTML = `<svg class="callout-line" aria-hidden="true"></svg><div class="callouts"></div>`;
  const linhas = overlay.querySelector('.callout-line');
  const callouts = overlay.querySelector('.callouts');

  // ---------------------------------------------------------------- construção
  function build(g) {
    geo = g;
    const ufs = Object.keys(g.states);
    const todos = ufs.map((uf) => g.states[uf].d).join('');
    let html = `<defs>
      <filter id="map-shadow" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="9"/></filter>
      <linearGradient id="uf-shine" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fff" stop-opacity=".08"/>
        <stop offset=".5" stop-color="#fff" stop-opacity="0"/>
        <stop offset="1" stop-color="#000" stop-opacity=".16"/>
      </linearGradient>
    </defs><g class="map-vp">
      <path d="${todos}" fill="#020306" opacity=".9" transform="translate(0,16)" filter="url(#map-shadow)"/>
      <path d="${todos}" fill="#070a10" transform="translate(0,6)"/>
      <g class="map-states">${ufs.map((uf) => `<path class="uf" data-uf="${uf}" d="${g.states[uf].d}" fill="${SEM}" aria-label="${esc(UF_BY_CODE[uf].nome)}"/>`).join('')}</g>
      <g class="uf-shine">${ufs.map((uf) => `<path d="${g.states[uf].d}" fill="url(#uf-shine)"/>`).join('')}</g>
      <g class="map-mun"></g>
      <g class="map-uf-borda">${ufs.map((uf) => `<path d="${g.states[uf].d}"/>`).join('')}</g>
      <g class="map-leads">`;
    for (const [uf, [bx, by]] of Object.entries(CAIXAS)) {
      const [x, y] = g.states[uf].c;
      html += `<line class="uf-lead" x1="${x}" y1="${y}" x2="${bx - 24}" y2="${by}"/><circle cx="${x}" cy="${y}" r="2.6" fill="#5b6475"/>`;
    }
    html += `</g><g class="map-labels">`;
    for (const uf of ufs) {
      if (CAIXAS[uf]) continue;
      const [x, y] = g.states[uf].c;
      const [dx, dy] = AJUSTE[uf] || [0, 0];
      html += `<text class="uf-label" x="${x + dx}" y="${y + dy}" text-anchor="middle" dominant-baseline="central">${uf.toUpperCase()}</text>`;
    }
    html += `</g><g class="map-boxes">`;
    for (const [uf, [bx, by]] of Object.entries(CAIXAS)) {
      html += `<g class="uf-box" data-uf="${uf}"><rect x="${bx - 24}" y="${by - 15}" width="48" height="30" rx="5"/><text x="${bx}" y="${by + 1}" text-anchor="middle" dominant-baseline="central">${uf.toUpperCase()}</text></g>`;
    }
    html += `</g>
      <g class="uf-box uf-ext" data-uf="zz" aria-label="Exterior">
        <rect x="${EXT.x}" y="${EXT.y}" width="${EXT.w}" height="${EXT.h}" rx="9"/>
        <g class="globo"><circle cx="${EXT.x + 24}" cy="${EXT_C[1]}" r="10"/><ellipse cx="${EXT.x + 24}" cy="${EXT_C[1]}" rx="4.5" ry="10"/><path d="M${EXT.x + 14} ${EXT_C[1]}h20"/></g>
        <text x="${EXT.x + 44}" y="${EXT_C[1] + 1}" dominant-baseline="central">Exterior</text>
      </g></g>`;
    svg.innerHTML = html;
    extGrupo = svg.querySelector('.uf-ext');
    munCamada = svg.querySelector('.map-mun');
    for (const p of svg.querySelectorAll('.uf')) paths[p.dataset.uf] = p;
    fit(true);
  }

  // ---------------------------------------------------------------- zoom / pan
  // Dimensões da área do SVG (no celular os cartões ficam abaixo do mapa, fora dela).
  const area = () => svg.getBoundingClientRect();

  function fit(reset) {
    const r = area();
    if (!r.width || !r.height) return;
    const k = Math.min(r.width / CONTEUDO.w, r.height / CONTEUDO.h);
    base = { w: r.width / k, h: r.height / k };
    if (reset) {
      z = 1;
      cx = CONTEUDO.x + CONTEUDO.w / 2;
      cy = CONTEUDO.y + CONTEUDO.h / 2;
    }
    aplicar();
  }

  function aplicar() {
    if (!base) return;
    const w = base.w / z, h = base.h / z;
    svg.setAttribute('viewBox', `${(cx - w / 2).toFixed(2)} ${(cy - h / 2).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}`);
    // Rótulos dos estados mantêm o tamanho na tela ao aproximar.
    svg.style.setProperty('--z', z.toFixed(3));
    svg.classList.toggle('is-zoom', z > 1.05);
    atualizarDica();
    posicionarCallouts();
  }

  function zoomEm(fator, px, py) {
    const nz = Math.max(1, Math.min(ZOOM_MAX, z * fator));
    if (nz === z) return;
    const r = area();
    const ux = px ?? r.width / 2, uy = py ?? r.height / 2;
    const w = base.w / z, h = base.h / z;
    const mx = cx - w / 2 + (ux / r.width) * w;
    const my = cy - h / 2 + (uy / r.height) * h;
    const nw = base.w / nz, nh = base.h / nz;
    cx = mx - (ux / r.width) * nw + nw / 2;
    cy = my - (uy / r.height) * nh + nh / 2;
    z = nz;
    if (z === 1) { cx = CONTEUDO.x + CONTEUDO.w / 2; cy = CONTEUDO.y + CONTEUDO.h / 2; }
    aplicar();
  }

  function zoomPara([x0, y0, x1, y1]) {
    const folga = 24;
    z = Math.max(1, Math.min(ZOOM_MAX, Math.min(base.w / (x1 - x0 + folga * 2), base.h / (y1 - y0 + folga * 2))));
    cx = (x0 + x1) / 2;
    cy = (y0 + y1) / 2;
    aplicar();
  }

  function atualizarDica() {
    if (!dica) return;
    dica.hidden = nivel !== 'mun';
    dica.textContent = z < 2.2 ? 'Passe o mouse nas cidades · clique para aproximar' : 'Clique numa cidade para ver o resultado completo';
  }

  stage.querySelector('.zoom').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-zoom]');
    if (!b) return;
    if (b.dataset.zoom === 'in') zoomEm(1.45);
    else if (b.dataset.zoom === 'out') zoomEm(1 / 1.45);
    else fit(true);
  });

  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const r = area();
    zoomEm(ev.deltaY < 0 ? 1.18 : 1 / 1.18, ev.clientX - r.left, ev.clientY - r.top);
  }, { passive: false });

  let drag = null;
  svg.addEventListener('pointerdown', (ev) => {
    drag = { x: ev.clientX, y: ev.clientY, cx, cy, moved: false };
  });
  window.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (z === 1) return;
    drag.moved = true;
    svg.classList.add('is-dragging');
    const r = area();
    cx = drag.cx - (dx / r.width) * (base.w / z);
    cy = drag.cy - (dy / r.height) * (base.h / z);
    aplicar();
  });
  window.addEventListener('pointerup', () => {
    svg.classList.remove('is-dragging');
    setTimeout(() => (drag = null), 0);
  });

  svg.addEventListener('click', (ev) => {
    if (drag?.moved) return;
    if (nivel === 'mun') {
      const m = ev.target.closest('[data-mun]');
      const uf = m?.parentNode?.dataset.ufg || ev.target.closest('[data-uf]')?.dataset.uf;
      if (z < 2.2 && uf && geo.states[uf]) return zoomPara(geo.states[uf].bbox);
      const r = m && munDados[uf]?.[m.dataset.mun];
      if (r) onMunicipio({ uf, cd: r.cd, nome: r.nm });
      return;
    }
    const alvo = ev.target.closest('[data-uf]');
    if (alvo) onSelect(alvo.dataset.uf);
  });

  // ---------------------------------------------------------------- tooltip
  svg.addEventListener('pointermove', (ev) => {
    if (drag?.moved) return;
    const mun = nivel === 'mun' && ev.target.closest('[data-mun]');
    const alvo = mun || ev.target.closest('[data-uf]');
    if (!alvo || !data) { tooltip.hidden = true; return; }
    tooltip.innerHTML = mun ? conteudoMun(mun.parentNode.dataset.ufg, mun.dataset.mun) : conteudo(alvo.dataset.uf, false);
    tooltip.hidden = false;
    const r = stage.getBoundingClientRect();
    let x = ev.clientX - r.left + 16, y = ev.clientY - r.top + 16;
    const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
    if (x + tw > r.width - 8) x = ev.clientX - r.left - tw - 16;
    if (y + th > r.height - 8) y = ev.clientY - r.top - th - 16;
    tooltip.style.left = `${Math.max(8, x)}px`;
    tooltip.style.top = `${Math.max(8, y)}px`;
  });
  svg.addEventListener('pointerleave', () => (tooltip.hidden = true));

  overlay.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-unpin]');
    if (b) onUnpin(b.dataset.unpin);
  });

  select.addEventListener('change', () => onModo(select.value));
  nivelEl?.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-nivel]');
    if (b) onNivel(b.dataset.nivel);
  });

  new ResizeObserver(() => fit(false)).observe(svg);

  // ---------------------------------------------------------------- dados
  const candidatoNac = () => Object.fromEntries((data.nacional.candidatos || []).map((c) => [c.n, c]));

  function linhasDoEstado(uf) {
    const e = data.estados[uf];
    if (!e) return [];
    if (data.cargo.federal) {
      const nac = candidatoNac();
      return e.candidatos.slice(0, 3).map((c) => ({ nome: nac[c.n]?.nome || c.n, cor: nac[c.n]?.cor || '#94a3b8', pct: c.pct }));
    }
    if (data.cargo.proporcional) return e.partidos.slice(0, 3).map((p) => ({ nome: p.sigla, cor: p.cor, pct: p.pct, sigla: true }));
    return e.candidatos.slice(0, 3).map((c) => ({ nome: `${nomeProprio(c.nome)} (${c.partido})`, cor: c.cor, pct: c.pct, sigla: true }));
  }

  function conteudo(uf, comFechar) {
    const e = data.estados[uf];
    const nome = UF_BY_CODE[uf]?.nome || uf;
    const apurou = e?.secoes?.apuradas > 0;
    const rows = linhasDoEstado(uf);
    return `<div class="callout__title"><span>${esc(uf === 'zz' ? 'Exterior' : `${nome} (${uf.toUpperCase()})`)}</span>${
      comFechar ? `<button class="callout__close" data-unpin="${uf}" aria-label="Fechar">×</button>` : ''
    }</div>
      ${rows.length ? rows.map((r, i) => `<div class="callout__row ${i === 0 && apurou ? 'callout__row--lider' : ''}" style="--c:${r.cor}">
        <span class="dot"></span><span class="nome">${esc(r.sigla ? r.nome : nomeProprio(r.nome))}</span><b>${pct(r.pct)}</b></div>`).join('')
        : `<div class="callout__row">Sem dados ainda</div>`}
      ${uf === 'zz' ? '' : blocoModoNovo(votosUF(uf), t1De(uf), uf)}${uf !== 'zz' && st.mapaModo === 'virada' && segundoTurnoPres() && t1 && viradasDe(uf).length ? blocoViradasApuracao(uf) : ''}
      ${data.cargo.federal && !['margem', 'virada'].includes(st.mapaModo) && !st.mapaModo.startsWith('ganho:') ? bloco2022(comparacaoUF(uf)) : ''}
      <div class="callout__foot">Seções apuradas: ${pct(e?.secoes?.pct)}</div>
      <div class="callout__bar"><i style="width:${(e?.secoes?.pct || 0).toFixed(2)}%"></i></div>`;
  }

  // ------------------------------------------------------- comparação com 2022 (Presidente)
  // Por partido, porque o candidato do PL mudou: PT = Lula nos dois anos; PL = Jair Bolsonaro em 2022
  // e Flávio Bolsonaro em 2026. Os dados de 2022 chegam sob demanda (compara2022.js).
  const partidos26 = () => candidatosPorPartido(data.nacional?.candidatos);
  const corPT = () => partidos26().pt?.cor || '#ef4b55';
  const corPL = () => partidos26().pl?.cor || '#3d7bf5';

  // Percentuais de PT e PL em 2026 num estado (null enquanto não há votos).
  function atual26UF(uf) {
    const e = data.estados[uf];
    if (!(e?.secoes?.apuradas > 0) || !e.candidatos?.some((c) => c.votos > 0)) return null;
    const { pt, pl } = partidos26();
    const pctDe = (c) => (c && e.candidatos.find((x) => x.n === c.n)?.pct) || 0;
    return { pt: pctDe(pt), pl: pctDe(pl) };
  }
  // Na cidade vêm só os 5 primeiros ([número, %, partido]): quem ficou de fora conta como 0.
  function atual26Mun(r) {
    if (!(r?.a > 0) || !(r.c?.[0]?.[1] > 0)) return null;
    const pctDe = (sg) => r.c.find((x) => x[2] === sg)?.[1] || 0;
    return { pt: pctDe('PT'), pl: pctDe('PL') };
  }
  const comparacaoUF = (uf) => comparar(estado2022(data.turno, uf), atual26UF(uf));
  function comparacaoMun(uf, cdi) {
    const r = munDados[uf]?.[cdi];
    return comparar(municipio2022(data.turno, { uf, cdi, cd: r?.cd }), atual26Mun(r));
  }

  // "Em 2022 · por partido": percentual de cada um em 2022 e a variação do partido até agora (p.p.).
  // No 2º turno a comparação é com o 2º turno de 2022 (a legenda e o resultado da cidade dizem qual);
  // o cartão não repete o turno para caber na largura.
  function bloco2022(c) {
    if (!c) return '';
    const linha = (sg, nome, v22, d, cor) => `<div class="h22-co__r" style="--c:${cor}">
      <b>${sg}</b><span class="h22-co__nm">${nome}</span><span class="h22-co__v">${pct(v22)}</span>${d == null ? '' : `<span class="h22-co__d">${pp(d, '')}</span>`}</div>`;
    return `<div class="h22-co">
      <div class="h22-co__t"><span>Em 2022 · por partido</span>${c.dPT == null ? '' : '<span>var. p.p.</span>'}</div>
      ${linha('PT', 'Lula', c.pt22, c.dPT, corPT())}
      ${linha('PL', 'J. Bolsonaro', c.pl22, c.dPL, corPL())}
    </div>`;
  }

  function corVariacao(dv) {
    if (dv == null || !Number.isFinite(dv)) return SEM;
    return mix(NEUTRO, dv >= 0 ? corPL() : corPT(), Math.min(1, Math.abs(dv) / VAR_MAX) ** 0.8);
  }

  function legendaVariacao() {
    const n = data.nacional;
    const { pt, pl } = candidatosPorPartido(n?.candidatos);
    // Brasil inteiro como referência (respeita o "Incluir exterior").
    const a26 = n?.secoes?.apuradas > 0 && pt && pl ? { pt: pt.pct, pl: pl.pct } : null;
    const br = comparar(data.semExterior ? brasilSemExterior2022(data.turno) : estado2022(data.turno, 'br'), a26);
    const dv = br?.dVantagem;
    return `<div class="legend__title">Vantagem PL × PT desde 2022</div>
      <div class="legend__ramp" style="background:linear-gradient(90deg,${corPT()},${NEUTRO},${corPL()})"></div>
      <div class="legend__scale"><span>PT +${VAR_MAX}</span><span>0</span><span>PL +${VAR_MAX}</span></div>
      ${dv == null ? '' : `<div class="h22-leg__br">Brasil: <b>${pp(dv)}</b> ${Math.abs(dv) < 0.05 ? '' : dv > 0 ? 'para o PL' : 'para o PT'}</div>`}
      <div class="legend__item" style="--c:${SEM}"><span class="legend__dot"></span><span>Sem votos apurados</span></div>
      <div class="h22-leg">Pontos percentuais dos válidos, ante o ${turno2022(data.turno)}º turno de 2022. No PL: Jair (2022) e Flávio (2026).</div>`;
  }

  // ------------------------------------------------- 2º turno: virada, ganho e diferença de votos
  // Resultado final do 1º turno (Lula e Flávio por estado e cidade), carregado sob demanda.
  let t1 = null, pedindoT1 = false;
  function carregarT1() {
    if (t1 || pedindoT1) return;
    pedindoT1 = true;
    fetch('data/2026/presidente-1t.json').then((r) => r.json()).then((j) => {
      t1 = j;
      if (data && geo) api.update(data, st);
    }).catch(() => { pedindoT1 = false; });
  }
  const segundoTurnoPres = () => data?.cargo.federal && data.turno === 2;
  const nomeCurto = (n) => nomeProprio(candidatoNac()[n]?.nome || n);
  const corCand = (n) => candidatoNac()[n]?.cor || '#94a3b8';

  // Votos de cada candidato num estado e na cidade (na cidade, a partir do % e dos válidos).
  function votosUF(uf) {
    const e = data.estados[uf];
    if (!(e?.secoes?.apuradas > 0)) return null;
    const cs = (e.candidatos || []).filter((c) => c.votos > 0).map((c) => ({ n: c.n, sg: c.partido, votos: c.votos, pct: c.pct }));
    return cs.length ? { cs: cs.sort((a, b) => b.votos - a.votos), validos: e.votos?.validos || 0 } : null;
  }
  function votosMun(uf, cdi) {
    const r = munDados[uf]?.[cdi];
    if (!(r?.a > 0) || !(r.v > 0) || !r.c?.length) return null;
    return { cs: r.c.map(([n, p, sg]) => ({ n, sg, pct: p, votos: (p * r.v) / 100 })), validos: r.v };
  }
  // Líder entre os dois finalistas do 2º turno no 1º turno (13 × 22).
  function t1De(uf, cdi) {
    if (!t1) return null;
    if (cdi == null) {
      const x = t1.uf[uf];
      return x ? { v: x.v, c: x.c } : null;
    }
    const x = t1.mun[uf]?.[cdi];
    return x ? { v: x[0], c: { 13: x[1], 22: x[2] } } : null;
  }
  const liderEntre = (c) => (c['13'] == null && c['22'] == null ? null : (c['13'] || 0) >= (c['22'] || 0) ? '13' : '22');

  function corMargem(vs, escala) {
    if (!vs || vs.cs.length < 2) return SEM;
    const [a, b] = vs.cs;
    const cor = data.cargo.federal ? corCand(a.n) : (data.cores[a.sg] || '#94a3b8');
    const t = Math.min(1, Math.log10(1 + a.votos - b.votos) / Math.log10(1 + MARGEM_MAX[escala]));
    return mix(mix(cor, SEM, 0.7), cor, t);
  }
  const corLiderVs = (c) => (data.cargo.federal ? corCand(c.n) : (data.cores[c.sg] || '#94a3b8'));
  const viradasDe = (uf) => data.viradas?.[uf] || [];
  // Sem o 1º turno para comparar (ou fora do Presidente): cor forte onde a liderança trocou de mãos
  // durante a apuração.
  function corViradaApuracao(vs, uf) {
    if (!vs?.cs.length) return SEM;
    const cor = corLiderVs(vs.cs[0]);
    return uf && viradasDe(uf).length ? cor : mix(cor, SEM, 0.74);
  }
  function corVirada(vs, ant) {
    if (!vs || !ant) return SEM;
    const agora = vs.cs.find((c) => c.n === '13' || c.n === '22')?.n;
    if (!agora) return SEM;
    const antes = liderEntre(ant.c);
    return antes && antes !== agora ? corCand(agora) : mix(corCand(agora), SEM, 0.74);
  }
  function ganhoDe(vs, ant, n) {
    if (!vs || !ant || !(ant.v > 0)) return null;
    const agora = vs.cs.find((c) => c.n === n);
    const pctAgora = agora ? agora.pct : 0;
    const pctAntes = ((ant.c[n] || 0) / ant.v) * 100;
    return { pctAntes, pctAgora, dpp: pctAgora - pctAntes, votosAntes: ant.c[n] || 0, votosAgora: agora?.votos || 0 };
  }
  function corGanho(g, n) {
    if (!g) return SEM;
    const k = Math.min(1, Math.abs(g.dpp) / GANHO_MAX) ** 0.8;
    return g.dpp >= 0 ? mix(mix(SEM, corCand(n), 0.18), corCand(n), k) : mix(mix(SEM, '#a7b0c0', 0.18), '#a7b0c0', k);
  }
  // Cor de um lugar nos modos novos (null = não é um desses modos).
  function corModoNovo(vs, ant, escala, uf) {
    const m = st.mapaModo;
    if (m === 'margem') return corMargem(vs, escala);
    if (m === 'virada') return segundoTurnoPres() && t1 ? corVirada(vs, ant) : corViradaApuracao(vs, escala === 'uf' ? uf : null);
    if (m.startsWith('ganho:')) return corGanho(ganhoDe(vs, ant, m.slice(6)), m.slice(6));
    return null;
  }
  // Linhas extras do cartão/tooltip nos modos novos.
  function blocoViradasApuracao(uf) {
    const vs = viradasDe(uf);
    if (!vs.length) return st.mapaModo === 'virada' ? '<div class="callout__extra">Sem troca de liderança durante a apuração</div>' : '';
    const nome = (n) => (data.cargo.federal ? nomeCurto(n) : n);
    return `<div class="callout__extra"><b class="virou">Liderança trocou ${vs.length}x na apuração</b>${vs.slice(-3).map((v) => `<br>${esc(nome(v.para))} passou ${esc(nome(v.de))} com ${pct(v.apurado)} apurado`).join('')}</div>`;
  }
  function blocoModoNovo(vs, ant, uf) {
    const m = st.mapaModo;
    if (m === 'virada' && !(segundoTurnoPres() && t1)) return uf ? blocoViradasApuracao(uf) : '';
    const nome = (c) => (data.cargo.federal ? nomeCurto(c.n) : c.sg);
    if (m === 'margem' && vs?.cs.length >= 2) {
      const [a, b] = vs.cs;
      return `<div class="callout__extra"><b>${esc(nome(a))}</b> tem <b>${fmtVotos(a.votos - b.votos)}</b> votos a mais que ${esc(nome(b))}${data.cargo.federal || vs.validos ? '' : ''}</div>`;
    }
    if ((m === 'virada' || m.startsWith('ganho:')) && ant) {
      const antes = liderEntre(ant.c);
      const marg1 = Math.abs((ant.c['13'] || 0) - (ant.c['22'] || 0));
      const agora = vs?.cs.find((c) => c.n === '13' || c.n === '22');
      const outro = vs?.cs.find((c) => (c.n === '13' || c.n === '22') && c !== agora);
      let html = `<div class="callout__extra">1º turno: <b>${esc(nomeCurto(antes))}</b> à frente por ${fmtVotos(marg1)} votos`;
      if (agora) html += `<br>Agora: <b>${esc(nomeCurto(agora.n))}</b> à frente por ${fmtVotos(agora.votos - (outro?.votos || 0))} votos${antes !== agora.n ? ' <b class="virou">· VIROU</b>' : ''}`;
      if (m.startsWith('ganho:')) {
        const n = m.slice(6), g = ganhoDe(vs, ant, n);
        if (g) html += `<br>${esc(nomeCurto(n))}: ${pct(g.pctAntes)} → ${pct(g.pctAgora)} (<b>${g.dpp >= 0 ? '+' : '−'}${Math.abs(g.dpp).toFixed(1).replace('.', ',')} p.p.</b>) · votos: ${fmtVotos(g.votosAntes)} no 1º turno, ${fmtVotos(g.votosAgora)} agora`;
      }
      return html + '</div>';
    }
    return '';
  }
  function legendaModoNovo() {
    const m = st.mapaModo;
    const escala = nivel === 'mun' ? 'mun' : 'uf';
    if (m === 'margem') {
      const lideres = [];
      if (data.cargo.federal) for (const c of data.nacional.candidatos.slice(0, 2)) lideres.push({ cor: c.cor, nome: nomeProprio(c.nome) });
      else {
        const cont = {};
        for (const [uf, e] of Object.entries(data.estados)) if (uf !== 'zz' && e.lider) cont[e.lider] = (cont[e.lider] || 0) + 1;
        for (const [sg] of Object.entries(cont).sort((a, b) => b[1] - a[1]).slice(0, 4)) lideres.push({ cor: data.cores[sg], nome: sg });
      }
      return `<div class="legend__title">Votos a mais que o 2º colocado</div>
        ${lideres.map((i) => `<div class="legend__mun"><span class="legend__nm">${esc(i.nome)}</span><span class="legend__ramp" style="background:linear-gradient(90deg,${mix(i.cor, SEM, 0.7)},${i.cor})"></span></div>`).join('')}
        <div class="legend__scale legend__scale--mun"><span>poucos</span><span>${escala === 'mun' ? '100 mil+' : '3 mi+'}</span></div>
        <div class="legend__item" style="--c:${SEM}"><span class="legend__dot"></span><span>Sem votos apurados</span></div>`;
    }
    if (m === 'virada') {
      const cont = { '13': 0, '22': 0 };
      const conta = (vs, ant) => {
        const agora = vs?.cs.find((c) => c.n === '13' || c.n === '22')?.n;
        if (agora && ant && liderEntre(ant.c) !== agora) cont[agora]++;
      };
      if (nivel === 'mun') { for (const uf of Object.keys(munDados)) for (const cdi of Object.keys(munDados[uf] || {})) conta(votosMun(uf, cdi), t1De(uf, cdi)); }
      else for (const uf of Object.keys(data.estados)) if (uf !== 'zz') conta(votosUF(uf), t1De(uf));
      const lugar = nivel === 'mun' ? 'cidades' : 'estados';
      const naApuracao = Object.keys(data.viradas || {}).filter((uf) => uf !== 'zz').length;
      const extraApuracao = naApuracao ? `<div class="legend__item" style="--c:#f5b13d"><span class="legend__dot"></span><span>Contorno amarelo: trocou de líder durante a apuração (${naApuracao})</span></div>` : '';
      if (!(segundoTurnoPres() && t1)) {
        return `<div class="legend__title">Viradas durante a apuração</div>
          <div class="legend__item" style="--c:#f5b13d"><span class="legend__dot"></span><span>Cor forte: liderança trocou de mãos (${naApuracao} ${naApuracao === 1 ? 'estado' : 'estados'})</span></div>
          <div class="legend__item" style="--c:${mix('#8a93a6', SEM, 0.6)}"><span class="legend__dot"></span><span>Cor clara: mesmo líder desde o começo</span></div>`;
      }
      return `<div class="legend__title">Quem passou à frente desde o 1º turno</div>${extraApuracao}
        ${['13', '22'].map((n) => `<div class="legend__item" style="--c:${corCand(n)}"><span class="legend__dot"></span><span>Virou para ${esc(nomeCurto(n))}: <b>${cont[n]}</b> ${lugar}</span></div>`).join('')}
        <div class="legend__item" style="--c:${mix('#8a93a6', SEM, 0.6)}"><span class="legend__dot"></span><span>Cor clara: mesmo líder do 1º turno</span></div>
        <div class="legend__item" style="--c:${SEM}"><span class="legend__dot"></span><span>Sem votos apurados</span></div>`;
    }
    if (m.startsWith('ganho:')) {
      const n = m.slice(6);
      return `<div class="legend__title">${esc(nomeCurto(n))}: fatia dos válidos ante o 1º turno</div>
        <div class="legend__ramp" style="background:linear-gradient(90deg,#a7b0c0,${SEM},${corCand(n)})"></div>
        <div class="legend__scale"><span>−${GANHO_MAX} p.p.</span><span>0</span><span>+${GANHO_MAX} p.p.</span></div>
        <div class="h22-leg">Compara a fatia dos votos válidos de agora com a do 1º turno (04/10). Os votos em número aparecem ao passar o mouse.</div>`;
    }
    return null;
  }

  // ------------------------------------------------------------ municípios
  const corDoLider = (n, sg) => (data.cargo.federal ? data.cores[n] : data.cores[sg]);
  function nomeDoCandidato(uf, n, sg) {
    if (data.cargo.federal) return nomeProprio(candidatoNac()[n]?.nome || n);
    const c = data.estados[uf]?.candidatos?.find((x) => x.n === n);
    return c ? `${nomeProprio(c.nome)} (${sg})` : `${n} (${sg})`;
  }

  function corMun(uf, cdi) {
    const r = munDados[uf]?.[cdi];
    if (!r || !(r.a > 0) || !(r.c?.[0]?.[1] > 0)) return SEM;
    if (st.mapaModo === 'secoes') return mix('#1c2944', '#5b93ff', Math.min(1, r.a / 100));
    if (st.mapaModo === 'var22') return corVariacao(comparacaoMun(uf, cdi)?.dVantagem);
    const novo = corModoNovo(votosMun(uf, cdi), t1De(uf, cdi), 'mun');
    if (novo) return novo;
    const [n, p, sg] = r.c[0];
    const cor = corDoLider(n, sg);
    if (!cor) return SEM;
    // Tom mais forte quanto maior o percentual do líder (35% → claro, 70%+ → cor cheia).
    const t = Math.max(0, Math.min(1, (p - 35) / 35));
    return mix(mix(cor, SEM, 0.62), cor, t);
  }

  function conteudoMun(uf, cdi) {
    const r = munDados[uf]?.[cdi];
    if (!r) return `<div class="callout__title"><span>Carregando…</span></div>`;
    const apurou = r.a > 0;
    return `<div class="callout__title"><span>${esc(nomeProprio(r.nm))} (${uf.toUpperCase()})</span></div>
      ${r.c.map(([n, p, sg], i) => `<div class="callout__row ${i === 0 && apurou ? 'callout__row--lider' : ''}" style="--c:${corDoLider(n, sg) || '#94a3b8'}">
        <span class="dot"></span><span class="nome">${esc(nomeDoCandidato(uf, n, sg))}</span><b>${pct(p)}</b></div>`).join('')}
      ${blocoModoNovo(votosMun(uf, cdi), t1De(uf, cdi))}
      ${data.cargo.federal && st.mapaModo === 'var22' ? bloco2022(comparacaoMun(uf, cdi)) : data.cargo.federal && !['margem', 'virada'].includes(st.mapaModo) && !st.mapaModo.startsWith('ganho:') ? bloco2022(comparacaoMun(uf, cdi)) : ''}
      <div class="callout__foot">Seções apuradas: ${pct(r.a)}${apurou ? '' : ' · sem votos ainda'}</div>
      <div class="callout__bar"><i style="width:${(r.a || 0).toFixed(2)}%"></i></div>`;
  }

  function desenharUF(uf) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.dataset.ufg = uf;
    g.innerHTML = Object.entries(munGeo[uf]).map(([cdi, d]) => `<path data-mun="${cdi}" d="${d}" fill="${data ? corMun(uf, cdi) : SEM}"/>`).join('');
    munCamada.appendChild(g);
    munPaths[uf] = [...g.children];
  }

  function garantirGeometria() {
    if (carregandoGeo) return carregandoGeo;
    const fila = Object.keys(geo.states);
    const trabalho = async () => {
      while (fila.length) {
        const uf = fila.shift();
        try {
          munGeo[uf] = await fetch(`data/municipios/${uf}.json`).then((r) => r.json());
          desenharUF(uf);
        } catch {
          /* UF fica só com o contorno */
        }
      }
    };
    carregandoGeo = Promise.all(Array.from({ length: 6 }, trabalho));
    return carregandoGeo;
  }

  function pintarMunicipios(ufs = Object.keys(munPaths)) {
    if (!data || nivel !== 'mun') return;
    for (const uf of ufs) for (const p of munPaths[uf] || []) {
      const f = corMun(uf, p.dataset.mun);
      if (p.getAttribute('fill') !== f) p.setAttribute('fill', f);
    }
  }

  function legendaMun() {
    if (st.mapaModo === 'secoes') return null;
    let itens;
    if (data.cargo.federal) itens = data.nacional.candidatos.slice(0, 3).map((c) => ({ cor: c.cor, nome: nomeProprio(c.nome) }));
    else {
      const cont = {};
      for (const [uf, e] of Object.entries(data.estados)) if (uf !== 'zz' && e.lider) cont[e.lider] = (cont[e.lider] || 0) + 1;
      itens = Object.entries(cont).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([sg]) => ({ cor: data.cores[sg], nome: sg }));
    }
    return `<div class="legend__title">Vencedor na cidade · % dos votos</div>
      ${itens.map((i) => `<div class="legend__mun"><span class="legend__nm">${esc(i.nome)}</span><span class="legend__ramp" style="background:linear-gradient(90deg,${mix(mix(i.cor, SEM, 0.62), i.cor, 0)},${i.cor})"></span></div>`).join('')}
      <div class="legend__scale legend__scale--mun"><span>35%</span><span>70%+</span></div>
      <div class="legend__item" style="--c:${SEM}"><span class="legend__dot"></span><span>Sem votos apurados</span></div>`;
  }

  function corEstado(uf) {
    if (nivel === 'mun') return FUNDO_MUN;
    const e = data.estados[uf];
    if (!e?.secoes) return SEM;
    const modo = st.mapaModo;
    if (modo === 'secoes') {
      const p = (e.secoes.pct || 0) / 100;
      return p > 0 ? mix('#1c2944', '#5b93ff', p) : SEM;
    }
    if (modo === 'var22') return corVariacao(comparacaoUF(uf)?.dVantagem);
    const novo = uf === 'zz' && modo !== 'margem' ? null : corModoNovo(votosUF(uf), t1De(uf), 'uf', uf);
    if (novo) return novo;
    if (modo.startsWith('cand:')) {
      const n = modo.slice(5);
      const c = data.nacional.candidatos.find((x) => x.n === n);
      const v = e.candidatos.find((x) => x.n === n)?.pct || 0;
      if (!c || !e.secoes.apuradas) return SEM;
      return mix('#1b212d', c.cor, 0.12 + 0.88 * Math.min(1, v / 60));
    }
    if (!e.lider) return SEM;
    const cor = data.cores[e.lider];
    return cor ? mix(cor, ESCURO, 0.2) : SEM;
  }

  function opcoes() {
    const ops = [];
    const var22 = ['var22', 'Variação desde 2022'];
    const margem = ['margem', 'Vantagem do líder (votos à frente do 2º colocado)'];
    const viradaApuracao = !(segundoTurnoPres() && t1) && Object.keys(data.viradas || {}).length ? [['virada', 'Viradas durante a apuração']] : [];
    const houveVirada = Object.keys(data.viradas || {}).length > 0;
    const t2 = segundoTurnoPres() && t1 ? [['virada', 'Virada desde o 1º turno'], ...data.nacional.candidatos.slice(0, 2).map((c) => [`ganho:${c.n}`, `Ganho desde o 1º turno: ${nomeProprio(c.nome)}`])] : [];
    if (nivel === 'mun') return [['lider', 'Vencedor em cada cidade'], ...t2, margem, ['secoes', 'Seções apuradas'], ...(data.cargo.federal ? [var22] : [])];
    if (data.cargo.federal) {
      ops.push(['lider', 'Candidato mais votado'], ...t2, ...viradaApuracao, margem, ['secoes', 'Seções apuradas']);
      for (const c of data.nacional.candidatos.slice(0, 3)) ops.push([`cand:${c.n}`, `Votação: ${nomeProprio(c.nome)}`]);
      ops.push(var22);
    } else {
      ops.push(['lider', data.cargo.proporcional ? 'Partido mais votado' : 'Candidato mais votado'], ...(data.cargo.proporcional ? [] : [...viradaApuracao, margem]), ['secoes', 'Seções apuradas']);
    }
    return ops;
  }

  function subtitulo() {
    const m = st.mapaModo;
    const onde = nivel === 'mun' ? 'cidade' : 'estado';
    if (m === 'margem') return `Quantos votos o 1º colocado tem a mais que o 2º em cada ${onde}`;
    if (m === 'virada') return `Onde quem lidera agora é diferente de quem liderava no 1º turno (cor forte = virou)`;
    if (m.startsWith('ganho:')) return `Quanto ${nomeCurto(m.slice(6))} ganhou ou perdeu da fatia dos votos desde o 1º turno, em cada ${onde}`;
    if (m === 'var22') return `Quanto a vantagem do PL sobre o PT mudou desde 2022 em cada ${nivel === 'mun' ? 'cidade' : 'estado'}`;
    if (nivel === 'mun') return m === 'secoes' ? 'Percentual de seções apuradas em cada cidade' : 'Candidato mais votado em cada cidade; quanto mais forte a cor, maior a vantagem';
    if (m === 'secoes') return 'Percentual de seções apuradas em cada estado';
    if (m.startsWith('cand:')) {
      const c = data.nacional.candidatos.find((x) => x.n === m.slice(5));
      return `Votos válidos de ${nomeProprio(c?.nome || '')} em cada estado`;
    }
    return {
      presidente: 'Percentual do candidato mais votado em cada estado',
      governador: 'Partido do candidato a governador mais votado em cada estado',
      senado: 'Partido do candidato ao Senado mais votado em cada estado',
      camara: 'Partido mais votado para deputado federal em cada estado',
      assembleia: 'Partido mais votado para deputado estadual (distrital no DF) em cada estado',
    }[data.cargo.key];
  }

  function htmlLegenda() {
    const m = st.mapaModo;
    if (m === 'var22') return legendaVariacao();
    const nova = legendaModoNovo();
    if (nova) return nova;
    if (nivel === 'mun' && m !== 'secoes') return legendaMun();
    if (m === 'secoes') {
      return `<div class="legend__title">Seções apuradas</div>
        <div class="legend__ramp" style="background:linear-gradient(90deg,#1c2944,#5b93ff)"></div>
        <div class="legend__scale"><span>0%</span><span>50%</span><span>100%</span></div>
        <div class="legend__item" style="--c:${SEM};margin-top:6px"><span class="legend__dot"></span><span>Sem seções apuradas</span></div>`;
    }
    if (m.startsWith('cand:')) {
      const c = data.nacional.candidatos.find((x) => x.n === m.slice(5));
      return `<div class="legend__title">${esc(nomeProprio(c?.nome || ''))}</div>
        <div class="legend__ramp" style="background:linear-gradient(90deg,${mix('#1b212d', c?.cor || '#888888', 0.12)},${c?.cor})"></div>
        <div class="legend__scale"><span>0%</span><span>30%</span><span>60%+</span></div>`;
    }
    const contagem = {};
    for (const [uf, e] of Object.entries(data.estados)) if (uf !== 'zz' && e.lider) contagem[e.lider] = (contagem[e.lider] || 0) + 1;
    let itens;
    if (data.cargo.federal) {
      itens = data.nacional.candidatos
        .filter((c, i) => i < 3 || contagem[c.n])
        .slice(0, 5)
        .map((c) => ({ cor: c.cor, nome: nomeProprio(c.nome) }));
    } else {
      itens = Object.entries(contagem)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([sg, n]) => ({ cor: data.cores[sg], nome: `${sg} · ${n} ${n === 1 ? 'estado' : 'estados'}` }));
    }
    const titulo = data.cargo.federal ? 'Candidato mais votado' : data.cargo.proporcional ? 'Partido mais votado' : 'Partido do líder';
    return `<div class="legend__title">${titulo}</div>
      ${itens.map((i) => `<div class="legend__item" style="--c:${i.cor}"><span class="legend__dot"></span><span>${esc(i.nome)}</span></div>`).join('')}
      <div class="legend__item" style="--c:#5d6577"><span class="legend__dot"></span><span>Sem definição</span></div>`;
  }

  function posicionarCallouts() {
    if (!data || !geo) return;
    const sr = stage.getBoundingClientRect();
    const m = svg.getScreenCTM();
    if (!m) return;
    let html = '';
    for (const el of callouts.children) {
      const uf = el.dataset.uf;
      const c = ancora(uf);
      if (!c) continue;
      const ax = m.a * c[0] + m.c * c[1] + m.e - sr.left;
      const ay = m.b * c[0] + m.d * c[1] + m.f - sr.top;
      const r = el.getBoundingClientRect();
      const L = r.left - sr.left, T = r.top - sr.top, R = L + r.width, B = T + r.height;
      const ex = Math.max(L, Math.min(ax, R)), ey = Math.max(T, Math.min(ay, B));
      const dentro = ax > L && ax < R && ay > T && ay < B;
      const fora = ax < 0 || ay < 0 || ax > sr.width || ay > sr.height;
      if (dentro || fora) continue;
      const lider = data.estados[uf]?.lider;
      const cor = (lider && data.cores[lider]) || '#8a93a6';
      html += `<line x1="${ax}" y1="${ay}" x2="${ex}" y2="${ey}"/>
        <circle cx="${ax}" cy="${ay}" r="6" fill="#fff"/><circle cx="${ax}" cy="${ay}" r="3.6" fill="${cor}"/>
        <circle cx="${ex}" cy="${ey}" r="3" fill="#fff" class="anchor"/>`;
    }
    linhas.innerHTML = html;
  }

  function slot(i) {
    return i === 0 ? 'left:40px;bottom:96px' : 'right:15px;top:12px';
  }

  const api = {
    async init() {
      const g = await fetch('data/brasil-uf.json').then((r) => r.json());
      build(g);
      return g;
    },
    // Resultados resumidos dos municípios de uma UF (vindos de /api/municipios-mapa).
    definirMunicipios(uf, dados) {
      munDados[uf] = dados;
      pintarMunicipios([uf]);
    },
    limparMunicipios() {
      for (const k of Object.keys(munDados)) delete munDados[k];
      pintarMunicipios();
    },
    update(d, state) {
      const anterior = data;
      data = d;
      st = state;
      definirTurno2026(d.turno);
      if (d.cargo.federal && d.turno === 2) carregarT1();
      if (!geo) return;
      // Pulso de luz nos estados com seções novas desde a última atualização exibida.
      const recentes = d.atualizacoes || [];
      if (ultimaAtualizacao != null && anterior?.cargo.key === d.cargo.key) {
        const novos = new Set(recentes.filter((u) => u.t > ultimaAtualizacao).map((u) => u.uf));
        for (const uf of novos) {
          const p = paths[uf];
          if (!p) continue;
          p.classList.remove('uf-pulso');
          void p.getBoundingClientRect();
          p.classList.add('uf-pulso');
        }
      }
      ultimaAtualizacao = recentes[0]?.t ?? ultimaAtualizacao ?? 0;
      const novoNivel = d.cargo.proporcional ? 'uf' : state.mapaNivel;
      if (novoNivel !== nivel) {
        nivel = novoNivel;
        svg.classList.toggle('nivel-mun', nivel === 'mun');
        if (nivel === 'mun') garantirGeometria();
        else fit(true);
        atualizarDica();
      }
      if (nivelEl) {
        nivelEl.hidden = !!d.cargo.proporcional;
        for (const b of nivelEl.querySelectorAll('[data-nivel]')) {
          const on = b.dataset.nivel === nivel;
          b.classList.toggle('is-on', on);
          b.setAttribute('aria-pressed', String(on));
        }
      }
      const ops = opcoes();
      if (!ops.some(([v]) => v === st.mapaModo)) st.mapaModo = 'lider';
      const opsHtml = ops.map(([v, t]) => `<option value="${v}" ${v === st.mapaModo ? 'selected' : ''}>${esc(t)}</option>`).join('');
      if (select.dataset.sig !== opsHtml) {
        select.innerHTML = opsHtml;
        select.dataset.sig = opsHtml;
      }
      select.value = st.mapaModo;
      sub.textContent = subtitulo();
      const pins = st.pins || [];
      for (const [uf, p] of Object.entries(paths)) {
        const fill = corEstado(uf);
        if (p.getAttribute('fill') !== fill) p.setAttribute('fill', fill);
        p.classList.toggle('is-pinned', pins.includes(uf));
        p.classList.toggle('uf-virou', st.mapaModo === 'virada' && viradasDe(uf).length > 0);
      }
      if (extGrupo) {
        const vis = exteriorVisivel();
        extGrupo.style.display = vis ? '' : 'none';
        const cor = corEstado('zz');
        extGrupo.querySelector('rect').style.fill = cor === SEM ? '' : cor;
        extGrupo.classList.toggle('is-pinned', pins.includes('zz'));
      }
      pintarMunicipios();
      morph(legenda, htmlLegenda());
      morph(
        callouts,
        (nivel === 'mun' ? [] : pins)
          .filter((uf) => geo.states[uf] || (uf === 'zz' && exteriorVisivel()))
          .slice(0, 2)
          .map((uf, i) => `<div class="callout" data-key="co-${uf}" data-uf="${uf}" style="${slot(i)}">${conteudo(uf, true)}</div>`)
          .join(''),
      );
      requestAnimationFrame(posicionarCallouts);
    },
  };
  // Dados de 2022 chegaram: redesenha com o último payload (cartões, cores e legenda).
  aoCarregar2022(() => data && geo && api.update(data, st));
  return api;
}

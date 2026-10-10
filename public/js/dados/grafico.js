// Gráficos em SVG escrito à mão: minigráfico dos cartões e gráfico completo do detalhe,
// ambos com faixas de fundo por mandato (dois tons neutros alternados, sem cores de partido).
import { esc } from '../format.js';
import { rotuloPeriodo, fmtValor, ticksY, fmtEixo, mandatoDoPonto, dataParaT, dataFimParaT } from './serie.js';

let uid = 0;

// Faixas de mandato recortadas ao intervalo [t0, t1] dos dados.
function faixas(mandatos, t0, t1) {
  const out = [];
  for (const m of mandatos) {
    const a = Math.max(m.t0, t0);
    const b = Math.min(m.t1, t1);
    if (b > a) out.push({ m, a, b });
  }
  return out;
}

function resumoAria(pts, ind, periodicidade, nomeSerie) {
  if (!pts.length) return `${ind.titulo}: sem dados`;
  let min = pts[0], max = pts[0];
  for (const p of pts) {
    if (p.v < min.v) min = p;
    if (p.v > max.v) max = p;
  }
  const r = (p) => rotuloPeriodo(p.periodo, periodicidade);
  const ult = pts[pts.length - 1];
  return `Gráfico de linha: ${ind.titulo}${nomeSerie ? ` — ${nomeSerie}` : ''}, de ${r(pts[0])} a ${r(ult)}. ` +
    `Mínimo de ${fmtValor(min.v, ind)} em ${r(min)}; máximo de ${fmtValor(max.v, ind)} em ${r(max)}; ` +
    `último valor ${fmtValor(ult.v, ind)} em ${r(ult)}. Faixas de fundo marcam os mandatos presidenciais.`;
}

// ------------------------------------------------------------------ minigráfico (cartões)
export function sparkline(pts, mandatos, ind, periodicidade) {
  const W = 300, H = 70, pt = 4, pb = 4;
  if (pts.length < 2) return '';
  const t0 = pts[0].ini, t1 = pts[pts.length - 1].fim;
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) { lo = Math.min(lo, p.v); hi = Math.max(hi, p.v); }
  if (hi === lo) { hi += 1; lo -= 1; }
  const x = (t) => ((t - t0) / (t1 - t0)) * W;
  const y = (v) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  let svg = `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(resumoAria(pts, ind, periodicidade))}">`;
  faixas(mandatos, t0, t1).forEach((f, i) => {
    svg += `<rect class="faixa faixa--${i % 2 ? 'b' : 'a'}" x="${x(f.a).toFixed(1)}" y="0" width="${(x(f.b) - x(f.a)).toFixed(1)}" height="${H}"/>`;
  });
  if (lo < 0 && hi > 0) svg += `<line class="spark__zero" x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" vector-effect="non-scaling-stroke"/>`;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join('');
  svg += `<path class="spark__linha" d="${d}" vector-effect="non-scaling-stroke"/></svg>`;
  return svg;
}

// ------------------------------------------------------------------ gráfico completo (detalhe)
// el: contêiner (position: relative). Retorna { destruir }.
export function graficoCompleto(el, { pts, mandatos, contexto, ind, periodicidade, nomeSerie = '', animar = true }) {
  const id = ++uid;
  const W = Math.max(280, Math.round(el.clientWidth || 800));
  const estreito = W < 560;
  const H = estreito ? 300 : 400;
  const pad = { l: estreito ? 44 : 56, r: estreito ? 10 : 16, t: 28, b: 28 };
  const ultimoPt = pts[pts.length - 1];

  if (pts.length < 2) {
    el.innerHTML = `<p class="vazio">Dados insuficientes para o gráfico.</p>`;
    return { destruir() {} };
  }

  const t0 = pts[0].ini, t1 = ultimoPt.fim;
  let mn = Infinity, mx = -Infinity;
  for (const p of pts) { mn = Math.min(mn, p.v); mx = Math.max(mx, p.v); }
  const folga = (mx - mn) * 0.06 || Math.abs(mx) * 0.1 || 1;
  const { ticks, lo, hi, casas } = ticksY(mn - folga, mx + folga, estreito ? 4 : 6);
  const x = (t) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  // Rótulos dos mandatos: uma linha se todos cabem nas próprias faixas; senão, duas alternadas.
  const fx = faixas(mandatos, t0, t1);
  const larg = (s) => s.length * (estreito ? 5.9 : 6.4) + 6;
  const duasLinhas = fx.some((f) => larg(f.m.curto || f.m.nome) > x(f.b) - x(f.a));
  const topoFaixa = duasLinhas ? 34 : 22;
  pad.t = topoFaixa + 6;
  const y =(v) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const yTopo = pad.t, yBase = H - pad.b;

  let svg = `<svg class="graf__svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(resumoAria(pts, ind, periodicidade, nomeSerie))}">
    <defs><pattern id="hach-${id}" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" class="hachura"/></pattern>
    <linearGradient id="area-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6d86ff" stop-opacity=".22"/><stop offset="1" stop-color="#6d86ff" stop-opacity="0"/></linearGradient></defs>`;

  // Faixas por mandato, com o nome curto no alto. Todo mandato recebe rótulo: se algum não
  // cabe na própria faixa, todos passam a alternar entre duas linhas (mesma regra para todos).
  fx.forEach((f, i) => {
    const xa = x(f.a), xb = x(f.b);
    svg += `<rect class="faixa faixa--${i % 2 ? 'b' : 'a'}" x="${xa.toFixed(1)}" y="${yTopo - topoFaixa}" width="${(xb - xa).toFixed(1)}" height="${yBase - yTopo + topoFaixa}"/>`;
    if (i > 0) svg += `<line class="faixa__div" x1="${xa.toFixed(1)}" x2="${xa.toFixed(1)}" y1="${yTopo - topoFaixa}" y2="${yBase}"/>`;
  });
  fx.forEach((f, i) => {
    const rot = f.m.curto || f.m.nome;
    const w = larg(rot);
    const cx = Math.max(pad.l + w / 2, Math.min(W - pad.r - w / 2, (x(f.a) + x(f.b)) / 2));
    const ly = duasLinhas ? (i % 2 ? yTopo - 6 : yTopo - 20) : yTopo - 8;
    svg += `<text class="faixa__rot${estreito ? ' faixa__rot--p' : ''}" x="${cx.toFixed(1)}" y="${ly}" text-anchor="middle">${esc(rot)}</text>`;
  });

  // Grade e eixo Y.
  for (const v of ticks) {
    svg += `<line class="chart-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>
      <text class="chart-axis" x="${pad.l - 8}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end">${fmtEixo(v, ind, casas)}</text>`;
  }
  if (lo < 0 && hi > 0) svg += `<line class="graf__zero" x1="${pad.l}" x2="${W - pad.r}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>`;

  // Eixo X: anos, com passo que mantenha ~44px entre rótulos.
  const anoIni = Math.ceil(t0 / 12), anoFim = Math.floor(t1 / 12);
  const pxAno = (x(12 * 12) - x(0)) / 12;
  const passo = [1, 2, 4, 8, 12].find((p) => p * pxAno >= (estreito ? 40 : 46)) || 16;
  for (let a = anoIni; a <= anoFim; a++) {
    const tx = x(a * 12);
    svg += `<line class="graf__tick" x1="${tx.toFixed(1)}" x2="${tx.toFixed(1)}" y1="${yBase}" y2="${yBase + 4}"/>`;
    if ((a - 2003) % passo === 0) {
      svg += `<text class="chart-axis" x="${tx.toFixed(1)}" y="${H - 8}" text-anchor="middle">${a}</text>`;
    }
  }

  // Períodos de contexto (crises, pandemia): hachurados, com rótulo na base.
  svg += `<g class="ctx">`;
  for (const c of contexto || []) {
    const a = Math.max(dataParaT(c.inicio), t0);
    const b = Math.min(c.fim ? dataFimParaT(c.fim) : t1, t1);
    if (b <= a) continue;
    const xa = x(a), xb = x(b);
    svg += `<rect class="ctx__area" x="${xa.toFixed(1)}" y="${yTopo}" width="${(xb - xa).toFixed(1)}" height="${yBase - yTopo}" fill="url(#hach-${id})"><title>${esc(c.rotulo)}</title></rect>`;
    // Rótulo só quando cabe; a lista completa fica abaixo do gráfico.
    if (c.rotulo.length * 5.6 + 8 <= xb - xa) {
      svg += `<text class="ctx__rot" x="${((xa + xb) / 2).toFixed(1)}" y="${yBase - 8}" text-anchor="middle">${esc(c.rotulo)}</text>`;
    }
  }
  svg += `</g>`;

  // Linha e área.
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join('');
  const base = y(lo > 0 ? lo : hi < 0 ? hi : 0);
  svg += `<path class="graf__area" d="${d}L${x(ultimoPt.t).toFixed(1)} ${base.toFixed(1)}L${x(pts[0].t).toFixed(1)} ${base.toFixed(1)}Z" fill="url(#area-${id})"/>`;
  svg += `<path class="graf__linha${animar ? ' graf__linha--anima' : ''}" d="${d}" pathLength="1"/>`;
  svg += `<circle class="graf__ultimo" cx="${x(ultimoPt.t).toFixed(1)}" cy="${y(ultimoPt.v).toFixed(1)}" r="4"/>`;

  // Mira (crosshair) do cursor.
  svg += `<g class="mira" visibility="hidden"><line class="mira__v" y1="${yTopo}" y2="${yBase}"/><circle class="mira__p" r="5"/></g>`;
  svg += `<rect class="graf__hit" x="${pad.l}" y="${yTopo - topoFaixa}" width="${W - pad.l - pad.r}" height="${yBase - yTopo + topoFaixa}"/>`;
  svg += `</svg>`;

  el.innerHTML = `${svg}<div class="dica" role="status" aria-live="polite" hidden></div>`;
  const svgEl = el.querySelector('svg');
  const mira = svgEl.querySelector('.mira');
  const miraV = mira.querySelector('.mira__v');
  const miraP = mira.querySelector('.mira__p');
  const dica = el.querySelector('.dica');
  let atual = -1;

  function mostrar(i) {
    i = Math.max(0, Math.min(pts.length - 1, i));
    atual = i;
    const p = pts[i];
    const px = x(p.t), py = y(p.v);
    miraV.setAttribute('x1', px); miraV.setAttribute('x2', px);
    miraP.setAttribute('cx', px); miraP.setAttribute('cy', py);
    mira.setAttribute('visibility', 'visible');
    const m = mandatoDoPonto(p, mandatos);
    dica.innerHTML = `<span class="dica__per">${esc(rotuloPeriodo(p.periodo, periodicidade))}</span>
      <b class="dica__v">${esc(fmtValor(p.v, ind))}</b>
      ${m ? `<span class="dica__m">${esc(m.nome)}</span>` : ''}`;
    dica.hidden = false;
    // Posiciona a dica ao lado da mira, sem sair do gráfico.
    const dw = dica.offsetWidth, dh = dica.offsetHeight;
    let left = px + 12;
    if (left + dw > W - 4) left = px - dw - 12;
    left = Math.max(4, left);
    const top = Math.max(4, Math.min(H - dh - 4, py - dh - 12 < yTopo - 20 ? py + 14 : py - dh - 12));
    dica.style.transform = `translate(${left.toFixed(0)}px, ${top.toFixed(0)}px)`;
  }
  function esconder() {
    mira.setAttribute('visibility', 'hidden');
    dica.hidden = true;
    atual = -1;
  }
  function indicePorX(clientX) {
    const r = svgEl.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    const t = t0 + ((px - pad.l) / (W - pad.l - pad.r)) * (t1 - t0);
    // Busca binária pelo ponto mais próximo no tempo.
    let a = 0, b = pts.length - 1;
    while (b - a > 1) {
      const m = (a + b) >> 1;
      if (pts[m].t < t) a = m; else b = m;
    }
    return Math.abs(pts[a].t - t) <= Math.abs(pts[b].t - t) ? a : b;
  }

  const onMove = (ev) => mostrar(indicePorX(ev.clientX));
  const onLeave = (ev) => { if (ev.pointerType === 'mouse') esconder(); };
  const onDown = (ev) => mostrar(indicePorX(ev.clientX));
  const onKey = (ev) => {
    const passoK = ev.shiftKey ? 12 : 1;
    if (ev.key === 'ArrowRight') mostrar(atual < 0 ? pts.length - 1 : atual + passoK);
    else if (ev.key === 'ArrowLeft') mostrar(atual < 0 ? pts.length - 1 : atual - passoK);
    else if (ev.key === 'Home') mostrar(0);
    else if (ev.key === 'End') mostrar(pts.length - 1);
    else return;
    ev.preventDefault();
  };
  // Toque fora do gráfico esconde a dica no celular.
  const onDocDown = (ev) => { if (!el.contains(ev.target)) esconder(); };

  svgEl.addEventListener('pointermove', onMove);
  svgEl.addEventListener('pointerdown', onDown);
  svgEl.addEventListener('pointerleave', onLeave);
  el.addEventListener('keydown', onKey);
  el.addEventListener('blur', esconder);
  document.addEventListener('pointerdown', onDocDown);

  return {
    destruir() {
      document.removeEventListener('pointerdown', onDocDown);
      el.removeEventListener('keydown', onKey);
      el.removeEventListener('blur', esconder);
    },
  };
}

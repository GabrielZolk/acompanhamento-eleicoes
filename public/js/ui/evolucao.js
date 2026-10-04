import { pct, hora, esc, nomeProprio } from '../format.js';

const HORA = 3600e3;
const hh = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false });
const hm = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const hhmm = (t) => hm.format(new Date(t)).replace(':', 'h');

function valorEm(pts, t) {
  if (!pts.length || t < pts[0].t) return null;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].t >= t) {
      const a = pts[i - 1], b = pts[i];
      return a.pct + ((b.pct - a.pct) * (t - a.t)) / (b.t - a.t || 1);
    }
  }
  return null;
}

function renderSecoes(d, largura) {
  const W = Math.max(320, Math.round(largura || 900));
  const H = 128;
  const pad = { l: 40, r: 24, t: 12, b: 24 };
  const inicio = d.inicio;
  const prev = d.previsao || {};
  let fim = inicio + 7 * HORA;
  if (prev.status === 'estimada' && prev.eta > fim - 15 * 60e3) {
    fim = Math.min(inicio + 12 * HORA, Math.ceil((prev.eta + 20 * 60e3) / HORA) * HORA);
  }
  const x = (t) => pad.l + ((t - inicio) / (fim - inicio)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - v / 100) * (H - pad.t - pad.b);

  let pts = d.historico.filter((p) => p.t >= inicio - 60e3 && p.t <= fim).map((p) => ({ t: Math.max(p.t, inicio), pct: p.pct }));
  if (d.status !== 'aguardando' && (!pts.length || pts[0].t > inicio)) pts.unshift({ t: inicio, pct: 0 });
  if (d.status === 'aguardando') pts = [];

  let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Evolução do percentual de seções totalizadas">
    <defs><linearGradient id="evo-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d7bf5" stop-opacity=".45"/><stop offset="1" stop-color="#3d7bf5" stop-opacity="0"/></linearGradient></defs>`;
  for (const v of [0, 25, 50, 75, 100]) {
    svg += `<line class="chart-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/>
      <text class="chart-axis" x="${pad.l - 10}" y="${y(v) + 3.5}" text-anchor="end">${v}%</text>`;
  }
  for (let t = inicio; t <= fim + 1; t += HORA) {
    svg += `<text class="chart-axis" x="${x(t)}" y="${H - 4}" text-anchor="middle">${hh.format(new Date(t))}h</text>`;
  }

  if (pts.length > 1) {
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.pct).toFixed(1)}`).join('');
    const last = pts[pts.length - 1];
    svg += `<path d="${line}L${x(last.t).toFixed(1)} ${y(0)}L${x(pts[0].t).toFixed(1)} ${y(0)}Z" fill="url(#evo-area)"/>`;
    if (prev.status === 'estimada' && prev.eta) {
      const ex = Math.min(x(prev.eta), W - pad.r);
      svg += `<path class="chart-proj" d="M${x(last.t)} ${y(last.pct)}L${ex} ${y(100)}"/><path class="chart-proj" d="M${ex} ${y(100)}L${ex} ${y(0)}"/>`;
    }
    svg += `<path class="chart-line" d="${line}" pathLength="1"/>`;
    for (let t = inicio + HORA / 2; t < last.t - 5 * 60e3; t += HORA / 2) {
      const v = valorEm(pts, t);
      if (v != null) svg += `<circle class="chart-dot" cx="${x(t)}" cy="${y(v)}" r="3.6"/>`;
    }
    const cx = x(last.t), cy = y(last.pct);
    const tw = 54, th = 32;
    let tx = cx + 6, ty = cy - th - 6;
    if (tx + tw > W) tx = cx - tw - 6;
    if (ty < 0) ty = cy + 8;
    svg += `<circle class="chart-now" cx="${cx}" cy="${cy}" r="4.5"/>
      <g class="chart-tag"><rect x="${tx}" y="${ty}" width="${tw}" height="${th}" rx="5"/>
      <text x="${tx + tw / 2}" y="${ty + 14}" text-anchor="middle" font-size="12" font-weight="700">${pct(last.pct)}</text>
      <text x="${tx + tw / 2}" y="${ty + 26}" text-anchor="middle" font-size="10" fill="#8a93a6">${hora(d.historico.at(-1)?.t)}</text></g>`;
  } else if (d.status === 'aguardando') {
    svg += `<text class="chart-axis" x="${(pad.l + W - pad.r) / 2}" y="${y(50) + 4}" text-anchor="middle" font-size="12">${Date.now() >= d.inicio ? 'Aguardando a primeira divulgação do TSE' : 'A totalização começa às 17h (horário de Brasília)'}</text>`;
  }
  svg += `</svg>`;

  const pill = d.status === 'apurando'
      ? `<span class="ao-vivo"><i></i>Ao vivo</span>`
      : d.status === 'finalizado'
        ? `<span class="ao-vivo ao-vivo--off"><i></i>Finalizada</span>`
        : `<span class="ao-vivo ao-vivo--off"><i></i>Aguardando</span>`;

  return { pill, svg };
}

// Histórico de resultado: percentual dos dois primeiros colocados a cada publicação do TSE.
function renderCandidatos(d, largura) {
  const W = Math.max(320, Math.round(largura || 900));
  const H = 128;
  const pad = { l: 48, r: 128, t: 6, b: 22 };
  const pts = d.historico.filter((p) => p.c);
  const top = d.nacional.candidatos.slice(0, 2).filter((c) => pts.some((p) => p.c[c.n] != null));
  let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Histórico do percentual dos candidatos">`;
  if (pts.length < 2 || !top.length) {
    const msg = pts.length ? 'Registrando… a linha aparece a partir da próxima divulgação do TSE' : 'O histórico aparece quando o TSE divulgar os primeiros votos';
    return `${svg}<text class="chart-axis" x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="12">${msg}</text></svg>`;
  }
  const t0 = pts[0].t;
  const t1 = Math.max(pts.at(-1).t, t0 + 30 * 60e3);
  const x = (t) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const intervalo = [5, 10, 15, 30, 60, 120].map((m) => m * 60e3).find((iv) => (t1 - t0) / iv <= 6) || 4 * HORA;
  for (let t = Math.ceil(t0 / intervalo) * intervalo; t <= t1; t += intervalo) {
    svg += `<text class="chart-axis" x="${x(t)}" y="${H - 4}" text-anchor="middle">${hhmm(t)}</text>`;
  }

  // Uma faixa por candidato, cada uma com a própria escala (mínimo de 1 ponto percentual),
  // para que subidas e descidas pequenas fiquem visíveis.
  const gap = 8;
  const faixa = (H - pad.t - pad.b - gap * (top.length - 1)) / top.length;
  top.forEach((c, i) => {
    const serie = pts.filter((p) => p.c[c.n] != null);
    const vals = serie.map((p) => p.c[c.n]);
    const meio = (Math.min(...vals) + Math.max(...vals)) / 2;
    const amp = Math.max(1, (Math.max(...vals) - Math.min(...vals)) * 1.4);
    const lo = meio - amp / 2, hi = meio + amp / 2;
    const y0 = pad.t + i * (faixa + gap);
    const y = (v) => y0 + (1 - (v - lo) / (hi - lo)) * faixa;
    svg += `<line class="chart-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y0}" y2="${y0}"/>
      <line class="chart-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y0 + faixa}" y2="${y0 + faixa}"/>
      <text class="chart-axis" x="${pad.l - 8}" y="${y0 + 8}" text-anchor="end">${pct(hi, 1)}</text>
      <text class="chart-axis" x="${pad.l - 8}" y="${y0 + faixa}" text-anchor="end">${pct(lo, 1)}</text>`;
    const linha = serie.map((p, k) => `${k ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.c[c.n]).toFixed(1)}`).join('');
    svg += `<path class="chart-draw" d="${linha}" pathLength="1" fill="none" stroke="${c.cor}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`;
    const ult = serie.at(-1);
    svg += `<circle cx="${x(ult.t)}" cy="${y(ult.c[c.n])}" r="4" fill="${c.cor}" stroke="#0e131c" stroke-width="2"/>`;
    const delta = ult.c[c.n] - serie[0].c[c.n];
    const igual = Math.abs(delta) < 0.005;
    const seta = igual ? '=' : delta > 0 ? '▲' : '▼';
    const cls = igual ? '' : delta > 0 ? 'sobe' : 'desce';
    const lx = W - pad.r + 12, ly = y0 + faixa / 2;
    svg += `<text x="${lx}" y="${ly - 2}" font-size="11.5" font-weight="600" fill="${c.cor}">${esc(nomeProprio(c.nome).split(' ')[0])} ${pct(ult.c[c.n], 2)}</text>
      <text x="${lx}" y="${ly + 11}" font-size="10.5" class="chart-delta ${cls}">${seta} ${pct(Math.abs(delta), 2).replace('%', '')} p.p. desde ${hhmm(t0)}</text>`;
  });
  // Faixas invisíveis com dica (title) em cada divulgação.
  for (const p of pts) {
    const dica = `${hhmm(p.t)} · ${pct(p.pct)} das seções\n` + top.map((c) => `${nomeProprio(c.nome)}: ${pct(p.c[c.n], 2)}`).join('\n');
    svg += `<rect x="${x(p.t) - 4}" y="${pad.t}" width="8" height="${H - pad.t - pad.b}" fill="transparent"><title>${esc(dica)}</title></rect>`;
  }
  return svg + '</svg>';
}

export function renderEvolucao(d, largura, state) {
  const temCandidatos = d.cargo.federal;
  const modo = temCandidatos ? state.evoModo : 'secoes';
  const seg = temCandidatos
    ? `<div class="seg evolucao__seg" role="group" aria-label="Gráfico">
        <button data-evo="secoes" class="${modo === 'secoes' ? 'is-on' : ''}" aria-pressed="${modo === 'secoes'}">Seções apuradas</button>
        <button data-evo="candidatos" class="${modo === 'candidatos' ? 'is-on' : ''}" aria-pressed="${modo === 'candidatos'}">Candidatos</button>
      </div>`
    : '';
  if (modo === 'candidatos') {
    return `<div class="evolucao__txt">
        <h2 class="card__title">Histórico de resultado</h2>
        ${seg}
        <p class="card__sub evolucao__sub">% dos votos válidos a cada divulgação</p>
      </div>
      <div class="evolucao__chart">${renderCandidatos(d, largura)}</div>`;
  }
  const { pill, svg } = renderSecoes(d, largura);
  return `<div class="evolucao__txt">
      <h2 class="card__title">Evolução da apuração nacional</h2>
      ${seg ? `${seg}<p class="card__sub evolucao__sub">Percentual de seções totalizadas</p>` : '<p class="card__sub" style="margin-top:12px">Percentual de seções totalizadas</p>'}
    </div>
    <div class="evolucao__chart">${pill}${svg}</div>`;
}


import { pct, hora } from '../format.js';

const HORA = 3600e3;
const hh = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false });

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

export function renderEvolucao(d, largura, state) {
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
    svg += `<path class="chart-line" d="${line}"/>`;
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
    svg += `<text class="chart-axis" x="${(pad.l + W - pad.r) / 2}" y="${y(50) + 4}" text-anchor="middle" font-size="12">A totalização começa às 17h (horário de Brasília)</text>`;
  }
  svg += `</svg>`;

  const pill = d.status === 'apurando'
      ? `<span class="ao-vivo"><i></i>Ao vivo</span>`
      : d.status === 'finalizado'
        ? `<span class="ao-vivo ao-vivo--off"><i></i>Finalizada</span>`
        : `<span class="ao-vivo ao-vivo--off"><i></i>Aguardando</span>`;

  return `<div class="evolucao__txt">
      <h2 class="card__title">Evolução da apuração nacional</h2>
      <p class="card__sub" style="margin-top:12px">Percentual de seções totalizadas</p>
    </div>
    <div class="evolucao__chart">${pill}${svg}</div>`;
}

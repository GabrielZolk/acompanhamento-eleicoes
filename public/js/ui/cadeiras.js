// Projeção de cadeiras (deputados): hemiciclo + lista de partidos.
// Usa a distribuição de vagas que o TSE recalcula a cada atualização (quociente eleitoral,
// quociente partidário e sobras); dentro das federações, as vagas vão para os mais votados.
import { int, pct, esc } from '../format.js';
import { UF_BY_CODE, nomeDoCargo, tituloDoCargo } from '../ufs.js';
import { corPartido } from '../colors.js';
import * as modal from './modais.js';

// Pontos de um hemiciclo com `total` cadeiras, da esquerda para a direita.
function pontosHemiciclo(total) {
  const linhas = Math.max(1, Math.min(12, Math.round(Math.sqrt(total) / 2.1)));
  const r0 = linhas === 1 ? 1 : 0.42;
  const raios = Array.from({ length: linhas }, (_, i) => (linhas === 1 ? 1 : r0 + ((1 - r0) * i) / (linhas - 1)));
  const somaR = raios.reduce((s, r) => s + r, 0);
  const porLinha = raios.map((r) => Math.max(1, Math.round((total * r) / somaR)));
  let dif = total - porLinha.reduce((s, n) => s + n, 0);
  for (let i = linhas - 1; dif !== 0; i = (i - 1 + linhas) % linhas) {
    porLinha[i] += Math.sign(dif);
    dif -= Math.sign(dif);
  }
  const pts = [];
  raios.forEach((r, i) => {
    const n = porLinha[i];
    for (let j = 0; j < n; j++) {
      const a = n === 1 ? Math.PI / 2 : Math.PI - (j * Math.PI) / (n - 1);
      pts.push({ x: r * Math.cos(a), y: -r * Math.sin(a), a });
    }
  });
  pts.sort((p, q) => q.a - p.a || p.y - q.y);
  const dr = linhas === 1 ? 0.3 : (1 - r0) / (linhas - 1);
  const arco = Math.min(...raios.map((r, i) => (porLinha[i] > 1 ? (Math.PI * r) / (porLinha[i] - 1) : 1)));
  return { pts, raio: Math.min(0.06, 0.4 * Math.min(dr, arco)) };
}

export function hemiciclo(bancadas, total) {
  const { pts, raio } = pontosHemiciclo(total);
  const cores = [];
  for (const b of bancadas) for (let i = 0; i < b.cadeiras; i++) cores.push(b.cor);
  const maioria = Math.floor(total / 2) + 1;
  return `<svg class="hemiciclo" viewBox="-1.08 -1.08 2.16 1.16" role="img" aria-label="Distribuição de ${total} cadeiras">
    ${pts.map((p, i) => `<circle cx="${p.x.toFixed(4)}" cy="${p.y.toFixed(4)}" r="${raio.toFixed(4)}" fill="${cores[i] || '#2c313c'}" style="animation-delay:${Math.round((i / pts.length) * 700)}ms"/>`).join('')}
    <text x="0" y="-0.13" text-anchor="middle" class="hemiciclo__n">${int(total)}</text>
    <text x="0" y="-0.01" text-anchor="middle" class="hemiciclo__sub">cadeiras · maioria ${int(maioria)}</text>
  </svg>`;
}

function lista(bancadas, total) {
  return `<div class="bancadas">${bancadas
    .map((b) => `<button class="bancada" data-partido="${esc(b.sigla)}" style="--c:${b.cor}" title="Ver o desempenho do ${esc(b.sigla)}">
      <span class="dot"></span><span class="bancada__sg">${esc(b.sigla)}</span>
      <span class="bancada__bar"><i style="width:${((b.cadeiras / total) * 100).toFixed(2)}%"></i></span>
      <b>${b.cadeiras}</b></button>`)
    .join('')}</div>`;
}

export function abrirCadeiras(d, uf, onPartido) {
  const cargo = d.cargo;
  const federal = cargo.key === 'camara';
  let escopo = 'uf';

  const render = () => {
    let bancadas, total, sub;
    if (escopo === 'br') {
      bancadas = d.bancadas || [];
      total = bancadas.reduce((s, b) => s + b.cadeiras, 0);
      sub = federal ? 'Câmara dos Deputados · todos os estados' : 'Soma das 27 Assembleias e da Câmara Legislativa do DF';
    } else {
      const e = d.estados[uf] || {};
      bancadas = (e.partidos || []).filter((p) => p.cadeiras > 0).map((p) => ({ sigla: p.sigla, cadeiras: p.cadeiras, cor: p.cor || corPartido(p.sigla) }));
      total = e.vagas || bancadas.reduce((s, b) => s + b.cadeiras, 0);
      sub = `${tituloDoCargo(cargo, uf)} · ${UF_BY_CODE[uf]?.nome || uf.toUpperCase()}${e.quociente ? ` · quociente eleitoral ${int(e.quociente)} votos` : ''}`;
    }
    const secoes = escopo === 'br' ? d.nacional.secoes : d.estados[uf]?.secoes;
    const final = d.status === 'finalizado';
    const fed = escopo === 'uf' ? (d.estados[uf]?.agremiacoes || []).filter((a) => a.tipo === 'Federação' && a.vagas > 0) : [];
    modal.corpo.innerHTML = `<h3>Projeção de cadeiras — ${esc(nomeDoCargo(cargo, uf).replace('Deputado', 'Deputados').replace('Federal', 'federais').replace('Estadual', 'estaduais').replace('Distrital', 'distritais'))}</h3>
      <p class="card__sub">${esc(sub)}</p>
      <div class="mtabs">
        <button data-escopo="uf" class="${escopo === 'uf' ? 'is-active' : ''}">${esc(UF_BY_CODE[uf]?.nome || uf.toUpperCase())}</button>
        <button data-escopo="br" class="${escopo === 'br' ? 'is-active' : ''}">${federal ? 'Brasil (513)' : 'Todos os estados'}</button>
      </div>
      ${total ? hemiciclo(bancadas, total) + lista(bancadas, total) : '<p class="empty">Ainda não há votos suficientes para projetar as cadeiras.</p>'}
      ${fed.length ? `<p class="nota">Federações (contam como um partido na divisão das vagas): ${fed.map((a) => `${esc(a.sigla)} — ${a.vagas} ${a.vagas === 1 ? 'vaga' : 'vagas'}`).join(' · ')}. Acima, cada vaga aparece no partido do candidato mais votado da federação.</p>` : ''}
      <p class="nota"><b>${final ? 'Resultado final.' : 'Estimativa.'}</b> ${final ? '' : `Calculada com os votos apurados até agora (${pct(secoes?.pct, 2)} das seções) pela distribuição de vagas que o TSE refaz a cada atualização: quociente eleitoral, quociente partidário e sobras. Muda até o fim da totalização.`}</p>`;
  };

  modal.abrir('');
  render();
  modal.corpo.onclick = (ev) => {
    const b = ev.target.closest('[data-escopo]');
    if (b) {
      escopo = b.dataset.escopo;
      render();
      return;
    }
    const p = ev.target.closest('[data-partido]');
    if (p) onPartido(p.dataset.partido);
  };
}

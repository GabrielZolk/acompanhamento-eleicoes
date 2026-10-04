import { esc, pct, compacto, nomeProprio } from '../format.js';
import { ICON } from './common.js';

let icones = null;

// Silhuetas das regiões geradas a partir da própria malha do mapa.
export function prepararIcones(geo, regioes) {
  icones = {};
  const todos = [];
  for (const r of regioes) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, d = '';
    for (const uf of r.ufs) {
      const s = geo.states[uf];
      if (!s) continue;
      d += s.d;
      x0 = Math.min(x0, s.bbox[0]); y0 = Math.min(y0, s.bbox[1]);
      x1 = Math.max(x1, s.bbox[2]); y1 = Math.max(y1, s.bbox[3]);
    }
    todos.push(d);
    icones[r.id] = `<svg class="reg__icon" viewBox="${x0 - 8} ${y0 - 8} ${x1 - x0 + 16} ${y1 - y0 + 16}" aria-hidden="true"><path d="${d}"/></svg>`;
  }
  icones.br = `<svg class="regioes__icon" viewBox="-4 -4 1008 975" aria-hidden="true"><path d="${todos.join('')}" fill="currentColor"/></svg>`;
}

function rotulo(s, modo) {
  if (s.key === 'outros') return '';
  if (modo === 'votos') return s.votos > 0 && s.pct >= 16 ? compacto(s.votos) : '';
  return s.pct >= 12 ? `${Math.round(s.pct)}%` : '';
}

function stack(segs, modo) {
  return `<div class="stack">${segs
    .filter((s) => s.pct > 0)
    .map((s) => `<span class="${s.key === 'outros' ? 'outros' : ''}" style="--c:${s.cor || '#343c4d'};width:${s.pct.toFixed(2)}%" title="${esc(s.label)}: ${pct(s.pct)}">${rotulo(s, modo)}</span>`)
    .join('')}</div>`;
}

// Segmentos de uma UF, na mesma ordem e cores dos segmentos da região.
function segmentosUF(d, uf, ordem) {
  const e = d.estados[uf];
  if (!e?.votos?.validos) return [];
  const votos = {};
  if (d.cargo.federal) for (const c of e.candidatos) votos[c.n] = c.votos;
  else if (d.cargo.key === 'camara') for (const p of e.partidos) votos[p.sigla] = p.votos;
  else for (const c of e.candidatos) votos[c.partido] = (votos[c.partido] || 0) + c.votos;
  let usado = 0;
  const segs = ordem.map((s) => {
    const v = votos[s.key] || 0;
    usado += v;
    return { ...s, votos: v, pct: (v / e.votos.validos) * 100 };
  });
  const resto = Math.max(0, e.votos.validos - usado);
  segs.push({ key: 'outros', label: 'Outros', votos: resto, pct: (resto / e.votos.validos) * 100 });
  return segs;
}

export function renderRegioes(d, state) {
  const modo = state.regiaoModo;
  const nomeSeg = (s) => (d.cargo.federal && s.key !== 'outros' ? nomeProprio(s.label) : s.label);
  return `<div class="regioes__head">
      ${icones?.br || ''}
      <h2 class="card__title card__title--sm">Panorama por região</h2>
      <label class="select select--sm">
        <select data-action="regiao-modo" aria-label="Medida">
          <option value="validos" ${modo === 'validos' ? 'selected' : ''}>Votos válidos</option>
          <option value="votos" ${modo === 'votos' ? 'selected' : ''}>Total de votos</option>
        </select>${ICON.chevDown}
      </label>
    </div>
    <div class="regioes__cols">Seções</div>
    ${d.regioes
      .map((r) => {
        const aberta = state.regiaoAberta === r.id;
        const segs = r.segmentos.map((s) => ({ ...s, label: nomeSeg(s) }));
        const ordem = segs.filter((s) => s.key !== 'outros');
        return `<div class="reg ${aberta ? 'is-open' : ''}" data-key="r${r.id}">
          <button class="reg__row" data-reg="${r.id}" aria-expanded="${aberta}">
            ${icones?.[r.id] || '<span></span>'}
            <span class="reg__nome">${esc(r.nome)}</span>
            ${stack(segs, modo)}
            <span class="reg__sec">${pct(r.secoes.pct)}</span>
            <span class="reg__chev">${ICON.chevRight}</span>
          </button>
          ${
            aberta
              ? `<div class="reg__ufs">${r.ufs
                  .map((uf) => `<div class="reg__uf"><b>${uf.toUpperCase()}</b>${stack(segmentosUF(d, uf, ordem), modo)}<span class="reg__sec">${pct(d.estados[uf]?.secoes?.pct)}</span><span></span></div>`)
                  .join('')}</div>`
              : ''
          }
        </div>`;
      })
      .join('')}`;
}

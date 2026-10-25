// 1º × 2º turno lado a lado (Presidente, no 2º turno): dois mapas por estado com quem liderava entre
// os dois finalistas no 1º turno (resultado final, data/2026/presidente-1t.json) e quem lidera agora.
// Cor = líder; quanto mais forte, maior a vantagem. Contorno amarelo no 2º mapa: o estado virou.
import { esc, pct, mix, nomeProprio } from '../format.js';
import { UF_BY_CODE } from '../ufs.js';

const SEM = '#2c313c';
const CHEIO = 20; // vantagem (p.p. dos válidos dos dois) com cor cheia
const CORES = { 13: '#e5484d', 22: '#3b82f6' };

let t1 = null, pedindo = false;
export function carregarT1Turnos(aoCarregar) {
  if (t1 || pedindo) return;
  pedindo = true;
  fetch('data/2026/presidente-1t.json').then((r) => r.json()).then((j) => { t1 = j; aoCarregar(); }).catch(() => { pedindo = false; });
}

// { 13: %, 22: % } entre os dois, ou null.
function fatias(a, b) {
  const s = (a || 0) + (b || 0);
  return s > 0 ? { 13: (a / s) * 100, 22: (b / s) * 100 } : null;
}
const lider = (f) => (f ? (f[13] >= f[22] ? '13' : '22') : null);
function cor(f, cores) {
  if (!f) return SEM;
  const l = lider(f);
  const forca = Math.min(1, Math.abs(f[13] - f[22]) / CHEIO);
  return mix(cores[l], SEM, 0.62 - 0.62 * forca);
}

export function renderTurnos(d, geo) {
  if (!d?.cargo?.federal || d.turno !== 2 || !geo) return '';
  if (!t1) return '';
  const nac = Object.fromEntries((d.nacional?.candidatos || []).map((c) => [c.n, c]));
  const cores = { 13: nac[13]?.cor || CORES[13], 22: nac[22]?.cor || CORES[22] };
  const nome = (n) => esc(nomeProprio(nac[n]?.nome || t1.candidatos[n]));
  const ufs = Object.keys(geo.states);

  const antes = {}, agora = {};
  for (const uf of ufs) {
    const x = t1.uf[uf];
    antes[uf] = x ? fatias(x.c[13], x.c[22]) : null;
    const e = d.estados?.[uf];
    const v = Object.fromEntries((e?.candidatos || []).map((c) => [c.n, c.votos]));
    agora[uf] = e?.secoes?.apuradas > 0 ? fatias(v[13], v[22]) : null;
  }
  const viraram = ufs.filter((uf) => antes[uf] && agora[uf] && lider(antes[uf]) !== lider(agora[uf]));
  const conta = (m, n) => ufs.filter((uf) => lider(m[uf]) === n).length;

  const brAntes = fatias(t1.br.c[13], t1.br.c[22]);
  const brAgora = fatias(nac[13]?.votos, nac[22]?.votos);
  const apurado = d.nacional?.secoes?.pct;

  const dica = (uf, f, f0) => {
    const n = UF_BY_CODE[uf]?.nome || uf.toUpperCase();
    if (!f) return `${n}: sem votos apurados`;
    let t = `${n}: Lula ${pct(f[13], 1)} × Flávio ${pct(f[22], 1)}`;
    if (f0) t += ` (1º turno: ${pct(f0[13], 1)} × ${pct(f0[22], 1)})`;
    return t;
  };
  const mapa = (m, comVirada) => `<svg class="turnos__svg" viewBox="0 0 ${geo.w} ${geo.h}" role="img">
      ${ufs.map((uf) => `<path d="${geo.states[uf].d}" fill="${cor(m[uf], cores)}" class="${comVirada && viraram.includes(uf) ? 'turnos__virou' : ''}"><title>${esc(dica(uf, m[uf], comVirada ? antes[uf] : null))}</title></path>`).join('')}
      ${comVirada ? viraram.map((uf) => `<path d="${geo.states[uf].d}" class="turnos__contorno"/>`).join('') : ''}
    </svg>`;
  const placar = (f, m) => `<div class="turnos__placar">
      <span style="--c:${cores[13]}"><b>${f ? pct(f[13], 1) : '—'}</b> ${nome(13)} <small>${conta(m, '13')} estados</small></span>
      <span style="--c:${cores[22]}"><b>${f ? pct(f[22], 1) : '—'}</b> ${nome(22)} <small>${conta(m, '22')} estados</small></span>
    </div>`;

  const lista = viraram.length
    ? viraram.map((uf) => `<span class="turnos__chip" style="--c:${cores[lider(agora[uf])]}"><b>${uf.toUpperCase()}</b> ${nome(lider(antes[uf]))} → ${nome(lider(agora[uf]))}</span>`).join('')
    : '<span class="turnos__nada">Nenhum estado trocou de líder até agora.</span>';

  return `<div class="card__head"><div>
      <h2 class="card__title">1º turno × 2º turno</h2>
      <p class="card__sub">Quem liderava cada estado no 1º turno e quem lidera agora, entre ${nome(13)} e ${nome(22)}. Cor mais forte = vantagem maior. Passe o mouse nos estados.</p>
    </div></div>
    <div class="turnos__mapas">
      <figure><figcaption>1º turno <small>04/10 · resultado final</small></figcaption>${placar(brAntes, antes)}${mapa(antes, false)}</figure>
      <figure><figcaption>2º turno <small>agora · ${apurado != null ? `${pct(apurado, 1)} apurado` : 'aguardando'}</small></figcaption>${placar(brAgora, agora)}${mapa(agora, true)}</figure>
    </div>
    <div class="turnos__viradas"><span class="turnos__rot">${viraram.length ? `${viraram.length} ${viraram.length === 1 ? 'estado virou' : 'estados viraram'}` : 'Viradas'}</span>${lista}</div>
    <p class="turnos__nota">Percentuais só entre os dois finalistas (no 1º turno, sem os votos dos outros candidatos). Com a apuração em andamento, o 2º turno ainda muda.</p>`;
}

import { int, pct, sinal, esc, nomeProprio } from '../format.js';
import { UFS, UF_BY_CODE } from '../ufs.js';
import { avatar, avatarPartido, donut, ICON } from './common.js';

const VISIVEIS = 6;

export function pills(c) {
  if (c.eleito) return `<span class="pill pill--eleito">Eleito</span>`;
  if (/2º turno/i.test(c.situacao)) return `<span class="pill pill--turno">2º turno</span>`;
  return '';
}

// Antes da apuração não há ranking: o selo mostra o número de urna do candidato.
function selo(i, n, ranking) {
  if (!ranking) return `<span class="cand__rank cand__rank--num" title="Número na urna">${esc(n)}</span>`;
  return `<span class="cand__rank ${i < 3 ? 'cand__rank--cor' : ''}">${i + 1}</span>`;
}

function linhaCandidato(c, i, { lider, mostrarVotos, ranking = true }) {
  return `<div class="cand ${lider ? 'cand--lider' : ''}" data-key="c${c.n}" style="--c:${c.cor}">
    ${selo(i, c.n, ranking)}
    ${avatar(c)}
    <div class="cand__info">
      <div class="cand__nome" title="${esc(nomeProprio(c.nomeCompleto || c.nome))}">${esc(nomeProprio(c.nome))}${pills(c)}</div>
      <div class="cand__partido">${esc(c.partido)}</div>
      <div class="bar"><i style="width:${Math.min(100, c.pct).toFixed(2)}%"></i></div>
    </div>
    <div class="cand__nums">
      <div class="cand__pct">${pct(c.pct)}</div>
      <div class="cand__votos">${mostrarVotos ? `${int(c.votos)} votos` : '&nbsp;'}</div>
    </div>
  </div>`;
}

function linhaPartido(p, i, { lider, ranking = true }) {
  const det = p.eleitos ? `${p.eleitos} ${p.eleitos === 1 ? 'eleito' : 'eleitos'}` : `${int(p.candidatos)} candidatos`;
  return `<div class="cand ${lider ? 'cand--lider' : ''}" data-key="p${esc(p.sigla)}" style="--c:${p.cor}">
    ${ranking ? selo(i, '', true) : '<span class="cand__rank">–</span>'}
    ${avatarPartido(p)}
    <div class="cand__info">
      <div class="cand__nome" title="${esc(p.nome)}">${esc(p.nome === p.sigla ? p.sigla : nomeProprio(p.nome))}</div>
      <div class="cand__partido">${esc(p.sigla)}<span class="tag">${det}</span></div>
      <div class="bar"><i style="width:${Math.min(100, p.pct).toFixed(2)}%"></i></div>
    </div>
    <div class="cand__nums">
      <div class="cand__pct">${pct(p.pct)}</div>
      <div class="cand__votos">${int(p.votos)} votos</div>
    </div>
  </div>`;
}

// Chip compacto ("SP ▾") com um <select> nativo transparente por cima.
function seletorUF(uf) {
  return `<label class="chip chip--select" title="Escolher estado">
    ${uf.toUpperCase()} ${ICON.chevDown}
    <select data-action="uf" aria-label="Estado">
      ${UFS.map((u) => `<option value="${u.uf}" ${u.uf === uf ? 'selected' : ''}>${esc(u.nome)} (${u.uf.toUpperCase()})</option>`).join('')}
    </select>
  </label>`;
}

function stats({ eleitorado, secoes, eleitorado2022, rotuloEleitorado, nacional }) {
  let delta = '';
  if (nacional && eleitorado2022 && eleitorado?.total) {
    const d = ((eleitorado.total - eleitorado2022) / eleitorado2022) * 100;
    delta = `<div class="stats__delta ${d < 0 ? 'stats__delta--neg' : ''}">${d >= 0 ? '▲' : '▼'} ${sinal(d)}</div>
      <div class="stats__hint">em relação a 2022</div>`;
  } else {
    delta = `<div class="stats__hint" style="margin-top:6px">${esc(rotuloEleitorado)}</div>`;
  }
  return `<div class="stats">
    <div class="stats__col">
      <div class="stats__label">${ICON.people} Eleitorado total</div>
      <div class="stats__value">${int(eleitorado?.total)}</div>
      ${delta}
    </div>
    <div class="stats__col">
      ${donut(secoes?.pct, 70, 7, 12.5, 'dn-esq')}
      <div>
        <div class="stats__label">Seções apuradas</div>
        <div class="stats__value">${int(secoes?.apuradas)}</div>
        <div class="stats__hint">de ${int(secoes?.total)} seções</div>
      </div>
    </div>
  </div>`;
}

export function renderDisputa(d, state) {
  const cargo = d.cargo;
  if (cargo.federal) {
    const n = d.nacional;
    const temVotos = n.secoes.apuradas > 0;
    const lista = n.candidatos.slice(0, VISIVEIS);
    return `<div class="disputa__head">
        <div class="card__head">
          <h2 class="card__title">${esc(cargo.titulo)}</h2>
          <span class="chip">${d.turno}º turno</span>
        </div>
        <div class="disputa__sub">
          <p class="card__sub">Votos válidos&nbsp; •&nbsp; ${d.semExterior ? 'Somente Brasil' : 'Brasil e exterior'}</p>
          <label class="check" title="O total nacional do TSE inclui os votos dados no exterior">
            <input type="checkbox" data-action="exterior" ${state.incluirExterior ? 'checked' : ''}>
            <span class="check__box"><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.2 4.1 7.3 8 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
            Incluir exterior
          </label>
        </div>
      </div>
      <div class="disputa__list">
        ${lista.map((c, i) => linhaCandidato(c, i, { lider: i === 0 && temVotos, mostrarVotos: true, ranking: temVotos })).join('')}
      </div>
      <button class="btn-row" data-action="todos">Ver todos os candidatos ${n.candidatos.length > VISIVEIS ? `(${n.candidatos.length})` : ''} ${ICON.chevRight}</button>
      ${stats({ eleitorado: n.eleitorado, secoes: n.secoes, eleitorado2022: d.eleitorado2022, nacional: true })}`;
  }

  const e = d.estados[state.uf];
  const nomeUF = UF_BY_CODE[state.uf]?.nome || state.uf.toUpperCase();
  const temVotos = e?.secoes?.apuradas > 0;
  let corpo;
  if (!e || !e.votos) {
    corpo = `<p class="empty">Resultado de ${esc(nomeUF)} indisponível no momento.</p>`;
  } else if (cargo.key === 'camara') {
    corpo = e.partidos.slice(0, VISIVEIS).map((p, i) => linhaPartido(p, i, { lider: i === 0 && temVotos, ranking: temVotos })).join('');
  } else {
    const vagas = e.vagas || 1;
    corpo = e.candidatos
      .slice(0, VISIVEIS)
      .map((c, i) => linhaCandidato(c, i, { lider: i < vagas && temVotos, mostrarVotos: true, ranking: temVotos }))
      .join('');
  }
  const sub =
    cargo.key === 'camara'
      ? `Votos por partido&nbsp; •&nbsp; ${esc(nomeUF)}${e?.vagas ? `&nbsp; •&nbsp; ${e.vagas} vagas` : ''}`
      : `Votos válidos&nbsp; •&nbsp; ${esc(nomeUF)}${cargo.key === 'senado' && e?.vagas ? `&nbsp; •&nbsp; ${e.vagas} vagas` : ''}`;
  const totalItens = cargo.key === 'camara' ? e?.totalCandidatos : e?.candidatos?.length;
  return `<div class="card__head disputa__head">
      <div>
        <h2 class="card__title">${esc(cargo.titulo)}</h2>
        <p class="card__sub">${sub}</p>
      </div>
      ${seletorUF(state.uf)}
    </div>
    <div class="disputa__list">${corpo}</div>
    <button class="btn-row" data-action="todos">${cargo.key === 'camara' ? 'Ver partidos e candidatos' : 'Ver todos os candidatos'} ${totalItens > VISIVEIS ? `(${int(totalItens)})` : ''} ${ICON.chevRight}</button>
    ${stats({ eleitorado: e?.eleitorado, secoes: e?.secoes, rotuloEleitorado: `aptos a votar em ${state.uf.toUpperCase()}` })}`;
}

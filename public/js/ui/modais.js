import { int, pct, esc, nomeProprio, ufLabel } from '../format.js';
import { UF_BY_CODE } from '../ufs.js';
import { avatar, avatarPartido } from './common.js';
import { pills } from './disputa.js';
import { linhaAtualizacao } from './paineis.js';

const modal = document.getElementById('modal');
const body = document.getElementById('modal-body');
let aoFechar = null;

export function abrir(html, { onClose } = {}) {
  body.innerHTML = html;
  modal.hidden = false;
  aoFechar = onClose || null;
  modal.querySelector('.modal__close').focus();
}
export function fechar() {
  modal.hidden = true;
  body.innerHTML = '';
  aoFechar?.();
  aoFechar = null;
}
export const aberto = () => !modal.hidden;
export const corpo = body;

modal.addEventListener('click', (ev) => {
  if (ev.target.closest('[data-close]')) fechar();
});
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && !modal.hidden) fechar();
});

function linhaCand(c, i) {
  const det = [c.partido, c.agremiacao ? `${c.agremiacao.tipo} ${nomeProprio(c.agremiacao.nome)}` : null, c.vice ? `${c.vice.tipo === 's' ? 'Suplente' : 'Vice'}: ${nomeProprio(c.vice.nome)}` : null]
    .filter(Boolean)
    .join(' · ');
  return `<div class="mrow" style="--c:${c.cor}">
    <span class="mrow__n">${i + 1}º</span>
    ${avatar(c, 'avatar--sm')}
    <div style="min-width:0">
      <div class="mrow__nome">${esc(nomeProprio(c.nome))} <span style="color:var(--muted);font-weight:500">${esc(c.n)}</span>${pills(c)}</div>
      <div class="mrow__det" title="${esc(det)}">${esc(det)}</div>
    </div>
    <div class="bar" style="margin:0"><i style="width:${Math.min(100, c.pct).toFixed(2)}%"></i></div>
    <div class="mrow__num"><b>${pct(c.pct)}</b><small>${int(c.votos)} votos</small></div>
  </div>`;
}

function linhaPartido(p, i) {
  return `<div class="mrow" style="--c:${p.cor}">
    <span class="mrow__n">${i + 1}º</span>
    ${avatarPartido(p, 'avatar--sm')}
    <div style="min-width:0">
      <div class="mrow__nome">${esc(p.sigla)}</div>
      <div class="mrow__det">${p.nome !== p.sigla ? `${esc(nomeProprio(p.nome))} · ` : ''}${int(p.candidatos)} candidatos${p.eleitos ? ` · ${p.eleitos} eleitos` : ''}</div>
    </div>
    <div class="bar" style="margin:0"><i style="width:${Math.min(100, p.pct).toFixed(2)}%"></i></div>
    <div class="mrow__num"><b>${pct(p.pct)}</b><small>${int(p.votos)} votos</small></div>
  </div>`;
}

function grade(secoes, votos) {
  return `<div class="mgrid">
    <div class="box"><div class="box__label">Seções apuradas</div><div class="box__value box__value--sm">${pct(secoes?.pct, 2)}</div></div>
    <div class="box"><div class="box__label">Votos válidos</div><div class="box__value box__value--sm">${int(votos?.validos)}</div></div>
    <div class="box"><div class="box__label">Brancos</div><div class="box__value box__value--sm">${int(votos?.brancos)} <small>${pct(votos?.pctBrancos)}</small></div></div>
    <div class="box"><div class="box__label">Nulos</div><div class="box__value box__value--sm">${int(votos?.nulos)} <small>${pct(votos?.pctNulos)}</small></div></div>
  </div>`;
}

export function modalTodos(d, state, aba = 'partidos') {
  if (d.cargo.federal) {
    const n = d.nacional;
    return `<h3>Todos os candidatos a Presidente</h3>
      <p class="card__sub">Votos válidos · ${d.semExterior ? 'Brasil, sem o exterior' : 'Brasil e exterior'} · ${d.turno}º turno</p>
      ${grade(n.secoes, n.votos)}
      <div class="mlist">${n.candidatos.map(linhaCand).join('')}</div>`;
  }
  const e = d.estados[state.uf];
  const nome = UF_BY_CODE[state.uf]?.nome;
  if (!e?.votos) return `<h3>${esc(d.cargo.titulo)} — ${esc(nome)}</h3><p class="empty">Resultado indisponível no momento.</p>`;
  if (d.cargo.key !== 'camara') {
    return `<h3>${esc(d.cargo.titulo)} — ${esc(nome)}</h3>
      <p class="card__sub">Votos válidos${e.vagas > 1 ? ` · ${e.vagas} vagas` : ''}</p>
      ${grade(e.secoes, e.votos)}
      <div class="mlist">${e.candidatos.map(linhaCand).join('')}</div>`;
  }
  const eleitos = e.candidatos.filter((c) => c.eleito);
  const abas = [
    ['partidos', `Partidos (${e.partidos.length})`],
    ['candidatos', 'Mais votados'],
    ...(eleitos.length ? [['eleitos', `Eleitos (${eleitos.length})`]] : []),
  ];
  let lista;
  if (aba === 'candidatos') lista = e.candidatos.slice(0, 30).map(linhaCand).join('');
  else if (aba === 'eleitos') lista = eleitos.sort((a, b) => b.votos - a.votos).map(linhaCand).join('');
  else lista = e.partidos.map(linhaPartido).join('');
  return `<h3>Câmara dos Deputados — ${esc(nome)}</h3>
    <p class="card__sub">${e.vagas} vagas · ${int(e.totalCandidatos)} candidatos · votos nominais + legenda</p>
    ${grade(e.secoes, e.votos)}
    <div class="mtabs">${abas.map(([k, t]) => `<button data-aba="${k}" class="${k === aba ? 'is-active' : ''}">${t}</button>`).join('')}</div>
    <div class="mlist">${lista}</div>`;
}

export function modalUpdates(d) {
  return `<h3>Últimas atualizações</h3>
    <p class="card__sub">Seções totalizadas pelo TSE, por estado (variação em pontos percentuais das seções da UF)</p>
    <div>${d.atualizacoes.map((u) => linhaAtualizacao(d, u, 'mupd')).join('') || '<p class="empty">Nenhuma atualização ainda.</p>'}</div>`;
}

export function modalMunicipio(m) {
  if (m.erro) return `<h3>${esc(m.titulo || 'Município')}</h3><p class="empty">${esc(m.erro)}</p>`;
  if (!m.candidatos) return `<h3>${esc(m.titulo)}</h3><p class="card__sub">Carregando resultado…</p><div class="mlist">${'<div class="mrow skeleton" style="height:56px"></div>'.repeat(4)}</div>`;
  const camara = m.proporcional;
  const total = m.votos?.validos || 0;
  const partidos = (m.partidos || []).map((p) => ({ ...p, pct: total ? (p.votos / total) * 100 : 0, cor: m.candidatos.find((c) => c.partido === p.sigla)?.cor || '#94a3b8' }));
  return `<h3>${esc(nomeProprio(m.municipio))} (${ufLabel(m.uf)})</h3>
    <p class="card__sub">${esc(m.cargo)} · votos válidos</p>
    ${grade(m.secoes, m.votos)}
    <div class="mlist">${camara ? partidos.slice(0, 20).map(linhaPartido).join('') : m.candidatos.map(linhaCand).join('')}</div>`;
}

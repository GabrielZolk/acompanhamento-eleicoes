import { int, pct, esc, nomeProprio, ufLabel } from '../format.js';
import { UF_BY_CODE } from '../ufs.js';
import { avatar, avatarPartido, linhaLista } from './common.js';
import { pills } from './disputa.js';
import { linhaAtualizacao } from './paineis.js';
import { municipio2022, carregarMunicipios2022, candidatosPorPartido, comparar, pp, turno2022 } from '../compara2022.js';

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
  const det = [c.partido, c.n, c.agremiacao ? `${c.agremiacao.tipo} ${nomeProprio(c.agremiacao.nome)}` : null, c.vice ? `${c.vice.tipo === 's' ? 'Suplente' : 'Vice'}: ${nomeProprio(c.vice.nome)}` : null]
    .filter(Boolean)
    .join(' · ');
  return linhaLista({ pos: `${i + 1}º`, avatarHtml: avatar(c, 'avatar--sm'), nome: nomeProprio(c.nome), selo: pills(c), det, valor: c.pct, votos: c.votos, cor: c.cor });
}

function linhaPartido(p, i) {
  const det = [p.nome !== p.sigla ? nomeProprio(p.nome) : null, `${int(p.candidatos)} candidatos`, p.eleitos ? `${p.eleitos} eleitos` : null].filter(Boolean).join(' · ');
  return linhaLista({ pos: `${i + 1}º`, avatarHtml: avatarPartido(p, 'avatar--sm'), nome: p.sigla, det, valor: p.pct, votos: p.votos, cor: p.cor });
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
    ${m.cargo === 'Presidente' ? comparacao2022(m) : ''}
    <div class="mlist">${camara ? partidos.slice(0, 20).map(linhaPartido).join('') : m.candidatos.map(linhaCand).join('')}</div>`;
}

// ------------------------------------------------------------------ comparação com 2022 (Presidente)
// Por partido, porque o candidato do PL mudou (Jair Bolsonaro em 2022, Flávio Bolsonaro em 2026).
// Os municípios de 2022 chegam sob demanda: enquanto isso fica um espaço reservado, trocado ao chegar.
function comparacao2022(m) {
  const chave = `${m.uf}-${m.abrangencia}`;
  const a22 = municipio2022(m.turno, { uf: m.uf, cd: m.abrangencia });
  if (a22 === undefined) {
    carregarMunicipios2022(m.turno).then(
      () => {
        const el = body.querySelector(`[data-h22="${chave}"]`);
        if (el) el.outerHTML = comparacao2022(m);
      },
      () => body.querySelector(`[data-h22="${chave}"]`)?.remove(),
    );
    return `<div class="h22 h22--carregando" data-h22="${esc(chave)}">Carregando o resultado de 2022…</div>`;
  }
  if (!a22) return '';
  const { pt, pl } = candidatosPorPartido(m.candidatos);
  const apurou = m.secoes?.apuradas > 0 && m.votos?.validos > 0;
  const c = comparar(a22, apurou ? { pt: pt?.pct || 0, pl: pl?.pct || 0 } : null);
  const t = turno2022(m.turno);
  const linha = (sg, cor, nomes, v22, v26, d) => `<div class="h22__lin" style="--c:${cor}">
      <span class="h22__p"><i></i><b>${sg}</b><small>${nomes}</small></span>
      <span>${pct(v22)}</span><span>${v26 == null ? '—' : pct(v26)}</span><span class="h22__d">${d == null ? '—' : pp(d)}</span></div>`;
  const vant = (v) => `${pp(Math.abs(v)).replace('+', '')} para o ${v >= 0 ? 'PL' : 'PT'}`;
  return `<div class="h22">
    <div class="h22__tit">Comparação com 2022 <small>· ${t}º turno · por partido</small></div>
    <p class="h22__em">Em 2022: <b>Lula ${pct(c.pt22)}</b> · <b>Bolsonaro ${pct(c.pl22)}</b></p>
    <div class="h22__tab">
      <div class="h22__lin h22__lin--cab"><span>Partido</span><span>2022</span><span>2026</span><span>Variação</span></div>
      ${linha('PT', pt?.cor || '#ef4b55', 'Lula', c.pt22, c.pt26, c.dPT)}
      ${linha('PL', pl?.cor || '#3d7bf5', 'Jair → Flávio Bolsonaro', c.pl22, c.pl26, c.dPL)}
    </div>
    <p class="nota">Vantagem: ${vant(c.vantagem22)} em 2022${c.dVantagem == null ? '' : `; ${vant(c.vantagem22 + c.dVantagem)} agora`}.
      O candidato do PL mudou (Jair Bolsonaro em 2022, Flávio Bolsonaro em 2026), por isso a comparação é por partido.
      Percentuais dos votos válidos${apurou && m.secoes.pct < 100 ? `; 2026 com ${pct(m.secoes.pct)} das seções apuradas` : ''}. Fonte de 2022: TSE.</p>
  </div>`;
}

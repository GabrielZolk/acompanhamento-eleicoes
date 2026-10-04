// Desempenho de um partido em todos os cargos: Presidente, Governador, Senado e deputados,
// no país e por estado, com os candidatos do partido.
import { int, pct, esc, nomeProprio, semAcento } from '../format.js';
import { UFS } from '../ufs.js';
import { avatar, avatarPartido, linhaLista } from './common.js';
import * as modal from './modais.js';

let resumo = null; // cache do /api/partidos

async function carregarResumo() {
  if (resumo && Date.now() - resumo.em < 30000) return resumo.dados;
  const r = await fetch('/api/partidos');
  if (!r.ok) throw new Error('Não foi possível carregar os partidos.');
  resumo = { em: Date.now(), dados: await r.json() };
  return resumo.dados;
}

// Para a busca do cabeçalho: lista leve de partidos (sigla, nome, número).
export async function listaPartidos() {
  try {
    return (await carregarResumo()).partidos;
  } catch {
    return [];
  }
}

const ord = (n) => `${n}º`;
const situacao = (c, cargo) => {
  if (c.eleito) return '<span class="pill pill--eleito">Eleito</span>';
  if (/2º turno/i.test(c.situacao || '')) return '<span class="pill pill--turno">2º turno</span>';
  if (c.dentro) return `<span class="pill pill--dentro">${cargo === 'governador' ? 'Lidera' : 'Dentro'}</span>`;
  return '';
};

function cartao(titulo, valor, linha1, linha2 = '') {
  return `<div class="pcard"><div class="pcard__t">${titulo}</div><div class="pcard__v">${valor}</div>
    <div class="pcard__l">${linha1}</div>${linha2 ? `<div class="pcard__l">${linha2}</div>` : ''}</div>`;
}

function cartoes(p, vagas) {
  const pres = p.presidente
    ? cartao('Presidente', pct(p.presidente.pct, 2), `${esc(nomeProprio(p.presidente.nome))} · ${ord(p.presidente.pos)} lugar`)
    : cartao('Presidente', '—', 'Sem candidato próprio');
  const gov = p.governador.candidatos.length
    ? cartao('Governador', pct(p.governador.pct, 2), `${p.governador.candidatos.length} ${p.governador.candidatos.length === 1 ? 'candidato' : 'candidatos'}`, p.governador.dentro ? `<b>lidera em ${p.governador.dentro}</b>` : 'não lidera em nenhum estado')
    : cartao('Governador', '—', 'Sem candidatos');
  const sen = p.senado.candidatos.length
    ? cartao('Senado', pct(p.senado.pct, 2), `${p.senado.candidatos.length} ${p.senado.candidatos.length === 1 ? 'candidato' : 'candidatos'}`, p.senado.dentro ? `<b>${p.senado.dentro} dentro das vagas</b>` : 'nenhum dentro das vagas')
    : cartao('Senado', '—', 'Sem candidatos');
  const fed = cartao('Dep. federal', pct(p.camara.pct, 2), `<b>≈ ${p.camara.cadeiras} de ${int(vagas.camara)} cadeiras</b>`, `${int(p.camara.votos)} votos`);
  const est = cartao('Dep. estadual', pct(p.assembleia.pct, 2), `<b>≈ ${p.assembleia.cadeiras} de ${int(vagas.assembleia)} cadeiras</b>`, `${int(p.assembleia.votos)} votos`);
  return `<div class="pcards">${pres}${gov}${sen}${fed}${est}</div>`;
}

function tabelaEstados(p) {
  const cel = (v, tipo) => {
    if (!v) return '<td class="vazio">—</td>';
    if (tipo === 'prop') return `<td>${pct(v[0], 1)}${v[1] ? ` <b class="cad">${v[1]}</b>` : ''}</td>`;
    const dentro = tipo === 'maj' && v[1] <= (v[2] || 1);
    return `<td class="${dentro ? 'dentro' : ''}">${pct(v[0], 1)} <small>${ord(v[1])}</small></td>`;
  };
  const linhas = UFS.filter((u) => p.estados[u.uf]).map((u) => {
    const e = p.estados[u.uf];
    return `<tr><th>${u.uf.toUpperCase()}</th>${p.presidente ? cel(e.presidente, 'pos') : ''}${cel(e.governador, 'maj')}${cel(e.senado, 'maj')}${cel(e.camara, 'prop')}${cel(e.assembleia, 'prop')}</tr>`;
  });
  if (!linhas.length) return '';
  return `<h4 class="psec">Por estado</h4>
    <div class="ptabela"><table>
      <thead><tr><th></th>${p.presidente ? '<th>Presidente</th>' : ''}<th>Governador</th><th>Senado</th><th>Dep. fed. <small>(cadeiras)</small></th><th>Dep. est. <small>(cadeiras)</small></th></tr></thead>
      <tbody>${linhas.join('')}</tbody>
    </table></div>
    <p class="nota">Percentual dos votos válidos no estado. Em destaque: lidera (governador) ou está dentro das vagas (Senado). Nos deputados, o número em negrito é a projeção de cadeiras.</p>`;
}

function listaCands(titulo, cands, cargo, cor) {
  if (!cands.length) return '';
  return `<h4 class="psec">${titulo}</h4><div class="mlist">${cands
    .map((c) =>
      linhaLista({
        pos: ord(c.pos),
        avatarHtml: avatar({ nome: c.nome, cor, foto: c.foto }, 'avatar--sm'),
        nome: nomeProprio(c.nome),
        selo: situacao(c, cargo),
        uf: c.uf.toUpperCase(),
        det: [c.n, cargo === 'senado' && c.vagas > 1 ? `${c.vagas} vagas no estado` : null].filter(Boolean).join(' · '),
        valor: c.pct,
        votos: c.votos,
        cor,
        casas: 2,
      }),
    )
    .join('')}</div>`;
}

function detalhe(j) {
  const p = j.partido;
  return `<div class="phead">${avatarPartido(p)}
      <div style="min-width:0"><h3>${esc(p.nome === p.sigla ? p.sigla : nomeProprio(p.nome))}</h3>
      <p class="card__sub">${esc(p.sigla)}${p.n ? ` · número ${esc(p.n)}` : ''}${p.federacao ? ` · ${esc(nomeProprio(p.federacao))}` : ''}</p></div></div>
    ${cartoes(p, j.vagas)}
    ${tabelaEstados(p)}
    ${listaCands('Candidatos a governador', p.governador.candidatos, 'governador', p.cor)}
    ${listaCands('Candidatos ao Senado', p.senado.candidatos, 'senado', p.cor)}
    ${listaCands('Deputados federais mais votados', p.camara.top, 'camara', p.cor)}
    ${listaCands('Deputados estaduais mais votados', p.assembleia.top, 'assembleia', p.cor)}
    <p class="nota">Percentuais sobre os votos válidos de cada cargo, com as seções apuradas até agora. Cadeiras: estimativa pela distribuição de vagas que o TSE refaz a cada atualização.</p>`;
}

export function abrirPartidos(sigla) {
  const st = { sigla, termo: '', seq: 0 };
  modal.abrir(`<div class="pbusca">
      <label class="cbusca__input">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input type="search" data-pbusca placeholder="Buscar partido (sigla, nome ou número)" autocomplete="off" aria-label="Buscar partido">
      </label>
      <div class="pchips" data-chips></div>
    </div>
    <div data-detalhe><p class="empty">Carregando…</p></div>`);
  const body = modal.corpo;
  const $ = (s) => body.querySelector(s);

  function chips() {
    if (!resumo) return;
    const t = semAcento(st.termo.trim());
    const lista = resumo.dados.partidos.filter((p) => !t || semAcento(p.sigla).includes(t) || semAcento(p.nome).includes(t) || p.n === t);
    $('[data-chips]').innerHTML = lista
      .map((p) => `<button class="pchip ${p.sigla === st.sigla ? 'is-on' : ''}" data-sg="${esc(p.sigla)}" style="--c:${p.cor}" title="${esc(p.nome)}">
        <span class="dot"></span>${esc(p.sigla)}${p.camara.cadeiras ? `<small>${p.camara.cadeiras}</small>` : ''}</button>`)
      .join('') || '<span class="nota">Nenhum partido encontrado.</span>';
  }

  async function mostrar(sg) {
    st.sigla = sg;
    chips();
    const id = ++st.seq;
    $('[data-detalhe]').innerHTML = '<p class="empty">Carregando…</p>';
    try {
      const r = await fetch(`/api/partidos?sigla=${encodeURIComponent(sg)}`);
      const j = await r.json();
      if (id !== st.seq || !modal.aberto()) return;
      $('[data-detalhe]').innerHTML = r.ok ? detalhe(j) : `<p class="empty">${esc(j.erro || 'Partido não encontrado.')}</p>`;
    } catch {
      if (id === st.seq && modal.aberto()) $('[data-detalhe]').innerHTML = '<p class="empty">Falha de conexão com o servidor.</p>';
    }
  }

  $('[data-pbusca]').addEventListener('input', (ev) => {
    st.termo = ev.target.value;
    chips();
  });
  $('[data-chips]').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-sg]');
    if (b) mostrar(b.dataset.sg);
  });

  carregarResumo()
    .then((dados) => {
      if (!modal.aberto()) return;
      const alvo = dados.partidos.find((p) => p.sigla.toUpperCase() === (st.sigla || '').toUpperCase()) || dados.partidos[0];
      mostrar(alvo.sigla);
    })
    .catch((err) => {
      if (modal.aberto()) $('[data-detalhe]').innerHTML = `<p class="empty">${esc(err.message)}</p>`;
    });
}

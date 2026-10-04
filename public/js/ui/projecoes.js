// Projeções (estimativa) por cidade: Presidente (país e estados), Governador e Senado por estado.
import { pct, esc, nomeProprio } from '../format.js';
import { UFS, UF_BY_CODE } from '../ufs.js';
import { corPartido } from '../colors.js';
import * as modal from './modais.js';

const TITULOS = /^(escritor|delegad[oa]|pastora?|dra?\.?|doutora?|professora?|prof\.?|coronel|capit[aã]o|general|sargento|cabo|padre|veterin[aá]ri[oa]|irm[aã]o?|mestre|tenente|major|comandante)$/i;
export function nomeCurto(nome) {
  const partes = nomeProprio(nome).split(' ');
  const i = partes.findIndex((p) => !TITULOS.test(p));
  return partes[i >= 0 ? i : 0];
}

// Barras "agora × projeção" para uma lista de candidatos (já ordenada pela projeção).
export function barrasProjecao(lista, { cores = {}, vagas = 1, max = 4 } = {}) {
  const top = lista.slice(0, max);
  if (!top.length) return '<p class="empty">Ainda não há votos suficientes para projetar.</p>';
  const escala = Math.max(60, Math.ceil((Math.max(...top.map((c) => Math.max(c.atual, c.projetado))) + 6) / 10) * 10);
  const x = (v) => `${Math.min(100, (v / escala) * 100).toFixed(2)}%`;
  return top
    .map((c, i) => {
      const cor = cores[c.n] || corPartido(c.partido);
      const dif = c.projetado - c.atual;
      const cls = Math.abs(dif) < 0.05 ? '' : dif > 0 ? 'sobe' : 'desce';
      const seta = Math.abs(dif) < 0.05 ? '' : `<small class="${cls}">${dif > 0 ? '▲' : '▼'}${pct(Math.abs(dif)).replace('%', '')}</small>`;
      return `<div class="proj__row ${i < vagas ? 'proj__row--ganha' : ''}" style="--c:${cor}">
        <span class="proj__nome" title="${esc(nomeProprio(c.nome))}">${esc(nomeCurto(c.nome))}</span>
        <div class="proj__track"><i class="proj__agora" style="width:${x(c.atual)}"></i><i class="proj__proj" style="width:${x(c.projetado)}"></i>
          ${i === 0 && vagas === 1 && escala >= 50 ? `<span class="proj__meta" style="left:${x(50)}"><span>50%</span></span>` : ''}</div>
        <span class="proj__num">agora ${pct(c.atual)} → <b>${pct(c.projetado)}</b> ${seta}</span>
      </div>`;
    })
    .join('');
}

export function veredito(lista, vagas = 1) {
  const [a, b] = lista;
  if (!a) return '';
  if (vagas > 1) return `<div class="proj__v">Elegeriam: ${lista.slice(0, vagas).map((c) => esc(nomeCurto(c.nome))).join(' e ')}</div>`;
  if (a.projetado > 50) return `<div class="proj__v">${esc(nomeCurto(a.nome))} venceria no 1º turno</div><div class="proj__l">com ${pct(a.projetado)} dos votos válidos projetados</div>`;
  return `<div class="proj__v">2º turno provável</div><div class="proj__l">${esc(nomeCurto(a.nome))} × ${esc(nomeCurto(b?.nome || ''))} · ninguém passa de 50%</div>`;
}

const rodape = (r) =>
  `<p class="nota"><span class="tag-estimativa">Estimativa</span> Cada cidade projetada pelo próprio resultado parcial; cidades sem seções apuradas entram com o padrão do estado.
  Dados por cidade cobrem ${pct(r.cobertura)} do eleitorado · faltam ${pct(r.faltam)} do eleitorado · não é resultado oficial.</p>`;

function seletorUF(uf) {
  return `<label class="select el-uf"><select data-proj-uf aria-label="Estado">${UFS.map((u) => `<option value="${u.uf}" ${u.uf === uf ? 'selected' : ''}>${esc(u.nome)}</option>`).join('')}</select>
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></label>`;
}

export function abrirProjecoes({ aba = 'presidente', uf = 'sp', cores = {}, semExterior = false } = {}) {
  const st = { aba, uf: uf === 'zz' ? 'sp' : uf, seq: 0 };
  modal.abrir(`<h3>Projeções do resultado</h3>
    <p class="card__sub">Estimativa calculada cidade a cidade com os votos apurados até agora</p>
    <div class="mtabs" data-proj-abas>${[['presidente', 'Presidente'], ['governador', 'Governador'], ['senado', 'Senado']]
      .map(([k, t]) => `<button data-proj-aba="${k}" class="${k === st.aba ? 'is-active' : ''}">${t}</button>`)
      .join('')}</div>
    <div data-proj-corpo></div>`);
  const body = modal.corpo;
  const corpo = body.querySelector('[data-proj-corpo]');

  async function carregar() {
    const id = ++st.seq;
    const federal = st.aba === 'presidente';
    corpo.innerHTML = `${federal ? '' : `<div class="proj-topo">${seletorUF(st.uf)}</div>`}<p class="empty">Calculando por cidade… na primeira vez pode levar até 20 segundos.</p>`;
    try {
      const r = await fetch(`/api/projecao?cargo=${st.aba}${federal ? '' : `&uf=${st.uf}`}`);
      const j = await r.json();
      if (id !== st.seq || !modal.aberto()) return;
      if (!r.ok) throw new Error(j.erro);
      corpo.innerHTML = federal ? presidente(j) : estadual(j);
    } catch (err) {
      if (id === st.seq && modal.aberto()) corpo.innerHTML = `<p class="empty">${esc(err.message || 'Não foi possível calcular agora.')}</p>`;
    }
  }

  function presidente(j) {
    const r = semExterior ? j.sem : j.com;
    const linhas = UFS.filter((u) => j.porUF[u.uf])
      .map((u) => {
        const p = j.porUF[u.uf];
        const [a, b] = p.candidatos;
        if (!a) return '';
        const liderAgora = [...p.candidatos].sort((x, y) => y.atual - x.atual)[0];
        const vira = liderAgora && liderAgora.n !== a.n;
        return `<tr class="${vira ? 'vira' : ''}"><th>${u.uf.toUpperCase()}</th>
          <td><span class="dot" style="--c:${cores[a.n] || corPartido(a.partido)}"></span>${esc(nomeCurto(a.nome))} <b>${pct(a.projetado)}</b></td>
          <td>${b ? `${esc(nomeCurto(b.nome))} ${pct(b.projetado)}` : '—'}</td>
          <td>${pct(a.projetado - (b?.projetado || 0))}</td>
          <td>${pct(p.secoes)}</td>
          <td>${vira ? '<span class="pill pill--dentro">vira</span>' : ''}</td></tr>`;
      })
      .join('');
    return `<div class="proj proj--modal"><div class="proj__rows">${barrasProjecao(r.candidatos, { cores })}</div>
        <div class="proj__veredito"><span class="tag-estimativa">Estimativa</span>${veredito(r.candidatos)}</div></div>
      ${rodape(r)}
      <h4 class="psec">Projeção por estado</h4>
      <div class="ptabela"><table><thead><tr><th></th><th>Venceria</th><th>2º</th><th>Margem</th><th>Apurado</th><th></th></tr></thead><tbody>${linhas}</tbody></table></div>
      <p class="nota">"vira": no estado, o líder projetado é diferente de quem lidera agora.</p>`;
  }

  function estadual(j) {
    return `<div class="proj-topo">${seletorUF(st.uf)}<span class="nota">${pct(j.secoes)} das seções apuradas em ${esc(UF_BY_CODE[st.uf].nome)}</span></div>
      <div class="proj proj--modal"><div class="proj__rows">${barrasProjecao(j.candidatos, { vagas: j.vagas || 1 })}</div>
        <div class="proj__veredito"><span class="tag-estimativa">Estimativa</span>${veredito(j.candidatos, j.vagas || 1)}</div></div>
      ${rodape(j)}`;
  }

  body.querySelector('[data-proj-abas]').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-proj-aba]');
    if (!b) return;
    st.aba = b.dataset.projAba;
    body.querySelectorAll('[data-proj-aba]').forEach((x) => x.classList.toggle('is-active', x === b));
    carregar();
  });
  corpo.addEventListener('change', (ev) => {
    if (ev.target.matches('[data-proj-uf]')) {
      st.uf = ev.target.value;
      carregar();
    }
  });
  carregar();
}

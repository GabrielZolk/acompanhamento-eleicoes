// Lista completa de candidatos de uma UF, com pesquisa por nome, número ou partido,
// filtro de eleitos e busca em todos os estados (feita no servidor).
import { int, pct, esc, nomeProprio, semAcento, ufLabel } from '../format.js';
import { CARGOS, UF_BY_CODE, nomeDoCargo, tituloDoCargo } from '../ufs.js';
import { corPartido } from '../colors.js';
import { avatar, linhaLista, ICON } from './common.js';
import { pills, somaUFs } from './disputa.js';
import * as modal from './modais.js';

const PAGINA = 100;
const plural = { 'Deputado Federal': 'Deputados federais', 'Deputado Estadual': 'Deputados estaduais', 'Deputado Distrital': 'Deputados distritais', Governador: 'Governador', Senador: 'Senado' };

// Visão Brasil: os mais votados do país que já vêm no painel (deputados: os 10 primeiros;
// Governador e Senado: todos, pois o painel traz a lista completa de cada estado).
function maisVotadosBR(d) {
  const lista = d?.nacional?.maisVotados || Object.entries(d?.estados || {}).flatMap(([u, e]) => (e.candidatos || []).map((c) => ({ ...c, uf: u })));
  return [...lista].sort((a, b) => b.votos - a.votos).map((c, i) => ({ ...c, pos: i + 1 }));
}

export function abrirCandidatos({ cargo: cargoKey, uf, cores = {}, painel = null }) {
  const cargo = CARGOS[cargoKey];
  // uf = "br": abre direto na busca em todos os estados (não há lista completa nacional).
  const brasil = uf === 'br';
  const inicial = brasil ? maisVotadosBR(painel) : null;
  const st = { lista: null, erro: null, termo: '', eleitos: false, todos: brasil, limite: PAGINA, remoto: null, buscando: false, seq: 0 };
  const nomeUF = brasil ? 'Brasil' : UF_BY_CODE[uf]?.nome || uf.toUpperCase();
  const corDe = (sigla) => cores[sigla] || corPartido(sigla);
  const n = painel?.nacional;
  const resumoBR = brasil && n
    ? [`${int(n.totalCandidatos)} candidatos · ${somaUFs(n)}`, n.vagas > 1 ? `${int(n.vagas)} vagas` : null, `${pct(n.secoes?.pct, 2)} das seções apuradas`].filter(Boolean).join(' · ')
    : 'Busca em todos os estados';

  modal.abrir(`<h3>${esc(plural[nomeDoCargo(cargo, uf)] || tituloDoCargo(cargo, uf))} — ${esc(nomeUF)}</h3>
    <p class="card__sub" data-resumo>${brasil ? esc(resumoBR) : 'Carregando candidatos…'}</p>
    <div class="cbusca">
      <label class="cbusca__input">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input type="search" data-busca placeholder="Buscar por nome, número ou partido" autocomplete="off" aria-label="Buscar candidato">
      </label>
      <label class="check" data-so-eleitos hidden><input type="checkbox" data-eleitos><span class="check__box">${CHECK}</span><span data-rot-eleitos>Só eleitos</span></label>
      <label class="check" ${brasil ? 'title="Para ver a lista completa de um estado, escolha o estado no painel"' : ''}><input type="checkbox" data-todos ${brasil ? 'checked disabled' : ''}><span class="check__box">${CHECK}</span>Todos os estados</label>
    </div>
    <div class="cinfo" data-info></div>
    <div class="mlist" data-lista>${'<div class="mrow skeleton" style="height:56px"></div>'.repeat(5)}</div>
    <button class="btn-row btn-mais" data-mais hidden>Mostrar mais</button>`);

  const body = modal.corpo;
  const $ = (sel) => body.querySelector(sel);
  const input = $('[data-busca]');
  setTimeout(() => input.focus(), 50);

  const fotoDe = (c) => c.foto || (st.lista?.fotoBase && c.uf === uf ? st.lista.fotoBase.replace('{sq}', c.sq) : null);

  function linha(c, comUF) {
    const det = [c.partido, c.n, c.situacao && !c.eleito && !/2º turno/i.test(c.situacao) ? c.situacao : null].filter(Boolean).join(' · ');
    return linhaLista({
      pos: `${c.pos}º`,
      avatarHtml: avatar({ nome: c.nome, cor: corDe(c.partido), foto: fotoDe(c) }, 'avatar--sm'),
      nome: nomeProprio(c.nome),
      selo: pills(c),
      uf: comUF ? ufLabel(c.uf) : '',
      det,
      valor: c.pct,
      votos: c.votos,
      cor: corDe(c.partido),
      casas: 2,
    });
  }

  function filtrar(lista) {
    const t = semAcento(st.termo.trim());
    const T = t.toUpperCase();
    return lista.filter((c) => (!st.eleitos || c.eleito || c.projetado) && (!t || semAcento(c.nome).includes(t) || c.n.startsWith(t) || c.partido === T));
  }

  function render() {
    const lista = $('[data-lista]'), info = $('[data-info]'), mais = $('[data-mais]');
    if (st.erro) {
      lista.innerHTML = `<p class="empty">${esc(st.erro)}</p>`;
      info.textContent = '';
      mais.hidden = true;
      return;
    }
    if (st.todos) {
      if (semAcento(st.termo.trim()).length < 3 && inicial?.length) {
        info.textContent = `${painel?.nacional?.maisVotados ? `Os ${inicial.length} mais votados do país` : `${int(inicial.length)} candidatos, em ordem de votação`} · digite 3 letras para buscar`;
        lista.innerHTML = inicial.slice(0, st.limite).map((c) => linha(c, true)).join('');
        mais.hidden = inicial.length <= st.limite;
        mais.innerHTML = `Mostrar mais ${int(Math.min(PAGINA, inicial.length - st.limite))} ${ICON.chevDown}`;
        return;
      }
      if (semAcento(st.termo.trim()).length < 3) {
        lista.innerHTML = `<p class="empty">Digite pelo menos 3 letras do nome, o número ou o partido para buscar em todos os estados.</p>`;
        info.textContent = '';
      } else if (st.buscando && !st.remoto) {
        lista.innerHTML = '<div class="mrow skeleton" style="height:56px"></div>'.repeat(3);
        info.textContent = 'Buscando em todos os estados…';
      } else if (st.remoto) {
        const r = st.remoto;
        info.textContent = r.total ? `${int(r.total)} encontrados em todo o país${r.total > r.candidatos.length ? ` · mostrando os ${r.candidatos.length} mais votados` : ''}` : '';
        lista.innerHTML = r.candidatos.map((c) => linha(c, true)).join('') || '<p class="empty">Nenhum candidato encontrado.</p>';
      }
      mais.hidden = true;
      return;
    }
    if (!st.lista) return;
    const achados = filtrar(st.lista.candidatos);
    info.textContent = st.termo || st.eleitos
      ? `${int(achados.length)} de ${int(st.lista.total)} candidatos`
      : `${int(st.lista.total)} candidatos, em ordem de votação`;
    lista.innerHTML = achados.slice(0, st.limite).map((c) => linha(c, false)).join('') || '<p class="empty">Nenhum candidato encontrado.</p>';
    mais.hidden = achados.length <= st.limite;
    mais.innerHTML = `Mostrar mais ${int(Math.min(PAGINA, achados.length - st.limite))} ${ICON.chevDown}`;
  }

  let timer = null;
  function buscarRemoto() {
    clearTimeout(timer);
    const termo = st.termo.trim();
    if (!st.todos || semAcento(termo).length < 3) {
      st.remoto = null;
      render();
      return;
    }
    st.buscando = true;
    st.remoto = null;
    render();
    timer = setTimeout(async () => {
      const id = ++st.seq;
      try {
        const r = await fetch(`/api/candidatos?cargo=${cargoKey}&uf=br&q=${encodeURIComponent(termo)}`);
        const j = await r.json();
        if (id !== st.seq) return;
        st.remoto = r.ok ? j : { total: 0, candidatos: [] };
      } catch {
        if (id === st.seq) st.remoto = { total: 0, candidatos: [] };
      }
      st.buscando = false;
      if (modal.aberto()) render();
    }, 350);
  }

  input.addEventListener('input', () => {
    st.termo = input.value;
    st.limite = PAGINA;
    if (st.todos) buscarRemoto();
    else render();
  });
  $('[data-eleitos]').addEventListener('change', (ev) => {
    st.eleitos = ev.target.checked;
    st.limite = PAGINA;
    render();
  });
  $('[data-todos]').addEventListener('change', (ev) => {
    st.todos = ev.target.checked;
    $('[data-so-eleitos]').hidden = st.todos || !st.lista?.candidatos.some((c) => c.eleito || c.projetado);
    if (st.todos) buscarRemoto();
    else render();
  });
  $('[data-mais]').addEventListener('click', () => {
    st.limite += PAGINA;
    render();
  });

  if (brasil) return render();
  fetch(`/api/candidatos?cargo=${cargoKey}&uf=${uf}`)
    .then(async (r) => {
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || 'Não foi possível carregar os candidatos.');
      return j;
    })
    .then((j) => {
      st.lista = j;
      if (!modal.aberto()) return;
      const nEleitos = j.candidatos.filter((c) => c.eleito).length;
      $('[data-resumo]').textContent = [
        `${int(j.total)} candidatos`,
        j.vagas > 1 ? `${int(j.vagas)} vagas` : null,
        `${pct(j.secoes?.pct, 2)} das seções apuradas`,
        nEleitos ? `${nEleitos} eleitos` : null,
      ].filter(Boolean).join(' · ');
      const nDentro = j.candidatos.filter((c) => c.projetado).length;
      if (!nEleitos && nDentro) $('[data-rot-eleitos]').textContent = `Dentro das vagas (${nDentro})`;
      $('[data-so-eleitos]').hidden = !nEleitos && !nDentro;
      render();
    })
    .catch((err) => {
      st.erro = err.message;
      if (modal.aberto()) render();
    });
}

const CHECK = `<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.2 4.1 7.3 8 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

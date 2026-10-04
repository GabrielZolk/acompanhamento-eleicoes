import { esc, hora, dataExtenso, semAcento, nomeProprio, pct } from '../format.js';
import { UFS } from '../ufs.js';

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

export function createHeader({ onCargo, onUF, onMunicipio }) {
  const tabs = document.querySelectorAll('.tabs__item[data-cargo]');
  const btnMenu = document.getElementById('consultas-btn');
  const menu = document.getElementById('consultas-menu');
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  const live = document.getElementById('live-status');
  document.getElementById('search-kbd').textContent = isMac ? '⌘ K' : 'Ctrl K';

  let municipios = null;
  let carregandoMun = null;
  let itens = [];
  let ativo = 0;

  tabs.forEach((t) => t.addEventListener('click', () => onCargo(t.dataset.cargo)));

  // ------------------------------------------------------------ Consultas
  function renderMenu() {
    menu.innerHTML = `
      <button class="dropdown__item" data-act="municipio">Resultado por município<small>Busque qualquer cidade do país ou do exterior</small></button>
      <div class="dropdown__sep"></div>
      <a class="dropdown__item" href="https://resultados.tse.jus.br/oficial/app/index.html" target="_blank" rel="noopener">Resultados no site do TSE ↗</a>
      <a class="dropdown__item" href="https://divulgacandcontas.tse.jus.br/" target="_blank" rel="noopener">Candidaturas (DivulgaCandContas) ↗</a>`;
  }
  function toggleMenu(abrir) {
    const open = abrir ?? menu.hidden;
    if (open) renderMenu();
    menu.hidden = !open;
    btnMenu.setAttribute('aria-expanded', String(open));
  }
  btnMenu.addEventListener('click', (ev) => {
    ev.stopPropagation();
    toggleMenu();
  });
  menu.addEventListener('click', (ev) => {
    if (ev.target.closest('[data-act="municipio"]')) {
      toggleMenu(false);
      input.focus();
    }
  });
  document.addEventListener('click', (ev) => {
    if (!menu.hidden && !ev.target.closest('.tabs__menu')) toggleMenu(false);
    if (!results.hidden && !ev.target.closest('.search')) results.hidden = true;
  });

  // ------------------------------------------------------------ Busca
  async function carregarMunicipios() {
    if (municipios) return municipios;
    carregandoMun ||= fetch('/api/municipios')
      .then((r) => r.json())
      .then((lista) => (municipios = lista.map((m) => ({ ...m, chave: semAcento(m.nome) }))))
      .catch(() => (carregandoMun = null));
    return carregandoMun;
  }

  function buscar(q) {
    const t = semAcento(q.trim());
    if (!t) return [];
const estados = UFS.filter((u) => semAcento(u.nome).includes(t) || u.uf === t).map((u) => ({ tipo: 'uf', uf: u.uf, nome: u.nome }));
    if ('exterior'.startsWith(t) && t.length >= 3) estados.unshift({ tipo: 'uf', uf: 'zz', nome: 'Exterior' });
    if (t.length < 2 || !municipios) return estados.slice(0, 8);
    const comeca = [], contem = [];
    for (const m of municipios) {
      if (m.chave.startsWith(t)) comeca.push(m);
      else if (t.length >= 3 && m.chave.includes(t)) contem.push(m);
      if (comeca.length > 40) break;
    }
    const ordena = (a, b) => (b.capital - a.capital) || a.chave.localeCompare(b.chave);
    const mun = [...comeca.sort(ordena), ...contem.sort(ordena)].slice(0, 10 - Math.min(estados.length, 4));
    return [...estados.slice(0, 4), ...mun.map((m) => ({ tipo: 'mun', ...m }))];
  }

  function renderResultados() {
    if (!input.value.trim()) {
      results.hidden = true;
      return;
    }
    results.hidden = false;
    if (!itens.length) {
      results.innerHTML = `<div class="search__empty">${municipios ? 'Nenhum estado ou município encontrado.' : 'Carregando municípios…'}</div>`;
      return;
    }
    results.innerHTML = itens
      .map((it, i) => `<button class="search__item ${i === ativo ? 'is-active' : ''}" data-i="${i}" role="option">
        <span>${esc(it.tipo === 'uf' ? it.nome : nomeProprio(it.nome))}</span>
        <small>${it.tipo === 'uf' ? (it.uf === 'zz' ? 'Votos para Presidente' : 'Estado') : it.uf === 'zz' ? 'Exterior' : it.uf.toUpperCase()}</small></button>`)
      .join('');
  }

  function escolher(it) {
    if (!it) return;
    results.hidden = true;
    input.value = '';
    input.blur();
    if (it.tipo === 'uf') onUF(it.uf);
    else onMunicipio(it);
  }

  input.addEventListener('focus', carregarMunicipios);
  input.addEventListener('input', async () => {
    ativo = 0;
    itens = buscar(input.value);
    renderResultados();
    if (!municipios && input.value.trim().length >= 2) {
      await carregarMunicipios();
      itens = buscar(input.value);
      renderResultados();
    }
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (!itens.length) return;
      ativo = (ativo + (ev.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length;
      renderResultados();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      escolher(itens[ativo]);
    } else if (ev.key === 'Escape') {
      input.value = '';
      results.hidden = true;
      input.blur();
    }
  });
  results.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-i]');
    if (b) escolher(itens[Number(b.dataset.i)]);
  });
  document.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      input.focus();
      input.select();
    }
  });

  // ------------------------------------------------------------ Status
  function renderStatus(d, state) {
    const aba = state.cargo === 'assembleia' ? 'camara' : state.cargo;
    tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.cargo === aba));
    let cls, titulo, sub;
    const turno = `${d?.turno || 1}º turno`;
    const dia = dataExtenso(d?.inicio || Date.now());
    if (state.erro && !d) {
      cls = 'live--err'; titulo = 'Sem conexão'; sub = 'Tentando reconectar…';
    } else if (!d) {
      cls = 'live--wait'; titulo = 'Conectando…'; sub = 'Buscando dados do TSE';
    } else if (state.erro || d.servidor?.erro) {
      cls = 'live--err'; titulo = 'Instabilidade na conexão'; sub = `Último dado: ${hora(d.atualizadoEm)}`;
    } else if (d.status === 'finalizado') {
      cls = 'live--end'; titulo = 'Apuração finalizada'; sub = `${dia} · ${turno} · ${pct(d.nacional.secoes.pct)} das seções`;
    } else if (d.status === 'apurando') {
      cls = 'live--on'; titulo = 'Atualização ao vivo'; sub = `${dia} · ${turno} · ${hora(d.atualizadoEm)}`;
    } else {
      const passou = Date.now() >= (d.inicio || 0);
      cls = 'live--wait';
      titulo = passou ? 'Aguardando o TSE' : 'Aguardando apuração';
      sub = passou ? `${dia} · ${turno} · nenhuma seção divulgada ainda` : `${dia} · ${turno} · início às 17h`;
    }
    live.className = `live ${cls}`;
    live.innerHTML = `<span class="live__dot"></span><div><div class="live__title">${esc(titulo)}</div><div class="live__sub">${esc(sub)}</div></div>`;
  }

  return { renderStatus };
}

import { esc, hora, dataExtenso, semAcento, nomeProprio, pct, int } from '../format.js';
import { UFS } from '../ufs.js';

// "atualizado há 12 s" / "há 3 min" a partir do horário em que o TSE gerou os dados.
function tempoDesde(t) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `atualizado há ${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `atualizado há ${m} min` : `atualizado às ${hora(t)}`;
}

// Horário dos números exibidos: a geração do arquivo de resultado do TSE (payloads antigos só
// trazem atualizadoEm, que mistura resultado e andamento).
const horaResultado = (d) => d?.resultadoEm || d?.atualizadoEm || null;

// O TSE às vezes segue publicando o andamento (-ab.json) mas para de republicar o resultado.
// Resultado parado há mais de 10 min com o andamento mais novo (folga de 1 min): avisa desde quando.
const PARADO_MS = 10 * 60e3;
function resultadoParado(d) {
  const r = horaResultado(d);
  return !!(r && d.andamentoEm && d.andamentoEm - r > 60e3 && Date.now() - r > PARADO_MS);
}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

export function createHeader({ onCargo, onUF, onMunicipio, onPartido, listaPartidos, onTV, onProjecoes, onSegundoTurno }) {
  const tabs = document.querySelectorAll('.tabs__item[data-cargo]');
  const btnMenu = document.getElementById('consultas-btn');
  const menu = document.getElementById('consultas-menu');
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  const live = document.getElementById('live-status');
  document.getElementById('search-kbd').textContent = isMac ? '⌘ K' : 'Ctrl K';

  let municipios = null;
  let partidos = [];
  let carregandoMun = null;
  let itens = [];
  let ativo = 0;

  tabs.forEach((t) => t.addEventListener('click', () => onCargo(t.dataset.cargo)));

  // ------------------------------------------------------------ Consultas
  function renderMenu() {
    menu.innerHTML = `
      <button class="dropdown__item" data-act="segundo-turno">2º turno<small>Data, contagem regressiva, Presidente e governadores</small></button>
      <button class="dropdown__item" data-act="projecoes">Projeções por cidade<small>Presidente, governador e Senado (estimativa)</small></button>
      <button class="dropdown__item" data-act="eleitos">Eleitos<small>Quem já foi eleito em cada lugar, por cargo</small></button>
      <button class="dropdown__item" data-act="tv">Modo TV<small>Tela cheia, alterna sozinho entre cargos e estados</small></button>
      <button class="dropdown__item" data-act="partido">Desempenho por partido<small>Presidente, governador, Senado e deputados de cada partido</small></button>
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
    if (ev.target.closest('[data-act="segundo-turno"]')) {
      toggleMenu(false);
      onSegundoTurno();
      return;
    }
    if (ev.target.closest('[data-act="projecoes"]')) {
      toggleMenu(false);
      onProjecoes();
      return;
    }
    if (ev.target.closest('[data-act="eleitos"]')) {
      toggleMenu(false);
      document.querySelector('.fab-eleitos')?.click();
      return;
    }
    if (ev.target.closest('[data-act="tv"]')) {
      toggleMenu(false);
      onTV();
      return;
    }
    if (ev.target.closest('[data-act="partido"]')) {
      toggleMenu(false);
      onPartido();
      return;
    }
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
    if (!partidos.length) {
      listaPartidos().then((l) => {
        partidos = l;
        if (input.value.trim()) {
          itens = buscar(input.value);
          renderResultados();
        }
      });
    }
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
    const T = t.toUpperCase();
    const parts = partidos
      .filter((p) => semAcento(p.sigla).toUpperCase() === T || (t.length >= 3 && (semAcento(p.sigla).includes(t) || semAcento(p.nome).includes(t))) || p.n === t)
      .slice(0, 3)
      .map((p) => ({ tipo: 'partido', sigla: p.sigla, nome: p.nome }));
    estados.unshift(...parts);
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
        <span>${esc(it.tipo === 'uf' ? it.nome : it.tipo === 'partido' ? `${it.sigla} — ${nomeProprio(it.nome)}` : nomeProprio(it.nome))}</span>
        <small>${it.tipo === 'partido' ? 'Partido · todos os cargos' : it.tipo === 'uf' ? (it.uf === 'zz' ? 'Votos para Presidente' : 'Estado') : it.uf === 'zz' ? 'Exterior' : it.uf.toUpperCase()}</small></button>`)
      .join('');
  }

  function escolher(it) {
    if (!it) return;
    results.hidden = true;
    input.value = '';
    input.blur();
    if (it.tipo === 'uf') onUF(it.uf);
    else if (it.tipo === 'partido') onPartido(it.sigla);
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
  let ultimo = null; // último status desenhado (o relógio percebe quando o resultado passa a contar como parado)
  function renderStatus(d, state) {
    const aba = state.cargo === 'assembleia' ? 'camara' : state.cargo;
    tabs.forEach((t) => t.classList.toggle('is-active', t.dataset.cargo === aba));
    let cls, titulo, sub, dica = '';
    const turno = `${d?.turno || 1}º turno`;
    const dia = dataExtenso(d?.inicio || Date.now());
    const resultado = horaResultado(d);
    const parado = d?.status === 'apurando' && resultadoParado(d);
    ultimo = { d, state, parado };
    if (state.erro && !d) {
      cls = 'live--err'; titulo = 'Sem conexão'; sub = 'Tentando reconectar…';
    } else if (!d) {
      cls = 'live--wait'; titulo = 'Conectando…'; sub = 'Buscando dados do TSE';
    } else if (state.erro || d.servidor?.erro) {
      cls = 'live--err'; titulo = 'Instabilidade na conexão'; sub = `Último dado: ${hora(resultado)}`;
    } else if (d.status === 'finalizado') {
      cls = 'live--end'; titulo = 'Apuração finalizada'; sub = `${dia} · ${turno} · ${pct(d.nacional.secoes.pct)} das seções`;
    } else if (parado) {
      // Não é falha do site: o TSE segue andando, só não republicou o resultado. Texto curto para
      // caber na largura de sempre do bloco (a barra superior não muda de tamanho).
      cls = 'live--wait live--parado'; titulo = 'Aguardando o TSE'; sub = `Último resultado às ${hora(resultado)}`;
      dica = `O TSE segue publicando o andamento da apuração (último às ${hora(d.andamentoEm)}), mas não republica o resultado desde ${hora(resultado)}. Os números voltam a mudar quando ele publicar.`;
    } else if (d.status === 'apurando') {
      cls = 'live--on'; titulo = 'Atualização ao vivo'; sub = `${turno} · `;
    } else {
      const passou = Date.now() >= (d.inicio || 0);
      cls = 'live--wait';
      titulo = passou ? 'Aguardando o TSE' : 'Aguardando apuração';
      sub = passou ? `${dia} · ${turno} · nenhuma seção divulgada ainda` : `${dia} · ${turno} · início às 17h`;
    }
    live.className = `live ${cls}`;
    const online = state.presenca > 0
      ? `<div class="live__online" title="Pessoas com o painel aberto e visível agora"><svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="4" fill="currentColor"/><path d="M1.5 21c.6-4.2 3.6-6.5 7.5-6.5s6.9 2.3 7.5 6.5z" fill="currentColor"/><circle cx="17.5" cy="9" r="3" fill="currentColor" opacity=".6"/><path d="M17 14.6c3 .3 5 2.3 5.5 5.4h-4.3c-.3-2.1-1.2-3.9-2.6-5.1z" fill="currentColor" opacity=".6"/></svg>${int(state.presenca)} ${state.presenca === 1 ? 'pessoa acompanhando' : 'pessoas acompanhando'}</div>`
      : '';
    const desde = cls === 'live--on' && resultado
      ? `<span data-desde="${resultado}" title="Resultado gerado pelo TSE às ${hora(resultado)}">${tempoDesde(resultado)}</span>`
      : '';
    live.innerHTML = `<span class="live__dot"></span><div><div class="live__title">${esc(titulo)}</div><div class="live__sub"${dica ? ` title="${esc(dica)}"` : ''}>${esc(sub)}${desde}</div>${online}</div>`;
  }

  // Relógio do "atualizado há": só troca o texto, sem redesenhar o cabeçalho. Redesenha só quando
  // o resultado passa a contar como parado (ou deixa de contar) sem que chegue dado novo.
  setInterval(() => {
    for (const el of document.querySelectorAll('[data-desde]')) el.textContent = tempoDesde(Number(el.dataset.desde));
    if (ultimo?.d && (ultimo.d.status === 'apurando' && resultadoParado(ultimo.d)) !== ultimo.parado) renderStatus(ultimo.d, ultimo.state);
  }, 1000);

  return { renderStatus };
}

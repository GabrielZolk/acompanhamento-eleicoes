// 1º × 2º turno lado a lado (Presidente, no 2º turno): dois mapas, por estado ou por cidade, com quem
// liderava entre os dois finalistas no 1º turno (resultado final, data/2026/presidente-1t.json) e quem
// lidera agora. Cor = líder; quanto mais forte, maior a vantagem. Contorno amarelo: virou.
// Clicar num estado abre as cidades dele nos dois mapas.
import { esc, pct, mix, nomeProprio } from '../format.js';
import { UF_BY_CODE } from '../ufs.js';

const SEM = '#2c313c';
const CHEIO = { uf: 20, mun: 40 }; // vantagem (p.p. entre os dois) com cor cheia
const CORES = { 13: '#e5484d', 22: '#3b82f6' };
const FRESCO = 90_000;
const int = (v) => Math.round(v).toLocaleString('pt-BR');

export function createTurnos(el) {
  let t1 = null, pedindoT1 = false, geo = null, d = null, assinatura = '';
  const st = { uf: null, nivel: 'uf', abertos: {} };
  const munGeo = {}, pedindoGeo = {};
  const mun2 = {}; // uf -> { em, dados, carregando }

  el.addEventListener('click', (ev) => {
    const todas = ev.target.closest('[data-t-todas]');
    if (todas) { st.abertos[todas.dataset.tTodas] = !st.abertos[todas.dataset.tTodas]; pintar(true); return; }
    const b = ev.target.closest('[data-t-nivel],[data-t-uf],[data-t-brasil]');
    const p = ev.target.closest('path[data-uf]');
    if (b?.dataset.tNivel) st.nivel = b.dataset.tNivel;
    else if (b?.dataset.tBrasil != null) st.uf = null;
    else if (b?.dataset.tUf) { st.uf = b.dataset.tUf; pintar(true); el.querySelector('.turnos__mapas')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    else if (p && !st.uf) st.uf = p.dataset.uf;
    else return;
    pintar(true);
  });
  el.addEventListener('change', (ev) => {
    if (ev.target.matches('[data-t-sel]')) { st.uf = ev.target.value || null; pintar(true); }
  });
  el.addEventListener('pointermove', (ev) => {
    const tip = el.querySelector('.turnos__tip');
    const p = ev.target.closest('path[data-uf]');
    if (!tip) return;
    if (!p) { tip.hidden = true; return; }
    tip.innerHTML = dica(p.dataset.uf, p.dataset.mun);
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const x = ev.clientX - r.left, y = ev.clientY - r.top;
    tip.style.left = `${Math.min(x + 14, r.width - 250)}px`;
    tip.style.top = `${y + 16}px`;
  });
  el.addEventListener('pointerleave', () => { const tip = el.querySelector('.turnos__tip'); if (tip) tip.hidden = true; });

  // ------------------------------------------------------------ dados
  function carregarT1() {
    if (t1 || pedindoT1) return;
    pedindoT1 = true;
    fetch('data/2026/presidente-1t.json').then((r) => r.json()).then((j) => { t1 = j; pintar(true); }).catch(() => { pedindoT1 = false; });
  }
  function garantirGeo(uf) {
    if (munGeo[uf] || pedindoGeo[uf]) return;
    pedindoGeo[uf] = fetch(`data/municipios/${uf}.json`).then((r) => r.json()).then((j) => { munGeo[uf] = j; pintar(true); }).catch(() => { delete pedindoGeo[uf]; });
  }
  function garantirMun2(uf) {
    const m = (mun2[uf] ||= {});
    if (m.carregando || (m.dados && Date.now() - m.em < FRESCO) || Date.now() - (m.tentou || 0) < 10_000) return;
    m.carregando = true;
    m.tentou = Date.now();
    fetch(`/api/municipios-mapa?cargo=presidente&uf=${uf}`).then((r) => r.json()).then((j) => {
      m.dados = j.municipios; m.em = j.parcial ? 0 : Date.now();
    }).catch(() => {}).finally(() => { m.carregando = false; pintar(true); });
  }

  // { 13: %, 22: % } entre os dois, ou null.
  const fatias = (a, b) => { const s = (a || 0) + (b || 0); return s > 0 ? { 13: (a / s) * 100, 22: (b / s) * 100 } : null; };
  const lider = (f) => (f ? (f[13] >= f[22] ? '13' : '22') : null);
  const nac = () => Object.fromEntries((d.nacional?.candidatos || []).map((c) => [c.n, c]));
  const cores = () => { const n = nac(); return { 13: n[13]?.cor || CORES[13], 22: n[22]?.cor || CORES[22] }; };
  const nome = (n) => nomeProprio(nac()[n]?.nome || t1?.candidatos?.[n] || n);
  const cor = (f, escala) => {
    if (!f) return SEM;
    const forca = Math.min(1, Math.abs(f[13] - f[22]) / CHEIO[escala]);
    return mix(cores()[lider(f)], SEM, 0.62 - 0.62 * forca);
  };

  // Votos de cada um (13 e 22) e dos válidos, nos dois turnos.
  function ufT1(uf) { const x = uf ? t1.uf[uf] : t1.br; return x ? { v: x.v, 13: x.c[13], 22: x.c[22] } : null; }
  function ufT2(uf) {
    const e = uf ? d.estados?.[uf] : d.nacional;
    if (!(e?.secoes?.apuradas > 0)) return null;
    const v = Object.fromEntries((e.candidatos || []).map((c) => [c.n, c.votos]));
    return { v: e.votos?.validos || (v[13] || 0) + (v[22] || 0), 13: v[13] || 0, 22: v[22] || 0, apurado: e.secoes.pct };
  }
  function munT1(uf, cdi) { const x = t1.mun[uf]?.[cdi]; return x ? { v: x[0], 13: x[1], 22: x[2] } : null; }
  function munT2(uf, cdi) {
    const r = mun2[uf]?.dados?.[cdi];
    if (!(r?.a > 0) || !(r.v > 0)) return null;
    const p = Object.fromEntries(r.c.map(([n, x]) => [n, x]));
    return { v: r.v, 13: ((p[13] || 0) * r.v) / 100, 22: ((p[22] || 0) * r.v) / 100, apurado: r.a };
  }
  const f = (x) => (x ? fatias(x[13], x[22]) : null);

  function dica(uf, cdi) {
    const a = cdi ? munT1(uf, cdi) : ufT1(uf), b = cdi ? munT2(uf, cdi) : ufT2(uf);
    const nm = cdi ? nomeProprio(mun2[uf]?.dados?.[cdi]?.nm || 'Cidade') + ` (${uf.toUpperCase()})` : UF_BY_CODE[uf]?.nome || uf;
    const linha = (x, rot) => (x ? `<div><span>${rot}</span> ${['13', '22'].map((n) => `<b style="color:${cores()[n]}">${esc(nome(n))} ${pct((x[n] / x.v) * 100, 1)}</b>`).join(' · ')}</div>` : `<div><span>${rot}</span> sem votos ainda</div>`);
    const virou = a && b && lider(f(a)) !== lider(f(b)) ? `<div class="turnos__tipvirou">🔄 ${esc(nome(lider(f(b))))} virou</div>` : '';
    return `<strong>${esc(nm)}</strong>${virou}${linha(a, '1º turno')}${linha(b, '2º turno')}${b?.apurado != null ? `<small>${pct(b.apurado, 1)} das urnas apuradas</small>` : ''}`;
  }

  // ------------------------------------------------------------ desenho
  function manchete(x, turno, x1) {
    const c = cores();
    if (!x) return `<div class="turnos__manchete" style="--c:#5f687b">Aguardando os primeiros votos</div>`;
    const l = lider(f(x)), o = l === '13' ? '22' : '13';
    const p = (n) => pct((x[n] / x.v) * 100, 2);
    let txt;
    if (turno === 1) txt = `${nome(l)} venceu`;
    else if (x1 && lider(f(x1)) !== l) txt = `🔄 ${nome(l)} virou`;
    else txt = `${nome(l)} segue na frente`;
    return `<div class="turnos__manchete${turno === 2 && x1 && lider(f(x1)) !== l ? ' is-virou' : ''}" style="--c:${c[l]}">
        <b>${esc(txt)}</b><span>${p(l)} × ${p(o)} <small>dif. ${int(Math.abs(x[l] - x[o]))} votos</small></span></div>`;
  }

  function svgMapa(turno, viraram) {
    const ufs = Object.keys(geo.states);
    const alvo = st.uf ? [st.uf] : ufs;
    const bb = st.uf ? geo.states[st.uf].bbox : [0, 0, geo.w, geo.h];
    const pad = st.uf ? Math.max(bb[2] - bb[0], bb[3] - bb[1]) * 0.04 : 0;
    const vb = `${bb[0] - pad} ${bb[1] - pad} ${bb[2] - bb[0] + 2 * pad} ${bb[3] - bb[1] + 2 * pad}`;
    const porCidade = st.uf || st.nivel === 'mun';
    let corpo = '', contornos = '', rotulos = '';
    if (porCidade) {
      for (const uf of alvo) {
        const g = munGeo[uf];
        if (!g) { corpo += `<path d="${geo.states[uf].d}" fill="${SEM}" data-uf="${uf}"/>`; continue; }
        for (const [cdi, dd] of Object.entries(g)) {
          const x = turno === 1 ? munT1(uf, cdi) : munT2(uf, cdi);
          corpo += `<path d="${dd}" fill="${cor(f(x), 'mun')}" data-uf="${uf}" data-mun="${cdi}"/>`;
          if (turno === 2 && viraram.mun.has(`${uf}:${cdi}`)) contornos += `<path d="${dd}" class="turnos__contorno turnos__contorno--mun"/>`;
        }
      }
      if (!st.uf) corpo += `<g class="turnos__bordas">${ufs.map((uf) => `<path d="${geo.states[uf].d}"/>`).join('')}</g>`;
      else corpo += `<g class="turnos__bordas"><path d="${geo.states[st.uf].d}"/></g>`;
    } else {
      for (const uf of ufs) {
        const x = turno === 1 ? ufT1(uf) : ufT2(uf);
        corpo += `<path d="${geo.states[uf].d}" fill="${cor(f(x), 'uf')}" data-uf="${uf}" class="turnos__uf"/>`;
      }
    }
    if (turno === 2 && !st.uf) {
      for (const uf of viraram.uf) {
        contornos += `<path d="${geo.states[uf].d}" class="turnos__contorno"/>`;
        const [cx, cy] = geo.states[uf].c;
        const t = `${nome(lider(f(ufT2(uf))))} virou`;
        const w = t.length * 9.2 + 18;
        rotulos += `<g class="turnos__rotulo" transform="translate(${cx},${cy})" style="--c:${cores()[lider(f(ufT2(uf)))]}"><rect x="${-w / 2}" y="-15" width="${w}" height="26" rx="13"/><text y="4">${esc(t)}</text></g>`;
      }
    }
    return `<svg class="turnos__svg${porCidade ? ' is-mun' : ''}" viewBox="${vb}" preserveAspectRatio="xMidYMid meet">${corpo}${contornos}${rotulos}</svg>`;
  }

  // Placar "Lula virou × Flávio virou": estados e cidades (Brasil todo), maiores cidades primeiro.
  function placarViradas(ufs) {
    const c = cores();
    const lados = { 13: { ufs: [], cid: [] }, 22: { ufs: [], cid: [] } };
    for (const uf of ufs) {
      const a = f(ufT1(uf)), b = f(ufT2(uf));
      if (a && b && lider(a) !== lider(b)) lados[lider(b)].ufs.push(uf);
      for (const cdi of Object.keys(t1.mun[uf] || {})) {
        const a2 = f(munT1(uf, cdi)), b2 = f(munT2(uf, cdi));
        if (!a2 || !b2 || lider(a2) === lider(b2)) continue;
        const n = lider(b2), r = mun2[uf].dados[cdi];
        lados[n].cid.push({ uf, cdi, nm: nomeProprio(r.nm || ''), eleit: r.t || r.v || 0, ganho: b2[n] - a2[n] });
      }
    }
    const carregadas = ufs.filter((u) => mun2[u]?.dados).length;
    const total = lados[13].cid.length + lados[22].cid.length;
    const mil = (v) => v.toLocaleString('pt-BR');
    const coluna = (n) => {
      const L = lados[n];
      L.cid.sort((x, y) => y.eleit - x.eleit);
      const aberto = st.abertos[n];
      const lista = aberto ? L.cid : L.cid.slice(0, 8);
      const parte = total ? (L.cid.length / total) * 100 : 0;
      return `<div class="vir__col" style="--c:${c[n]}">
          <div class="vir__topo"><span class="vir__quem">${esc(nome(n))} virou</span>
            <span class="vir__num"><b>${L.ufs.length}</b> ${L.ufs.length === 1 ? 'estado' : 'estados'} · <b>${mil(L.cid.length)}</b> ${L.cid.length === 1 ? 'cidade' : 'cidades'}</span></div>
          <div class="vir__barra"><i style="width:${parte.toFixed(1)}%"></i><small>${total ? `${Math.round(parte)}% das cidades que viraram` : ''}</small></div>
          <div class="vir__rot">Estados</div>
          <div class="vir__ufs">${L.ufs.length ? L.ufs.map((uf) => `<button class="vir__uf" data-t-uf="${uf}" title="${esc(UF_BY_CODE[uf].nome)}">${uf.toUpperCase()}</button>`).join('') : '<span class="vir__nada">nenhum até agora</span>'}</div>
          <div class="vir__rot">Maiores cidades</div>
          <ol class="vir__cid${aberto ? ' is-aberto' : ''}">${lista.length ? lista.map((x) => `<li><button data-t-uf="${x.uf}"><span>${esc(x.nm)} <small>${x.uf.toUpperCase()}</small></span><em>+${x.ganho.toFixed(1).replace('.', ',')} pts</em></button></li>`).join('') : '<li class="vir__nada">nenhuma até agora</li>'}</ol>
          ${L.cid.length > 8 ? `<button class="vir__todas" data-t-todas="${n}">${aberto ? 'mostrar menos' : `ver todas as ${mil(L.cid.length)}`}</button>` : ''}
        </div>`;
    };
    return `<div class="vir">
        <div class="vir__contador"><span class="vir__vivo">🔄 Viradas ao vivo</span>
          <span style="--c:${c[13]}">${esc(nome('13'))} virou <b>${mil(lados[13].cid.length)}</b></span><i>·</i>
          <span style="--c:${c[22]}">${esc(nome('22'))} virou <b>${mil(lados[22].cid.length)}</b></span>
          <small>cidades onde o líder mudou desde o 1º turno${carregadas < ufs.length ? ` · carregando ${carregadas}/${ufs.length} estados…` : ''}</small></div>
        <div class="vir__cols">${coluna('13')}${coluna('22')}</div>
      </div>`;
  }

  function pintar(forcar) {
    if (!d || !geo || !t1) return;
    const alvo = st.uf ? [st.uf] : st.nivel === 'mun' ? Object.keys(geo.states) : [];
    for (const uf of alvo) garantirGeo(uf);
    // A lista de viradas cobre o Brasil todo: pede as cidades de todos os estados.
    for (const uf of Object.keys(geo.states)) garantirMun2(uf);
    const sig = [d.atualizadoEm, st.uf, st.nivel, JSON.stringify(st.abertos), Object.keys(munGeo).length, ...Object.keys(geo.states).map((u) => mun2[u]?.em || 0)].join('|');
    if (!forcar && sig === assinatura) return;
    assinatura = sig;
    el.hidden = false;

    const ufs = Object.keys(geo.states);
    const viraram = { uf: [], mun: new Set() };
    for (const uf of ufs) { const a = f(ufT1(uf)), b = f(ufT2(uf)); if (a && b && lider(a) !== lider(b)) viraram.uf.push(uf); }
    const contaMun = { 13: 0, 22: 0 };
    for (const uf of alvo) for (const cdi of Object.keys(t1.mun[uf] || {})) {
      const a = f(munT1(uf, cdi)), b = f(munT2(uf, cdi));
      if (a && b && lider(a) !== lider(b)) { viraram.mun.add(`${uf}:${cdi}`); contaMun[lider(b)]++; }
    }
    const c = cores();
    const x1 = ufT1(st.uf), x2 = ufT2(st.uf);
    const lugar = st.uf ? UF_BY_CODE[st.uf].nome : 'Brasil';
    const resumoViradas = (st.uf || st.nivel === 'mun')
      ? `<b>${viraram.mun.size} ${viraram.mun.size === 1 ? 'cidade virou' : 'cidades viraram'}</b> ${['13', '22'].map((n) => `<span class="turnos__chip" style="--c:${c[n]}">${contaMun[n]} para ${esc(nome(n))}</span>`).join('')}`
      : viraram.uf.length
        ? `<b>${viraram.uf.length} ${viraram.uf.length === 1 ? 'estado virou' : 'estados viraram'}</b> ${viraram.uf.map((uf) => `<button class="turnos__chip" data-t-uf="${uf}" style="--c:${c[lider(f(ufT2(uf)))]}"><b>${uf.toUpperCase()}</b> ${esc(nome(lider(f(ufT1(uf)))))} → ${esc(nome(lider(f(ufT2(uf)))))}</button>`).join('')}`
        : '<b>Nenhum estado virou até agora</b>';
    const opcoesUF = ufs.slice().sort((a, b) => UF_BY_CODE[a].nome.localeCompare(UF_BY_CODE[b].nome)).map((uf) => `<option value="${uf}"${st.uf === uf ? ' selected' : ''}>${esc(UF_BY_CODE[uf].nome)}</option>`).join('');
    const carregando = alvo.some((u) => !munGeo[u] || !mun2[u]?.dados) ? '<span class="turnos__carr">carregando cidades…</span>' : '';

    el.innerHTML = `<div class="card__head turnos__head"><div>
        <h2 class="card__title">1º turno × 2º turno · ${esc(lugar)}</h2>
        <p class="card__sub">Quem venceu no 1º turno e quem lidera agora, entre ${esc(nome('13'))} e ${esc(nome('22'))}. Cor mais forte = vantagem maior. ${st.uf ? '' : 'Clique num estado para ver as cidades.'}</p>
      </div>
      <div class="turnos__ctrl">
        ${st.uf ? '<button class="turnos__voltar" data-t-brasil>← Brasil</button>' : `<div class="seg"><button data-t-nivel="uf" class="${st.nivel === 'uf' ? 'is-on' : ''}">Estados</button><button data-t-nivel="mun" class="${st.nivel === 'mun' ? 'is-on' : ''}">Cidades</button></div>`}
        <label class="select"><select data-t-sel aria-label="Escolher estado"><option value="">Brasil inteiro</option>${opcoesUF}</select></label>
      </div></div>
      ${placarViradas(ufs)}
      <div class="turnos__mapas">
        <figure><figcaption>1º turno <small>04/10 · resultado final</small></figcaption>${manchete(x1, 1)}${svgMapa(1, viraram)}</figure>
        <figure><figcaption>2º turno <small>${x2?.apurado != null ? `${pct(x2.apurado, 2)} das urnas apuradas` : 'aguardando'}</small></figcaption>${manchete(x2, 2, x1)}${svgMapa(2, viraram)}</figure>
      </div>
      <div class="turnos__viradas">${resumoViradas}${carregando}</div>
      <p class="turnos__nota">Contorno amarelo = trocou de líder do 1º para o 2º turno. Percentuais dos votos válidos; a cor compara só os dois finalistas. Com a apuração em andamento, o 2º turno ainda muda.</p>
      <div class="turnos__tip" hidden></div>`;
  }

  return {
    update(dados, g) {
      d = dados; geo = g;
      const ativo = !!(d?.cargo?.federal && d.turno === 2 && geo);
      el.hidden = !ativo || !t1;
      if (!ativo) return;
      carregarT1();
      pintar(false);
    },
  };
}

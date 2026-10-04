// Resumo, últimas atualizações e previsão de totalização.
import { int, pct, sinal, esc, horaMin, hora, ufLabel } from '../format.js';
import { donut, ICON, cnt } from './common.js';

export function renderResumo(d) {
  const n = d.nacional;
  const v = n.votos || {};
  return `<h2 class="card__title card__title--sm">Brasil – resumo da apuração</h2>
    <div class="resumo__body">
      ${donut(n.secoes.pct, 108, 12, 21, 'dn-resumo')}
      <div class="resumo__mid">
        <div class="box">
          <div class="box__label"><span class="ring"></span>Seções apuradas</div>
          <div class="box__value">${cnt(n.secoes.apuradas)}<small>de ${int(n.secoes.total)}</small></div>
        </div>
        <div class="box">
          <div class="box__label">Votos válidos</div>
          <div class="box__value box__value--sm">${cnt(v.validos)} <small style="margin-left:0">(${pct(v.pctValidos)})</small></div>
        </div>
      </div>
      <div class="resumo__side">
        <div class="box"><div class="box__label">Brancos <b>${pct(v.pctBrancos)}</b></div><div class="box__value">${cnt(v.brancos)}</div></div>
        <div class="box"><div class="box__label">Nulos <b>${pct(v.pctNulos)}</b></div><div class="box__value">${cnt(v.nulos)}</div></div>
        <div class="box" title="Eleitores das seções já apuradas que não foram votar"><div class="box__label">Abstenção ${n.eleitorado?.abstencao != null ? `<b>${pct(n.eleitorado.pctAbstencao)}</b>` : ''}</div><div class="box__value">${n.eleitorado?.abstencao != null ? cnt(n.eleitorado.abstencao) : '—'}</div></div>
      </div>
    </div>`;
}

export function corDaUF(d, uf) {
  const lider = d.estados[uf]?.lider;
  return (lider && d.cores[lider]) || '#8a93a6';
}

export function linhaAtualizacao(d, u, cls = 'upd') {
  return `<div class="${cls}" data-key="${u.t}-${u.uf}">
    <span class="upd__time">${horaMin(u.t)}</span>
    <span class="upd__icon" style="--c:${corDaUF(d, u.uf)}"><i></i></span>
    <span class="upd__uf">${ufLabel(u.uf)}</span>
    <span class="upd__txt">${int(u.adicionadas)} ${u.adicionadas === 1 ? 'seção adicionada' : 'seções adicionadas'}</span>
    <span class="upd__delta">${sinal(u.delta)}</span>
  </div>`;
}

export function renderUpdates(d) {
  const lista = d.atualizacoes.slice(0, 5);
  const ativo = d.status === 'apurando';
  let corpo;
  if (lista.length) corpo = lista.map((u) => linhaAtualizacao(d, u)).join('');
  else if (d.status === 'aguardando')
    corpo = `<p class="empty">As novas seções totalizadas aparecem aqui assim que o TSE começar a divulgar os resultados${Date.now() >= d.inicio ? '.' : ', a partir das 17h (horário de Brasília).'}</p>`;
  else corpo = `<p class="empty">Aguardando a próxima atualização do TSE…</p>`;
  return `<div class="updates__head">
      <span class="dot-live ${ativo ? '' : 'dot-live--off'}"></span>
      <h2 class="card__title card__title--sm">Últimas atualizações</h2>
      <button class="link" data-action="updates" ${d.atualizacoes.length ? '' : 'disabled'}>Ver todas ${ICON.arrowRight}</button>
    </div>
    <div class="upd-list">${corpo}</div>`;
}

export function renderPrevisao(d) {
  const p = d.previsao || { status: 'aguardando', barras: [] };
  let txt, eta;
  switch (p.status) {
    case 'estimada': {
      const porMin = ((p.ritmoPorHora || 0) / 100) * (d.nacional?.secoes?.total || 0) / 60;
      const ritmo = porMin >= 1000 ? `${(porMin / 1000).toFixed(1).replace('.', ',')} mil` : `${Math.round(porMin)}`;
      txt = porMin > 0 ? `Ritmo de ≈ ${ritmo} seções/min. Fim previsto por volta de` : 'Com o ritmo atual, a apuração deve ser concluída por volta de';
      eta = hora(p.eta);
      break;
    }
    case 'concluida':
      txt = 'Todas as seções foram totalizadas. Apuração concluída às';
      eta = hora(p.eta);
      break;
    case 'calculando':
      txt = 'Medindo o ritmo da totalização para estimar a conclusão.';
      eta = '…';
      break;
    default:
      txt = Date.now() >= d.inicio ? 'A estimativa aparece quando o TSE divulgar as primeiras seções.' : 'A estimativa aparece quando a totalização começar, às 17h.';
      eta = '--h--';
  }
  const barras = p.barras?.length ? p.barras.slice(-8) : new Array(8).fill(0);
  const max = Math.max(...barras, 0.0001);
  return `<div class="previsao__icon">${ICON.clock}</div>
    <div>
      <div class="previsao__title">Previsão de totalização</div>
      <div class="previsao__txt">${esc(txt)}</div>
      <div class="previsao__eta">${eta}</div>
    </div>
    <div class="previsao__bars" title="Pontos percentuais apurados a cada 6 minutos">
      ${barras.map((b) => `<i style="height:${Math.max(4, (b / max) * 52).toFixed(1)}px"></i>`).join('')}
    </div>`;
}

// "Quanto o salário mínimo compra": litros de gasolina, botijões e o mínimo corrigido pela inflação
// em três momentos (começo e fim do governo Bolsonaro e hoje) e a média de cada governo.
// Usa os indicadores sm_gasolina, sm_botijao e salario (dados oficiais do BC, ANP e IBGE).
import { esc } from '../format.js';
import { mandatosDuelo } from './comparar.js';
import { prepararSerie, mandatoDoPonto, rotuloPeriodo } from './serie.js';

const ITENS = [
  { id: 'sm_gasolina', icone: '⛽', nome: 'litros de gasolina', casas: 0 },
  { id: 'sm_botijao', icone: '🔥', nome: 'botijões de gás', casas: 1 },
  { id: 'salario', icone: '💵', nome: 'salário mínimo em reais de hoje', casas: 0, reais: true },
];
const fmt = (v, it) => (it.reais ? 'R$ ' : '') + v.toLocaleString('pt-BR', { minimumFractionDigits: it.casas, maximumFractionDigits: it.casas });

// Valor no mês pedido ou no último mês anterior com dado.
function valorEm(pts, periodo) {
  let achado = null;
  for (const p of pts) if (p.periodo <= periodo) achado = p;
  return achado;
}

export function htmlPoder(dados, mandatos) {
  const gov = mandatosDuelo(mandatos);
  const linhas = ITENS.map((it) => ({ it, pts: dados.get(it.id) ? prepararSerie(dados.get(it.id).serie, 'mensal') : [] })).filter((l) => l.pts.length);
  if (!linhas.length || gov.length < 2) return '';
  const ultimo = linhas.map((l) => l.pts[l.pts.length - 1].periodo).sort()[0];
  const momentos = [
    { p: '2019-01', rot: 'Começo do governo Bolsonaro', g: gov[0] },
    { p: '2022-12', rot: 'Fim do governo Bolsonaro', g: gov[0] },
    { p: ultimo, rot: 'Hoje (governo Lula)', g: gov[1] },
  ];
  const media = (pts, m) => {
    const ps = pts.filter((p) => mandatoDoPonto(p, mandatos)?.id === m.id);
    return ps.length ? ps.reduce((s, p) => s + p.v, 0) / ps.length : null;
  };
  const corpo = linhas.map(({ it, pts }) => {
    const vals = momentos.map((m) => valorEm(pts, m.p));
    const max = Math.max(...vals.map((v) => v?.v || 0), 1);
    const medias = gov.map((g) => media(pts, g));
    return `<div class="pd__linha">
        <div class="pd__item"><span class="pd__ic" aria-hidden="true">${it.icone}</span><b>${esc(it.nome)}</b>
          <small>média: ${gov.map((g, i) => `<span style="color:${g.cor}">${esc(g.curtoGov)} ${medias[i] != null ? fmt(medias[i], it) : '—'}</span>`).join(' × ')}</small></div>
        ${vals.map((v, i) => `<div class="pd__val" style="--c:${momentos[i].g.cor}">
            <b>${v ? fmt(v.v, it) : '—'}</b>
            <span class="pd__barra"><i style="width:${v ? ((v.v / max) * 100).toFixed(1) : 0}%;animation-delay:${(i * 0.1).toFixed(1)}s"></i></span>
            <small>${v ? esc(rotuloPeriodo(v.periodo, 'mensal')) : ''}</small>
          </div>`).join('')}
      </div>`;
  }).join('');
  return `<section class="pd" aria-labelledby="pd-titulo">
      <h2 id="pd-titulo" class="mercado__titulo">💰 Quanto o salário mínimo compra</h2>
      <p class="mercado__sub">Um salário mínimo inteiro, no preço médio de cada época (ANP), e o mínimo corrigido pela inflação (IPCA).</p>
      <div class="pd__cab"><span></span>${momentos.map((m) => `<span style="--c:${m.g.cor}">${esc(m.rot)}</span>`).join('')}</div>
      ${corpo}
    </section>`;
}

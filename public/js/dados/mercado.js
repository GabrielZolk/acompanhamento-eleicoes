// "Preços no mercado": quanto subiu cada item do IPCA em cada governo (Bolsonaro × Lula).
// Os dois mandatos têm durações diferentes (48 meses × o que já passou do atual), então a barra
// compara a alta média por ano; o acumulado de cada um aparece ao lado. Dados: variação mensal
// de cada subitem do IPCA (IBGE), em data/indicadores/mercado.json.
import { esc } from '../format.js';
import { mandatosDuelo, naPandemia, seloPandemia } from './comparar.js';
import { prepararSerie, rotuloPeriodo, mandatoDoPonto } from './serie.js';

const GRUPOS = [
  ['referencia', 'Referência'],
  ['mercado', 'No mercado'],
  ['casa', 'Em casa e no carro'],
];
const EMPATE_PP = 0.5; // diferença mínima (pontos por ano) para dizer em qual governo subiu menos

const pct = (v, casas = 1) => `${v > 0.05 ? '+' : v < -0.05 ? '−' : ''}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
const reais = (v) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// Alta acumulada e média por ano de um governo, compondo as variações mensais.
function acumulado(pts, m, mandatos, semPandemia) {
  const ps = pts.filter((p) => mandatoDoPonto(p, mandatos)?.id === m.id && !(semPandemia && naPandemia(p)));
  if (!ps.length) return null;
  const fator = ps.reduce((f, p) => f * (1 + p.v / 100), 1);
  return { meses: ps.length, acum: (fator - 1) * 100, anual: (fator ** (12 / ps.length) - 1) * 100, fator, ini: ps[0], fim: ps[ps.length - 1] };
}

// Alta por ano de cada item em cada governo; menor = índice do governo em que subiu menos (null = parecido).
export function calcularMercado(mercado, mandatos, semPandemia = false) {
  const gov = mandatosDuelo(mandatos);
  const linhas = [];
  if (!mercado?.itens?.length || gov.length < 2) return { gov, linhas };
  for (const it of mercado.itens) {
    const pts = prepararSerie(it.serie, 'mensal');
    const lados = gov.map((m) => acumulado(pts, m, mandatos, semPandemia));
    if (lados.some((l) => !l)) continue;
    const d = lados[0].anual - lados[1].anual;
    linhas.push({ it, lados, menor: Math.abs(d) < EMPATE_PP ? null : d < 0 ? 0 : 1, pts });
  }
  return { gov, linhas };
}

// Conta do carrinho: R$ 100 de compras no começo do governo Bolsonaro, até hoje (sempre com todos
// os meses: é o preço que de fato se paga).
export function contaCarrinho(mercado, mandatos) {
  const { gov, linhas } = calcularMercado(mercado, mandatos, false);
  const alim = linhas.find((l) => l.it.id === 'alimentos');
  if (!alim) return null;
  const [b, l] = alim.lados;
  const fimB = 100 * b.fator, hoje = fimB * l.fator;
  return { gov, b, l, fimB, hoje };
}

export function htmlMercado(mercado, mandatos, { semPandemia = false } = {}) {
  const { gov, linhas } = calcularMercado(mercado, mandatos, semPandemia);
  if (!linhas.length) return '';
  let lo = 0, hi = 0;
  for (const ln of linhas) for (const l of ln.lados) { lo = Math.min(lo, l.anual); hi = Math.max(hi, l.anual); }
  const span = hi - lo || 1;
  const z = (-lo / span) * 100; // posição do zero na barra (%)
  const barra = (l, m, i) => {
    const w = (Math.abs(l.anual) / span) * 100;
    const left = l.anual >= 0 ? z : z - w;
    return `<div class="mk__barra" title="${esc(`${m.curtoGov}: ${pct(l.anual)} ao ano · ${pct(l.acum, 0)} em ${l.meses} meses`)}">
        <i style="--c:${m.cor};left:${left.toFixed(2)}%;width:${Math.max(w, 0.6).toFixed(2)}%;animation-delay:${(0.05 * i).toFixed(2)}s"></i>
        <span class="mk__num${l.anual < 0 ? ' mk__num--neg' : ''}" style="--c:${m.cor}">${pct(l.anual)}<small>/ano</small></span>
      </div>`;
  };

  let i = 0;
  const corpo = GRUPOS.map(([g, nomeGrupo]) => {
    const doGrupo = linhas.filter((l) => (l.it.grupo || 'mercado') === g);
    if (!doGrupo.length) return '';
    return `<div class="mk__grupo">${esc(nomeGrupo)}</div>` + doGrupo.map((l) => {
      i++;
      const selo = l.menor == null
        ? '<span class="mk__selo mk__selo--igual">parecido</span>'
        : `<span class="mk__selo" style="--c:${gov[l.menor].cor}">subiu menos: ${esc(gov[l.menor].curtoGov)}</span>`;
      return `<div class="mk__linha${g === 'referencia' ? ' mk__linha--ref' : ''}">
          <div class="mk__item"><b>${esc(l.it.nome)}</b>${selo}</div>
          <div class="mk__barras">${barra(l.lados[0], gov[0], i)}${barra(l.lados[1], gov[1], i)}</div>
          <div class="mk__acum"><span style="--c:${gov[0].cor}">${pct(l.lados[0].acum, 0)}</span><span style="--c:${gov[1].cor}">${pct(l.lados[1].acum, 0)}</span></div>
        </div>`;
    }).join('');
  }).join('');

  // A conta do carrinho: R$ 100 de compras no começo do governo Bolsonaro, até hoje (sempre com
  // todos os meses: é o preço que de fato se paga).
  const alim = linhas.find((l) => l.it.id === 'alimentos');
  let carrinho = '';
  if (alim) {
    const [b, l] = gov.map((m) => acumulado(alim.pts, m, mandatos, false));
    if (b && l) {
      const fimB = 100 * b.fator, hoje = fimB * l.fator;
      carrinho = `<div class="carrinho">
          <div class="carrinho__icone" aria-hidden="true">🛒</div>
          <p>Compras de mercado que custavam <b>R$ 100</b> em ${esc(rotuloPeriodo(b.ini.periodo, 'mensal'))} custam <b class="carrinho__hoje">${reais(hoje)}</b> hoje (${esc(rotuloPeriodo(l.fim.periodo, 'mensal'))}).
          Desse aumento, <b style="color:${gov[0].cor}">${reais(fimB - 100)}</b> vieram no governo Bolsonaro (${b.meses} meses) e <b style="color:${gov[1].cor}">${reais(hoje - fimB)}</b> no governo Lula (${l.meses} meses).</p>
          <div class="carrinho__barra" aria-hidden="true"><i style="width:${((100 / hoje) * 100).toFixed(1)}%;background:#4a5468"></i><i style="width:${(((fimB - 100) / hoje) * 100).toFixed(1)}%;background:${gov[0].cor}"></i><i style="width:${(((hoje - fimB) / hoje) * 100).toFixed(1)}%;background:${gov[1].cor}"></i></div>
          <p class="carrinho__nota">Preços não voltam ao nível anterior quando a inflação cai: o aumento de um governo continua no preço durante o seguinte.</p>
        </div>`;
    }
  }

  return `<section class="mercado" id="mercado" aria-labelledby="mercado-titulo">
      <div class="mercado__cab">
        <div>
          <h2 id="mercado-titulo" class="mercado__titulo">Preços no mercado, item por item</h2>
          <p class="mercado__sub">Quanto cada item subiu por ano em cada governo${semPandemia ? `, sem os meses da pandemia ${seloPandemia('fora da conta')}` : ''}. Barra menor = subiu menos. Ao lado, a alta acumulada no mandato.</p>
        </div>
        <div class="mk__leg">${gov.map((m) => `<span style="--c:${m.cor}"><i></i>${esc(m.curtoGov)}</span>`).join('')}</div>
      </div>
      ${carrinho}
      <div class="mk">${corpo}</div>
      <p class="mercado__fonte">Fonte: <a href="${esc(mercado.fonteUrl || 'https://sidra.ibge.gov.br/tabela/7060')}" target="_blank" rel="noopener noreferrer">${esc(mercado.fonte || 'IBGE — IPCA')}</a>. Variação de preços medida pelo IBGE em 16 regiões metropolitanas e capitais. Dados até ${esc(rotuloPeriodo(mercado.atualizadoEm || linhas[0].lados[1].fim.periodo, 'mensal'))}.</p>
    </section>`;
}

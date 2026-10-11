// "Minha inflação": a pessoa diz quanto gasta por mês hoje em cada coisa e vê a inflação do próprio
// mês em cada governo, com as variações mensais de cada item do IPCA (mercado.json). Nada sai do
// navegador: não há envio nem armazenamento.
import { esc } from '../format.js';
import { mandatosDuelo } from './comparar.js';
import { prepararSerie, mandatoDoPonto, rotuloPeriodo } from './serie.js';

// Itens da calculadora: id em mercado.json e rótulo. "geral" (IPCA cheio) cobre "outros gastos".
const ITENS = [
  ['alimentos', 'Compras de mercado', '🛒'],
  ['fora', 'Comer fora (refeição e lanche)', '🍽️'],
  ['aluguel', 'Aluguel', '🏠'],
  ['condominio', 'Condomínio', '🏢'],
  ['energia', 'Conta de luz', '💡'],
  ['agua', 'Água e esgoto', '🚰'],
  ['botijao', 'Botijão de gás', '🔥'],
  ['internet', 'Internet', '📶'],
  ['gasolina', 'Gasolina', '⛽'],
  ['onibus', 'Ônibus', '🚌'],
  ['plano', 'Plano de saúde', '🩺'],
  ['remedios', 'Remédios', '💊'],
  ['geral', 'Outros gastos', '🧾'],
];
// Perfis de exemplo (valores ilustrativos, só para preencher rápido).
const PERFIS = {
  aluguel: { nome: 'Aluga e anda de ônibus', v: { alimentos: 900, fora: 150, aluguel: 1200, energia: 150, agua: 70, botijao: 120, internet: 100, onibus: 220, remedios: 80, geral: 400 } },
  carro: { nome: 'Carro e plano de saúde', v: { alimentos: 1300, fora: 450, condominio: 550, energia: 260, agua: 90, internet: 120, gasolina: 550, plano: 700, remedios: 120, geral: 900 } },
};

const reais = (v) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;
const pct = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

// Fator de preço de cada item em cada governo (composição das variações mensais).
function fatores(mercado, mandatos) {
  const gov = mandatosDuelo(mandatos);
  const porId = Object.fromEntries((mercado?.itens || []).map((i) => [i.id, i]));
  const out = {};
  let meses = [0, 0], ini = null, fim = null;
  for (const [id] of ITENS) {
    const it = porId[id];
    if (!it) continue;
    const pts = prepararSerie(it.serie, 'mensal');
    const f = gov.map((m, k) => {
      const ps = pts.filter((p) => mandatoDoPonto(p, mandatos)?.id === m.id);
      meses[k] = Math.max(meses[k], ps.length);
      if (k === 0 && ps.length) ini ||= ps[0].periodo;
      if (k === 1 && ps.length) fim = ps[ps.length - 1].periodo;
      return ps.reduce((x, p) => x * (1 + p.v / 100), 1);
    });
    out[id] = f;
  }
  return { gov, f: out, meses, ini, fim };
}

function calcular(gastos, base) {
  let hoje = 0, em2019 = 0, fimB = 0;
  for (const [id, valor] of Object.entries(gastos)) {
    const f = base.f[id];
    if (!f || !(valor > 0)) continue;
    const v0 = valor / (f[0] * f[1]);
    hoje += valor;
    em2019 += v0;
    fimB += v0 * f[0];
  }
  if (!hoje) return null;
  const fB = fimB / em2019, fL = hoje / fimB;
  const anual = (fat, n) => (fat ** (12 / n) - 1) * 100;
  return { hoje, em2019, fimB, anualB: anual(fB, base.meses[0]), anualL: anual(fL, base.meses[1]), acumB: (fB - 1) * 100, acumL: (fL - 1) * 100 };
}

function htmlResultado(r, base) {
  if (!r) return '<p class="minha__vazio">Preencha quanto você gasta por mês (ou escolha um exemplo) para ver a sua inflação.</p>';
  const [b, l] = base.gov;
  const sobeB = r.fimB - r.em2019, sobeL = r.hoje - r.fimB;
  const total = r.hoje;
  return `<div class="minha__res">
      <div class="minha__nums">
        <div class="rnum" style="--c:${b.cor}"><b>${pct(r.anualB)}</b><span>${esc(b.curtoGov)}</span><small>sua inflação por ano</small></div>
        <span class="rvs">×</span>
        <div class="rnum" style="--c:${l.cor}"><b>${pct(r.anualL)}</b><span>${esc(l.curtoGov)}</span><small>sua inflação por ano</small></div>
      </div>
      <p class="minha__frase">Os <b>${reais(r.hoje)}</b> que você gasta por mês hoje custavam <b>${reais(r.em2019)}</b> em ${esc(rotuloPeriodo(base.ini, 'mensal'))}.
        Desse aumento, <b style="color:${b.cor}">${reais(sobeB)}</b> vieram no governo Bolsonaro (${pct(r.acumB)} em ${base.meses[0]} meses) e
        <b style="color:${l.cor}">${reais(sobeL)}</b> no governo Lula (${pct(r.acumL)} em ${base.meses[1]} meses, até ${esc(rotuloPeriodo(base.fim, 'mensal'))}).</p>
      <div class="carrinho__barra" aria-hidden="true"><i style="width:${((r.em2019 / total) * 100).toFixed(1)}%;background:#4a5468"></i><i style="width:${((sobeB / total) * 100).toFixed(1)}%;background:${b.cor}"></i><i style="width:${((sobeL / total) * 100).toFixed(1)}%;background:${l.cor}"></i></div>
    </div>`;
}

export function montarMinhaInflacao(el, mercado, mandatos) {
  const base = fatores(mercado, mandatos);
  const disponiveis = ITENS.filter(([id]) => base.f[id]);
  if (!disponiveis.length || base.gov.length < 2) { el.innerHTML = ''; return; }
  const gastos = {};
  el.innerHTML = `<section class="minha" aria-labelledby="minha-titulo">
      <div class="minha__cab">
        <div>
          <h2 id="minha-titulo" class="mercado__titulo">🧮 Minha inflação</h2>
          <p class="mercado__sub">A média do IBGE pode não ser a sua. Diga quanto você gasta por mês hoje e veja quanto o seu mês subiu em cada governo. Nada é enviado nem salvo.</p>
        </div>
        <div class="minha__perfis" role="group" aria-label="Exemplos">
          ${Object.entries(PERFIS).map(([k, p]) => `<button type="button" data-perfil="${k}">${esc(p.nome)}</button>`).join('')}
          <button type="button" data-perfil="">Limpar</button>
        </div>
      </div>
      <div class="minha__grade">
        ${disponiveis.map(([id, nome, ic]) => `<label class="minha__item"><span>${ic} ${esc(nome)}</span><span class="minha__campo">R$<input type="number" inputmode="numeric" min="0" step="10" data-gasto="${id}" placeholder="0" aria-label="${esc(nome)} por mês, em reais"></span></label>`).join('')}
      </div>
      <div id="minha-res" aria-live="polite">${htmlResultado(null, base)}</div>
      <p class="tab__nota">Cada gasto é levado de volta aos preços de ${esc(rotuloPeriodo(base.ini || '2019-01', 'mensal'))} pela inflação do próprio item (IPCA/IBGE) e trazido até hoje governo a governo. "Outros gastos" usa a inflação geral.</p>
    </section>`;
  const res = el.querySelector('#minha-res');
  const atualizar = () => (res.innerHTML = htmlResultado(calcular(gastos, base), base));
  el.addEventListener('input', (ev) => {
    const id = ev.target.dataset.gasto;
    if (!id) return;
    gastos[id] = Math.max(0, Number(ev.target.value) || 0);
    atualizar();
  });
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-perfil]');
    if (!b) return;
    const p = PERFIS[b.dataset.perfil];
    for (const inp of el.querySelectorAll('[data-gasto]')) {
      const v = p?.v[inp.dataset.gasto] || 0;
      inp.value = v || '';
      gastos[inp.dataset.gasto] = v;
    }
    atualizar();
  });
}

// "Quanto de IR você paga": a mesma renda de hoje, corrigida pela inflação para cada época, passada
// pela tabela mensal do imposto de renda em vigor naquela época (ir.json, tabelas da Receita).
// Mostra o efeito da tabela sem correção e das mudanças de faixa e da isenção até R$ 5 mil.
import { esc } from '../format.js';
import { DUELO } from './comparar.js';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotMes = (p) => `${MESES[Number(p.slice(5, 7)) - 1]}/${p.slice(0, 4)}`;
const reais = (v) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const reais0 = (v) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;

// Imposto mensal retido (Receita): maior dedução entre a legal (INSS + dependentes) e o desconto
// simplificado; redução da Lei 15.270/2025 calculada sobre o rendimento bruto.
export function impostoMensal(t, renda, inss = 0, dependentes = 0) {
  const legal = inss + dependentes * (t.dependente || 0);
  const base = Math.max(0, renda - Math.max(legal, t.descontoSimplificado || 0));
  const faixa = t.faixas.find((f) => f.ate == null || base <= f.ate);
  let imposto = Math.max(0, (base * faixa.aliquota) / 100 - faixa.deduzir);
  const r = t.redutor;
  if (r && imposto > 0) {
    const reducao = renda <= r.isentoAte ? imposto : renda <= r.ate ? r.a - r.b * renda : 0;
    imposto -= Math.min(imposto, Math.max(0, reducao));
  }
  return Math.round(imposto * 100) / 100;
}

const tabelaEm = (ir, periodo) => ir.tabelas.find((t) => t.inicio.slice(0, 7) <= periodo && (!t.fim || t.fim.slice(0, 7) >= periodo));

// Fator de preços do mês até o último mês com IPCA (variações do IPCA geral em mercado.json).
function deflator(mercado) {
  const geral = mercado?.itens?.find((i) => i.id === 'geral');
  if (!geral) return null;
  const serie = geral.serie.slice().sort((a, b) => a[0].localeCompare(b[0]));
  const fator = {};
  let f = 1;
  for (let i = serie.length - 1; i >= 0; i--) {
    fator[serie[i][0]] = f; // preços do fim do mês i até hoje
    f *= 1 + serie[i][1] / 100;
  }
  return { fator, ultimo: serie[serie.length - 1][0] };
}

// Momentos comparados: começo e fim do governo Bolsonaro, um ponto em cada tabela do governo Lula e hoje.
function momentos(ultimo) {
  const ms = ['2019-01', '2022-12', '2023-06', '2024-06', '2025-06', ultimo];
  return [...new Set(ms)].filter((m) => m <= ultimo);
}

function htmlResultado(ir, def, renda, inss, dep) {
  if (!(renda > 0)) return '<p class="minha__vazio">Digite sua renda mensal para ver quanto de imposto você pagaria em cada época.</p>';
  const linhas = momentos(def.ultimo).map((m) => {
    const t = tabelaEm(ir, m);
    const f = def.fator[m] ?? 1;
    const rendaEpoca = renda / f;
    const imp = t ? impostoMensal(t, rendaEpoca, inss / f, dep) : 0;
    const gov = m < '2023-01' ? DUELO[0] : DUELO[1];
    return { m, t, f, rendaEpoca, imp, hoje: imp * f, pct: rendaEpoca ? (imp / rendaEpoca) * 100 : 0, gov };
  });
  const max = Math.max(...linhas.map((l) => l.hoje), 1);
  const [a, z] = [linhas[0], linhas[linhas.length - 1]];
  const fimB = linhas.find((l) => l.m === '2022-12');
  return `<div class="minha__res">
      <p class="minha__frase">Com a renda de <b>${reais0(renda)}</b> por mês, corrigida pela inflação para cada época, você pagaria de IR por mês (em reais de hoje):</p>
      <div class="irb">${linhas.map((l, i) => `<div class="irb__linha" style="--c:${l.gov.cor}">
          <span class="irb__mes">${rotMes(l.m)}${i === linhas.length - 1 ? ' (hoje)' : ''}<small>${esc(l.gov.curto)}</small></span>
          <span class="irb__barra"><i style="width:${((l.hoje / max) * 100).toFixed(1)}%;animation-delay:${(i * 0.08).toFixed(2)}s"></i></span>
          <span class="irb__val"><b>${reais(l.hoje)}</b><small>${l.pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% da renda</small></span>
        </div>`).join('')}</div>
      <p class="minha__frase">${fimB ? `No governo Bolsonaro a tabela ficou sem correção: de ${rotMes(a.m)} a dez/2022, o imposto da mesma renda real foi de ${reais(a.hoje)} para ${reais(fimB.hoje)}. ` : ''}Hoje: <b>${reais(z.hoje)}</b>${z.t?.redutor ? ' (com a redução da Lei 15.270/2025 para rendas até R$ 7.350)' : ''}.</p>
    </div>`;
}

export function montarCalcIR(el, ir, mercado) {
  const def = deflator(mercado);
  if (!ir?.tabelas?.length || !def) { el.innerHTML = ''; return; }
  el.innerHTML = `<section class="minha" aria-labelledby="ir-titulo">
      <div class="minha__cab">
        <div>
          <h2 id="ir-titulo" class="mercado__titulo">🧮 Quanto de IR você paga</h2>
          <p class="mercado__sub">A mesma renda de hoje, levada a cada época pela inflação, passada pela tabela do imposto de renda daquela época. Nada é enviado nem salvo.</p>
        </div>
        <div class="minha__perfis" role="group" aria-label="Exemplos">
          ${[3000, 5000, 7000, 10000].map((v) => `<button type="button" data-renda="${v}">${reais0(v)}</button>`).join('')}
        </div>
      </div>
      <div class="minha__grade">
        <label class="minha__item"><span>💼 Renda tributável por mês (salário bruto)</span><span class="minha__campo">R$<input type="number" inputmode="numeric" min="0" step="100" data-ir="renda" placeholder="0" aria-label="Renda mensal em reais"></span></label>
        <label class="minha__item"><span>🧾 INSS descontado (opcional)</span><span class="minha__campo">R$<input type="number" inputmode="numeric" min="0" step="10" data-ir="inss" placeholder="0" aria-label="INSS mensal em reais"></span></label>
        <label class="minha__item"><span>👨‍👩‍👧 Dependentes</span><span class="minha__campo"><input type="number" inputmode="numeric" min="0" step="1" data-ir="dep" placeholder="0" aria-label="Número de dependentes"></span></label>
      </div>
      <div id="ir-res" aria-live="polite">${htmlResultado(ir, def, 0, 0, 0)}</div>
      <p class="tab__nota">Imposto retido na fonte pela tabela mensal da Receita Federal, usando a maior dedução entre INSS + dependentes e o desconto simplificado (desde mai/2023). Não considera 13º, férias nem a declaração anual. Tabelas: ${ir.tabelas.map((t) => `<a href="${esc(t.fonteUrl || t.normaUrl)}" target="_blank" rel="noopener noreferrer">${esc(rotMes(t.inicio.slice(0, 7)))}</a>`).join(' · ')}.</p>
    </section>`;
  const v = { renda: 0, inss: 0, dep: 0 };
  const res = el.querySelector('#ir-res');
  const atualizar = () => (res.innerHTML = htmlResultado(ir, def, v.renda, v.inss, v.dep));
  el.addEventListener('input', (ev) => {
    const k = ev.target.dataset.ir;
    if (!k) return;
    v[k] = Math.max(0, Number(ev.target.value) || 0);
    atualizar();
  });
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-renda]');
    if (!b) return;
    v.renda = Number(b.dataset.renda);
    el.querySelector('[data-ir="renda"]').value = v.renda;
    atualizar();
  });
}

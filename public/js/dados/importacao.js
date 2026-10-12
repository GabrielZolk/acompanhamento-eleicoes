// "Compra internacional (AliExpress, Shein, Shopee…)": quanto se paga pela mesma compra em cada
// período das regras de importação (importacao.json, levantamento com as normas e a Receita).
// Fórmula da Receita: II = alíquota × valor aduaneiro (produto + frete) − dedução;
// ICMS "por dentro" = (valor aduaneiro + II) / (1 − alíquota) × alíquota.
import { esc } from '../format.js';
import { CORES_PARTIDO } from '../colors.js';
import { UFS } from '../ufs.js';

const reais = (v) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mes = (s) => (s ? `${MESES[Number(s.slice(5, 7)) - 1]}/${s.slice(0, 4)}` : 'hoje');
const COR = { bolsonaro: CORES_PARTIDO.PL, lula3: CORES_PARTIDO.PT, ambos: '#8a93a6' };

function calcular(p, { usd, frete, cambio, uf, certificado }) {
  const valorUSD = usd + frete;
  const regra = certificado && p.programaRemessaConforme !== false && p.ate50?.ii != null
    ? (valorUSD <= 50 ? p.ate50 : p.acima50)
    : (p.foraDoPrograma ? (valorUSD <= 50 ? p.foraDoPrograma.ate50 : p.foraDoPrograma.acima50) : (valorUSD <= 50 ? p.ate50 : p.acima50));
  const aduaneiro = valorUSD * cambio;
  const ii = Math.max(0, (regra.ii / 100) * valorUSD - (regra.iiDeducaoUSD || 0)) * cambio;
  const aliq = (p.icmsPorUF?.[uf.toUpperCase()] ?? regra.icms ?? 0) / 100;
  const icms = aliq ? ((aduaneiro + ii) / (1 - aliq)) * aliq : 0;
  return { aduaneiro, ii, icms, total: aduaneiro + ii + icms, aliq, regra };
}

function htmlResultado(dados, v) {
  if (!(v.usd > 0)) return '<p class="minha__vazio">Digite o preço do produto em dólar.</p>';
  const linhas = [];
  for (const p of dados.periodos) {
    const r = calcular(p, v);
    // Antes do Remessa Conforme, muita encomenda pequena chegava sem cobrança: mostra os dois casos.
    if (p.programaRemessaConforme === false) linhas.push({ p, r: { ...r, ii: 0, icms: 0, total: r.aduaneiro }, pratica: true });
    linhas.push({ p, r });
  }
  const max = Math.max(...linhas.map((l) => l.r.total));
  return `<div class="irb">${linhas.map(({ p, r, pratica }, i) => {
      const extra = r.total - r.aduaneiro;
      if (pratica) {
        return `<div class="irb__linha" style="--c:${COR[p.governo] || '#8a93a6'}">
          <span class="irb__mes">${esc(mes(p.inicio))} a ${esc(mes(p.fim))}<small>se não fosse taxado (comum na prática)</small></span>
          <span class="irb__barra"><i style="width:${((r.total / max) * 100).toFixed(1)}%"></i></span>
          <span class="irb__val"><b>${reais(r.total)}</b><small>sem imposto</small></span>
        </div>`;
      }
      return `<div class="irb__linha" style="--c:${COR[p.governo] || '#8a93a6'}">
          <span class="irb__mes">${esc(mes(p.inicio))} a ${esc(mes(p.fim))}<small>${esc(p.governo === 'ambos' ? 'pela lei (60%)' : p.governo === 'lula3' ? 'Lula' : 'Bolsonaro')}</small></span>
          <span class="irb__barra"><i style="width:${((r.total / max) * 100).toFixed(1)}%;animation-delay:${(i * 0.08).toFixed(2)}s"></i></span>
          <span class="irb__val"><b>${reais(r.total)}</b><small>+${((extra / r.aduaneiro) * 100).toFixed(0)}% de impostos (II ${reais(r.ii)}${r.icms ? ` + ICMS ${reais(r.icms)}` : ''})</small></span>
        </div>`;
    }).join('')}</div>
    <p class="tab__nota">Até jul/2023 o valor mostra a regra da lei (60%, sem ICMS somado porque cada estado tinha a sua). Na prática, muitas encomendas pequenas chegavam sem cobrança, porque a fiscalização era por amostragem. Não conta o IOF do cartão em compra no exterior (3,5% desde 2025; antes, em queda: 5,38% em 2023, 4,38% em 2024).</p>`;
}

export function montarImportacao(el, dados, dolarAtual) {
  if (!el) return;
  if (!dados?.periodos?.length) { el.innerHTML = ''; return; }
  const v = { usd: 0, frete: 0, cambio: Math.round((dolarAtual || 5) * 100) / 100, uf: 'sp', certificado: true };
  el.innerHTML = `<section class="minha" aria-labelledby="imp-titulo">
      <div class="minha__cab">
        <div>
          <h2 id="imp-titulo" class="mercado__titulo">📦 Compra internacional: quanto vira em cada época</h2>
          <p class="mercado__sub">AliExpress, Shein, Shopee e outros: a mesma compra, com as regras de imposto de cada período (Receita Federal e estados). Nada é enviado nem salvo.</p>
        </div>
        <div class="minha__perfis" role="group" aria-label="Exemplos">
          ${[[30, 5, 'Fone (US$ 30)'], [80, 10, 'Peça de PC (US$ 80)'], [250, 20, 'Placa de vídeo (US$ 250)']].map(([u, f, n]) => `<button type="button" data-imp="${u},${f}">${esc(n)}</button>`).join('')}
        </div>
      </div>
      <div class="minha__grade">
        <label class="minha__item"><span>🛍️ Produto</span><span class="minha__campo">US$<input type="number" inputmode="decimal" min="0" step="1" data-impv="usd" placeholder="0"></span></label>
        <label class="minha__item"><span>🚚 Frete</span><span class="minha__campo">US$<input type="number" inputmode="decimal" min="0" step="1" data-impv="frete" placeholder="0"></span></label>
        <label class="minha__item"><span>💵 Dólar</span><span class="minha__campo">R$<input type="number" inputmode="decimal" min="1" step="0.01" data-impv="cambio" value="${v.cambio}"></span></label>
        <label class="minha__item"><span>📍 Estado (ICMS)</span><span class="minha__campo"><select data-impv="uf">${UFS.filter((u) => u.uf !== 'zz').map((u) => `<option value="${u.uf}"${u.uf === 'sp' ? ' selected' : ''}>${esc(u.uf.toUpperCase())}</option>`).join('')}</select></span></label>
        <label class="minha__item"><span>✅ Site no Remessa Conforme</span><span class="minha__campo"><input type="checkbox" data-impv="certificado" checked></span></label>
      </div>
      <div id="imp-res" aria-live="polite">${htmlResultado(dados, v)}</div>
      <details class="resumo__nota"><summary>As regras de cada período e as fontes</summary>${dados.periodos.map((p) => `<p><b>${esc(mes(p.inicio))} a ${esc(mes(p.fim))}: ${esc(p.titulo)}</b><br>${esc(p.resumo || '')} ${(p.fontes || []).map((f) => `<a href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">${esc(f.nome)}</a>`).join(' · ')}</p>`).join('')}${(dados.notas || []).map((n) => `<p>${esc(n)}</p>`).join('')}</details>
    </section>`;
  const res = el.querySelector('#imp-res');
  const atualizar = () => (res.innerHTML = htmlResultado(dados, v));
  el.addEventListener('input', (ev) => {
    const k = ev.target.dataset.impv;
    if (!k) return;
    v[k] = k === 'uf' ? ev.target.value : k === 'certificado' ? ev.target.checked : Math.max(0, Number(ev.target.value) || 0);
    atualizar();
  });
  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-imp]');
    if (!b) return;
    const [u, f] = b.dataset.imp.split(',').map(Number);
    v.usd = u; v.frete = f;
    el.querySelector('[data-impv="usd"]').value = u;
    el.querySelector('[data-impv="frete"]').value = f;
    atualizar();
  });
}

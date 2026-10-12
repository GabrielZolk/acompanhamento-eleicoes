// Medição independente de um cidadão (perfil "Minha Inflação") ao lado do IBGE e de outros
// institutos, nos mesmos períodos. Pontos copiados do site do autor (minhainflacao.json), com link.
import { esc } from '../format.js';

const pct = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

// Variação acumulada de um item do mercado.json entre dois meses (inclusive).
function acumulado(mercado, id, de, ate) {
  const it = mercado?.itens?.find((i) => i.id === id);
  if (!it) return null;
  const ps = it.serie.filter(([p]) => p >= de && p <= ate);
  return ps.length ? (ps.reduce((f, [, v]) => f * (1 + v / 100), 1) - 1) * 100 : null;
}

export function htmlIndependente(dados, mercado) {
  if (!dados?.pontos?.length || !mercado) return '';
  const colunas = [
    ['alimentos', 'IBGE: comida em casa'],
    ['geral', 'IBGE: inflação geral'],
    ['ipc_fipe', 'USP (Fipe)'],
    ['ipc_fgv', 'FGV'],
  ];
  const linhas = dados.pontos.map((p) => {
    const outros = colunas.map(([id]) => acumulado(mercado, id, p.de, p.ate));
    const maxv = Math.max(p.valor, ...outros.filter((v) => v != null), 1);
    const barra = (v, cor) => `<span class="ind-barra"><i style="width:${((Math.max(v, 0) / maxv) * 100).toFixed(1)}%;background:${cor}"></i><b>${pct(v)}</b></span>`;
    return `<tr>
        <th scope="row">${esc(p.periodo)}<small>${esc(p.tipo)} · <a href="${esc(p.fonte)}" target="_blank" rel="noopener noreferrer">fonte</a></small></th>
        <td>${barra(p.valor, '#f5b13d')}</td>
        ${outros.map((v, i) => `<td>${v == null ? '—' : barra(v, i === 0 ? '#6d86ff' : '#5f687b')}</td>`).join('')}
      </tr>`;
  }).join('');
  const total = dados.pontos[dados.pontos.length - 1];
  const ibgeTotal = acumulado(mercado, 'alimentos', total.de, total.ate);
  return `<section class="indep" aria-labelledby="indep-titulo">
      <h2 id="indep-titulo" class="mercado__titulo">📸 Medição independente: ${esc(dados.nome)}</h2>
      <p class="mercado__sub">Um cidadão fotografa todo mês os preços de uma cesta básica em três supermercados, desde out/2023. Comparamos com o IBGE e com outros institutos nos mesmos períodos.</p>
      <ul class="escada__txt indep__pontos">
        <li>Desde o início (out/2023), a cesta dele subiu <b>${pct(total.valor)}</b>; a comida em casa no IBGE subiu <b>${ibgeTotal != null ? pct(ibgeTotal) : '—'}</b>. A diferença quase toda está no primeiro ano (+15,1% contra +6,0%).</li>
        <li>De 2025 para cá os dois andam juntos e, nos últimos 12 meses, a cesta dele subiu menos que a do IBGE.</li>
        <li>Uma cesta com bastante carne, leite e feijão sobe mais que a média da comida: no IBGE, esses itens subiram 29% a 34% no mesmo período.</li>
        <li>Começa em out/2023: <b>não há dado da época do governo Bolsonaro</b> para comparar.</li>
      </ul>
      <div class="tab__wrap"><table class="tab indep__tab">
        <thead><tr><th scope="col">Período</th><th scope="col">Minha Inflação</th>${colunas.map(([, n]) => `<th scope="col">${esc(n)}</th>`).join('')}</tr></thead>
        <tbody>${linhas}</tbody>
      </table></div>
      <details class="resumo__nota"><summary>Como ele mede e limites</summary><p>${esc(dados.metodo)}</p>${(dados.observacoes || []).map((o) => `<p>${esc(o)}</p>`).join('')}<p><a href="${esc(dados.site)}" target="_blank" rel="noopener noreferrer">Site do Minha Inflação</a> · <a href="${esc(dados.perfil)}" target="_blank" rel="noopener noreferrer">perfil no X</a></p></details>
    </section>`;
}

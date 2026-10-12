// "Preço × inflação": a escada. Preço é a altura do degrau; inflação é a velocidade de subida.
// Mostra o nível de preço da comida (R$ 100 em jan/2019, pelo IPCA do IBGE) no começo e no fim do
// governo Bolsonaro e hoje, para não confundir "subiu menos" com "está mais barato".
import { esc } from '../format.js';
import { contaCarrinho } from './mercado.js';
import { rotuloPeriodo } from './serie.js';

const reais = (v) => `R$ ${Math.round(v).toLocaleString('pt-BR')}`;

export function htmlEscada(mercado, mandatos) {
  const c = contaCarrinho(mercado, mandatos);
  if (!c) return '';
  const [b, l] = c.gov;
  const degraus = [
    { rot: rotuloPeriodo(c.b.ini.periodo, 'mensal'), sub: 'começo do governo Bolsonaro', v: 100, cor: '#4a5468' },
    { rot: rotuloPeriodo(c.b.fim.periodo, 'mensal'), sub: 'fim do governo Bolsonaro', v: c.fimB, cor: b.cor },
    { rot: rotuloPeriodo(c.l.fim.periodo, 'mensal'), sub: 'hoje, governo Lula', v: c.hoje, cor: l.cor },
  ];
  const max = c.hoje;
  const anosB = c.b.meses / 12, anosL = c.l.meses / 12;
  const porAno = (de, ate, anos) => reais((ate - de) / anos);
  return `<section class="escada" aria-labelledby="escada-titulo">
      <h2 id="escada-titulo" class="mercado__titulo">🪜 Preço × inflação: por que hoje é mais caro se a inflação é menor?</h2>
      <div class="escada__corpo">
        <div class="escada__graf" role="img" aria-label="${esc(`Compras de R$ 100 em ${degraus[0].rot} custavam ${reais(c.fimB)} no fim de 2022 e ${reais(c.hoje)} hoje`)}">
          ${degraus.map((d, i) => `<div class="escada__deg" style="--c:${d.cor};--h:${((d.v / max) * 100).toFixed(1)}%;animation-delay:${(i * 0.2).toFixed(1)}s">
              <b>${reais(d.v)}</b><i></i><span>${esc(d.rot)}<small>${esc(d.sub)}</small></span>
            </div>`).join('')}
        </div>
        <ul class="escada__txt">
          <li><b>Preço</b> é a altura do degrau. <b>Inflação</b> é a velocidade com que se sobe.</li>
          <li><b style="color:${b.cor}">Governo Bolsonaro:</b> subiu rápido, de ${reais(100)} para ${reais(c.fimB)} (+${reais(c.fimB - 100)}, cerca de ${porAno(100, c.fimB, anosB)} por ano).</li>
          <li><b style="color:${l.cor}">Governo Lula:</b> sobe mais devagar, mas começou de onde o anterior parou: de ${reais(c.fimB)} para ${reais(c.hoje)} (+${reais(c.hoje - c.fimB)}, cerca de ${porAno(c.fimB, c.hoje, anosL)} por ano).</li>
          <li><b>Preço não desce a escada.</b> Por isso o preço de hoje é sempre o mais alto, em qualquer governo, e a foto de hoje sempre ganha da foto de antes.</li>
          <li>Nos cartões, <b>"melhor" na inflação quer dizer que subiu mais devagar</b>, não que está mais barato.</li>
        </ul>
      </div>
      <p class="tab__nota">Compras de mercado (alimentação no domicílio, IPCA/IBGE). A cesta básica de São Paulo medida pelo DIEESE conta a mesma história: R$ 467,65 em jan/2019, R$ 791,29 em dez/2022 e R$ 906,14 em abr/2026.</p>
    </section>`;
}

// "O que a média esconde": fatos que a média do mandato e o placar não mostram, com números
// tirados dos mesmos dados dos cartões. Vale para os dois lados.
import { esc } from '../format.js';
import { CORES_PARTIDO } from '../colors.js';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mes = (p) => `${MESES[Number(p.slice(5, 7)) - 1]}/${p.slice(0, 4)}`;
const num = (v, c = 0) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c });
const B = CORES_PARTIDO.PL, L = CORES_PARTIDO.PT;

function ponto(dados, id, periodo) {
  const s = dados.get(id)?.serie;
  if (!s?.length) return null;
  if (!periodo) return s[s.length - 1];
  let achado = null;
  for (const p of s) if (p[0] <= periodo) achado = p;
  return achado;
}

export function htmlAlertas(dados) {
  const itens = [];
  // Bolsa Família: quem decidiu o valor, e a perda real desde 2023.
  const v19 = ponto(dados, 'bolsa_familia_valor', '2019-12'), v22 = ponto(dados, 'bolsa_familia_valor', '2022-12'), v23 = ponto(dados, 'bolsa_familia_valor', '2023-06'), vH = ponto(dados, 'bolsa_familia_valor');
  if (v19 && v22 && vH) {
    itens.push(`<b style="color:${B}">Bolsa Família / Auxílio Brasil:</b> o aumento para R$ 400 (dez/2021) e R$ 600 (ago/2022) foi do governo Bolsonaro, só no fim do mandato. Por isso a média dele é baixa (cerca de R$ ${num(v19[1])} em reais de hoje na maior parte do mandato) mesmo tendo terminado em R$ ${num(v22[1])}. <span style="color:${L}">O governo Lula manteve e somou R$ 150 por criança, mas não reajustou os R$ 600 desde 2023: em reais de hoje caiu de R$ ${num(v23?.[1] || v22[1])} para R$ ${num(vH[1])}.</span>`);
  }
  // Auxílio Emergencial: fora da média do benefício.
  itens.push(`<b style="color:${B}">Auxílio Emergencial (2020–21):</b> R$ 600 a R$ 1.200 por mês em 2020 para cerca de 68 milhões de pessoas, pago pelo governo Bolsonaro na pandemia. Não entra na média do benefício do Bolsa Família.`);
  // Famílias que saíram do programa.
  const f23 = ponto(dados, 'bolsa_familia_familias', '2023-01'), fH = ponto(dados, 'bolsa_familia_familias');
  if (f23 && fH && fH[1] < f23[1]) {
    itens.push(`<b style="color:${L}">Famílias cortadas do programa:</b> de ${num(f23[1], 1)} milhões (jan/2023) para ${num(fH[1], 1)} milhões (${mes(fH[0])}): ${num(f23[1] - fH[1], 1)} milhões a menos, com a revisão de cadastros. Antes, em 2022, o número tinha subido de 14,5 para 21,6 milhões.`);
  }
  // Situação de rua.
  const r19 = ponto(dados, 'situacao_rua', '2019-01'), r22 = ponto(dados, 'situacao_rua', '2022-12'), rH = ponto(dados, 'situacao_rua');
  if (r19 && r22 && rH) {
    itens.push(`<b>Pessoas morando na rua (Cadastro Único):</b> ${num(r19[1])} mil (jan/2019) → ${num(r22[1])} mil (dez/2022) → <b>${num(rH[1])} mil</b> (${mes(rH[0])}). Dobrou nos dois governos e hoje é o maior número da série. A pesquisa de pobreza do IBGE não pega quem vive na rua.`);
  }
  // Preço, juros e impostos.
  itens.push(`<b>Preço:</b> "melhor na inflação" quer dizer que subiu mais devagar. O preço de hoje é o mais alto da série (veja a escada abaixo).`);
  const cart = ponto(dados, 'juros_cartao'), carga = ponto(dados, 'carga');
  if (cart && carga) itens.push(`<b style="color:${L}">No bolso, agora:</b> juros do cartão rotativo em ${num(cart[1])}% ao ano e carga de impostos recorde (${num(carga[1], 1)}% do PIB em ${carga[0].slice(0, 4)}).`);
  itens.push(`<b style="color:${B}">Pandemia:</b> 22 meses do governo Bolsonaro tiveram pandemia; use o botão "Sem a pandemia" para tirar esses meses da conta.`);
  return `<section class="alertas" aria-label="O que a média esconde">
      <h2 class="alertas__titulo">⚠️ O que a média esconde</h2>
      <ul>${itens.map((i) => `<li>${i}</li>`).join('')}</ul>
    </section>`;
}

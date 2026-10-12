// Comparação direta entre os dois últimos governos (Bolsonaro 2019–2022 × Lula 2023–hoje):
// cartões lado a lado, com o sentido de cada indicador ("quanto menor, melhor") e o selo de
// qual governo teve o melhor resultado. A regra de cada indicador é fixa e aparece no cartão.
//
// Pandemia: o governo Bolsonaro teve 22 meses de pandemia (mar/2020–dez/2021). O modo "sem a
// pandemia" tira esses meses da conta (dos dois governos; só o de Bolsonaro tem meses nela) e o
// detalhe mostra o governo Bolsonaro por fase: antes, durante e depois. Não há projeção do que
// "teria acontecido": a tendência de 2019 levada adiante dá valores sem sentido (Selic negativa).
import { esc } from '../format.js';
import { CORES_PARTIDO } from '../colors.js';
import { fmtValor, fmtVariacao, rotuloPeriodo, mandatoDoPonto, dataParaT, dataFimParaT } from './serie.js';

// Os dois governos comparados (ids de indice.json → mandatos), com as cores dos partidos no painel.
export const DUELO = [
  { id: 'bolsonaro', nome: 'Jair Bolsonaro', curto: 'Bolsonaro', cor: CORES_PARTIDO.PL },
  { id: 'lula3', nome: 'Lula', curto: 'Lula', cor: CORES_PARTIDO.PT },
];

// melhor: sentido em que o indicador é considerado melhor para a população.
// criterio: "media" = média dos valores no mandato; "variacao" = fim − início (indicadores de
// estoque, como a dívida, em que o nível médio esconde se ela subiu ou caiu).
// aviso: ressalva curta que aparece no cartão.
export const REGRAS = {
  ipca: { melhor: 'menor', criterio: 'media', aviso: 'Compara quanto os preços SUBIRAM, não o preço: hoje o preço é o mais alto (veja a escada no topo). A inflação de 2021–22 subiu no mundo todo.' },
  alimentos: { melhor: 'menor', criterio: 'media', aviso: 'Compara quanto a comida SUBIU, não o preço: a comida hoje custa mais do que em 2022, só subiu mais devagar (veja a escada no topo).' },
  gasolina: { melhor: 'menor', criterio: 'media', aviso: 'Preço corrigido pela inflação. Em 2022, impostos federais foram zerados e o ICMS limitado; os federais voltaram em 2023.' },
  botijao: { melhor: 'menor', criterio: 'media', aviso: 'Preço corrigido pela inflação (reais de hoje).' },
  desemprego: { melhor: 'menor', criterio: 'media' },
  renda: { melhor: 'maior', criterio: 'media' },
  pib: { melhor: 'maior', criterio: 'media' },
  salario: { melhor: 'maior', criterio: 'media' },
  selic: { melhor: 'menor', criterio: 'media', aviso: 'Juros menores barateiam o crédito. A Selic é definida pelo Banco Central, autônomo desde 2021.' },
  dolar: { melhor: 'menor', criterio: 'media', aviso: 'Dólar mais baixo barateia importados, combustível e viagens.' },
  divida: { melhor: 'menor', criterio: 'variacao', aviso: 'Dívida é estoque: compara-se quanto subiu ou caiu durante o mandato.' },
  juros_cartao: { melhor: 'menor', criterio: 'media', aviso: 'Juro do rotativo: o que se paga quando a fatura não é quitada inteira.' },
  juros_pf: { melhor: 'menor', criterio: 'media' },
  endividamento: { melhor: 'menor', criterio: 'media', aviso: 'Dívidas das famílias com bancos em relação à renda de 12 meses.' },
  comprometimento: { melhor: 'menor', criterio: 'media', aviso: 'Parte da renda mensal que vai para parcelas e juros de dívidas.' },
  carga: { melhor: 'menor', criterio: 'media', aviso: 'Menor = menos imposto pago, em proporção do PIB. Impostos também financiam serviços públicos.' },
  arrecadacao: { melhor: null, criterio: 'media', aviso: 'Sem selo: arrecadar mais pode vir de imposto maior ou de economia aquecida.' },
  primario: { melhor: 'maior', criterio: 'media', aviso: 'Positivo = superávit (governo gastou menos do que arrecadou, sem contar juros).' },
  juros_divida: { melhor: 'menor', criterio: 'media', aviso: 'Quanto o setor público pagou de juros sobre a dívida, em proporção do PIB.' },
  desmatamento: { melhor: 'menor', criterio: 'media', aviso: 'Ano PRODES: agosto de um ano a julho do seguinte.' },
  caged: { melhor: 'maior', criterio: 'media', aviso: 'Empregos com carteira criados menos os fechados, em 12 meses.' },
  sm_gasolina: { melhor: 'maior', criterio: 'media', aviso: 'Salário mínimo do mês dividido pelo preço médio da gasolina no mesmo mês (ANP).' },
  sm_botijao: { melhor: 'maior', criterio: 'media', aviso: 'Salário mínimo do mês dividido pelo preço médio do botijão no mesmo mês (ANP).' },
  informalidade: { melhor: 'menor', criterio: 'media', aviso: 'Trabalhadores sem carteira, por conta própria sem CNPJ e outros vínculos informais.' },
  carteira: { melhor: 'maior', criterio: 'media' },
  investimento: { melhor: 'maior', criterio: 'media', aviso: 'Quanto do PIB vai para máquinas, obras e construção.' },
  reservas: { melhor: 'maior', criterio: 'media', aviso: 'Dólares guardados pelo Banco Central; protegem contra crises cambiais.' },
  exportacoes: { melhor: 'maior', criterio: 'media', aviso: 'Em dólares correntes: preços de commodities pesam muito.' },
  pobreza: { melhor: 'menor', criterio: 'media' },
  extrema_pobreza: { melhor: 'menor', criterio: 'media' },
  gini: { melhor: 'menor', criterio: 'media', aviso: 'De 0 a 1: quanto maior, mais desigual a renda.' },
  bolsa_familia_familias: { melhor: null, criterio: 'media', aviso: 'Sem selo: mais famílias pode ser mais cobertura ou mais pobreza.' },
  situacao_rua: { melhor: null, criterio: 'media', aviso: 'Sem selo: conta inscrições no Cadastro Único, e mais inscritos pode ser mais gente na rua ou mais busca ativa.' },
  bolsa_familia_valor: { melhor: 'maior', criterio: 'media', aviso: 'Valor médio por família, corrigido pela inflação.' },
  ideb_iniciais: { melhor: 'maior', criterio: 'media', aviso: 'IDEB sai a cada 2 anos; 2021 foi medido logo depois das escolas fechadas na pandemia.' },
  ideb_finais: { melhor: 'maior', criterio: 'media', aviso: 'IDEB sai a cada 2 anos; 2021 foi medido logo depois das escolas fechadas na pandemia.' },
  ideb_medio: { melhor: 'maior', criterio: 'media', aviso: 'IDEB sai a cada 2 anos; 2021 foi medido logo depois das escolas fechadas na pandemia.' },
  homicidios: { melhor: 'menor', criterio: 'media' },
  juro_real: { melhor: 'menor', criterio: 'media', aviso: 'Selic menos a inflação esperada: o custo do dinheiro descontada a inflação.' },
  divida_liquida: { melhor: 'menor', criterio: 'variacao', aviso: 'Dívida menos ativos do governo (como as reservas). Estoque: compara-se quanto subiu ou caiu.' },
  estatais: { melhor: 'maior', criterio: 'media', aviso: 'Positivo = lucro primário. Não inclui Petrobras, Eletrobras e bancos públicos.' },
  queimadas: { melhor: 'menor', criterio: 'media', aviso: 'Área queimada depende muito de seca e clima: 2024 teve seca extrema.' },
  focos_calor: { melhor: 'menor', criterio: 'media' },
  feminicidios: { melhor: 'menor', criterio: 'media', aviso: 'O crime existe na lei desde 2015; parte da alta inicial é classificação melhor dos casos.' },
  latrocinios: { melhor: 'menor', criterio: 'media' },
  estupros: { melhor: 'menor', criterio: 'media', aviso: 'Registros dependem também de quantas vítimas denunciam.' },
  roubo_veiculos: { melhor: 'menor', criterio: 'media' },
  mortes_policia: { melhor: 'menor', criterio: 'media' },
  policiais_mortos: { melhor: 'menor', criterio: 'media' },
  armas_registros: { melhor: null, criterio: 'media', aviso: 'Sem selo: mais armas registradas é visto como bom por uns e ruim por outros.' },
  armas_cac: { melhor: null, criterio: 'media', aviso: 'Sem selo: mais armas registradas é visto como bom por uns e ruim por outros.' },
  vacinacao: { melhor: 'maior', criterio: 'media' },
};

// Temas, na ordem em que aparecem na comparação.
export const TEMAS = ['custo de vida', 'renda e emprego', 'crédito e dívidas', 'impostos e contas públicas', 'economia', 'social', 'educação', 'saúde', 'segurança', 'meio ambiente'];
const TEMA_PADRAO = { ipca: 'custo de vida', alimentos: 'custo de vida', gasolina: 'custo de vida', botijao: 'custo de vida', desemprego: 'renda e emprego', renda: 'renda e emprego', salario: 'renda e emprego', pib: 'economia', dolar: 'economia', selic: 'crédito e dívidas', divida: 'impostos e contas públicas' };
export const temaDe = (ind) => ind.tema || TEMA_PADRAO[ind.id] || 'economia';
const regra = (ind) => REGRAS[ind.id] || { melhor: 'menor', criterio: 'media' };

// Diferença mínima para declarar um governo melhor: 3% do valor (média) ou 1 ponto (variação).
const EMPATE_REL = 0.03, EMPATE_ABS = 1;

// Período da pandemia (vem do "contexto" de indice.json; este é o valor padrão).
const PANDEMIA = { inicio: '2020-03-01', fim: '2021-12-31', t0: 0, t1: 0 };
export function definirPandemia(contexto = []) {
  const c = contexto.find((x) => /pandemia/i.test(x.rotulo || ''));
  if (c?.inicio && c?.fim) Object.assign(PANDEMIA, { inicio: c.inicio, fim: c.fim });
  PANDEMIA.t0 = dataParaT(PANDEMIA.inicio);
  PANDEMIA.t1 = dataFimParaT(PANDEMIA.fim);
}
definirPandemia();
export const naPandemia = (p) => p.t >= PANDEMIA.t0 && p.t < PANDEMIA.t1;
export const rotuloPandemia = () => `${rotuloPeriodo(PANDEMIA.inicio.slice(0, 7), 'mensal')} a ${rotuloPeriodo(PANDEMIA.fim.slice(0, 7), 'mensal')}`;

export function mandatosDuelo(mandatos) {
  return DUELO.map((g) => {
    const m = mandatos.find((x) => x.id === g.id);
    return m ? { ...m, ...g, nome: m.nome, curtoGov: g.curto, nomeGov: g.nome } : null;
  }).filter(Boolean);
}

// Valor de um conjunto de pontos pelo critério. Na variação, pontos não contíguos (a pandemia
// retirada no meio) somam a variação de cada trecho: o que subiu ou caiu fora da pandemia.
function valorDe(ps, todos, criterio) {
  if (!ps.length) return null;
  if (criterio !== 'variacao') return ps.reduce((s, p) => s + p.v, 0) / ps.length;
  let soma = 0, ini = ps[0];
  for (let k = 1; k <= ps.length; k++) {
    const quebra = k === ps.length || todos.indexOf(ps[k]) !== todos.indexOf(ps[k - 1]) + 1;
    if (quebra) {
      soma += ps[k - 1].v - ini.v;
      ini = ps[k];
    }
  }
  return soma;
}

// Valor de cada governo segundo o critério e o vencedor (índice 0/1 ou null = empate).
// semPandemia: tira da conta os meses da pandemia.
export function compararIndicador(ind, pts, mandatos, { semPandemia = false } = {}) {
  const gov = mandatosDuelo(mandatos);
  if (gov.length < 2) return null;
  const r = regra(ind);
  const lados = gov.map((m) => {
    const dentro = pts.filter((p) => mandatoDoPonto(p, mandatos)?.id === m.id);
    if (!dentro.length) return null;
    const fora = dentro.filter((p) => !naPandemia(p));
    const nPandemia = dentro.length - fora.length;
    const cheio = valorDe(dentro, pts, r.criterio);
    const semPand = valorDe(fora, pts, r.criterio);
    const valor = semPandemia && semPand != null ? semPand : cheio;
    const usados = semPandemia ? fora : dentro;
    const media = usados.reduce((s, p) => s + p.v, 0) / usados.length;
    // Melhor e pior marca do governo no período considerado, pelo sentido do indicador.
    let alto = usados[0], baixo = usados[0];
    for (const p of usados) {
      if (p.v > alto.v) alto = p;
      if (p.v < baixo.v) baixo = p;
    }
    // Sem sentido definido (melhor: null), "melhor" e "pior" viram máxima e mínima.
    const [melhor, pior] = r.melhor === 'menor' ? [baixo, alto] : [alto, baixo];
    return { m, dentro, ini: dentro[0], fim: dentro[dentro.length - 1], media, valor, cheio, semPand, nPandemia, melhor, pior };
  });
  if (lados.some((l) => !l)) return null;
  const [a, b] = lados;
  const dif = r.melhor === 'menor' ? b.valor - a.valor : a.valor - b.valor; // > 0: Bolsonaro melhor
  const limite = r.criterio === 'variacao' ? EMPATE_ABS : EMPATE_REL * Math.max(Math.abs(a.valor), Math.abs(b.valor));
  const vencedor = !r.melhor || Math.abs(dif) < limite ? null : dif > 0 ? 0 : 1;
  return { regra: r, lados, vencedor, semPandemia };
}

const ICONE = {
  menor: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8M2.5 6.5 6 10l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  maior: '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10V2M2.5 5.5 6 2l3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trofeu: '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" fill="currentColor"/><path d="M7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v3M8.5 20h7M10 17h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  igual: '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 5h8M3 9h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  bom: '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.5 5 9l4.5-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="ext__rot">melhor</span>',
  ruim: '<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 3 6 6M9 3 3 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="ext__rot">pior</span>',
  virus: '<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5.5" fill="currentColor"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.3 5.3l2.8 2.8M15.9 15.9l2.8 2.8M5.3 18.7l2.8-2.8M15.9 8.1l2.8-2.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

export const seloSentido = (ind) => {
  const r = regra(ind);
  if (!r.melhor) return '<span class="sentido sentido--neutro">Sem melhor ou pior</span>';
  return `<span class="sentido sentido--${r.melhor}">${ICONE[r.melhor]}Quanto ${r.melhor}, melhor</span>`;
};
export const seloPandemia = (txt = 'Pandemia') => `<span class="pand">${ICONE.virus}${esc(txt)}</span>`;

function seloVencedor(cmp) {
  if (!cmp.regra.melhor) return '<span class="selo selo--igual">Sem selo neste indicador</span>';
  if (cmp.vencedor == null) return `<span class="selo selo--igual">${ICONE.igual}Praticamente igual</span>`;
  const m = cmp.lados[cmp.vencedor].m;
  return `<span class="selo" style="--c:${m.cor}">${ICONE.trofeu}Melhor no governo ${esc(m.curtoGov)}</span>`;
}

// Número que conta até o valor quando aparece (ver animarNumeros).
function numero(v, ind, sinal) {
  const txt = sinal ? fmtVariacao(0, v, ind) : fmtValor(v, ind);
  return `<span class="conta" data-v="${v}"${sinal ? ' data-sinal="1"' : ''}>${esc(txt)}</span>`;
}
const fmtCrit = (v, ind, r) => (r.criterio === 'variacao' ? fmtVariacao(0, v, ind) : fmtValor(v, ind));

function anos(m) {
  const a = m.inicio.slice(0, 4);
  return m.fim ? `${a}–${m.fim.slice(0, 4)}` : `${a}–hoje`;
}

function htmlLado(l, i, cmp, ind, periodicidade) {
  const r = cmp.regra;
  const vence = cmp.vencedor === i;
  const base = r.criterio === 'variacao' ? 'variação' : 'média';
  const rot = l.nPandemia && cmp.semPandemia ? `${base} sem a pandemia` : `${base} no mandato`;
  // O outro modo, sempre à vista: quem olha o mandato inteiro vê também o número sem a pandemia.
  const alt = l.nPandemia && l.semPand != null
    ? `<div class="lado__alt">${seloPandemia(cmp.semPandemia ? `com a pandemia: ${fmtCrit(l.cheio, ind, r)}` : `sem a pandemia: ${fmtCrit(l.semPand, ind, r)}`)}</div>`
    : '';
  return `<div class="lado${vence ? ' lado--vence' : ''}" style="--c:${l.m.cor}">
      <div class="lado__nome"><i></i>${esc(l.m.curtoGov)} <small>${anos(l.m)}</small></div>
      <div class="lado__valor">${numero(l.valor, ind, r.criterio === 'variacao')}</div>
      <div class="lado__rot">${rot}</div>
      ${alt}
      <div class="lado__ext">${esc(fmtValor(l.ini.v, ind))} <span aria-hidden="true">→</span> ${esc(fmtValor(l.fim.v, ind))}<small>${esc(rotuloPeriodo(l.ini.periodo, periodicidade))} a ${esc(rotuloPeriodo(l.fim.periodo, periodicidade))}</small></div>
      <div class="lado__ext2">
        <span class="ext ext--bom" title="Melhor marca do governo">${cmp.regra.melhor ? ICONE.bom : '<span class="ext__rot">máxima</span>'}<b>${esc(fmtValor(l.melhor.v, ind))}</b> ${esc(rotuloPeriodo(l.melhor.periodo, periodicidade))}</span>
        <span class="ext ext--ruim" title="Pior marca do governo">${cmp.regra.melhor ? ICONE.ruim : '<span class="ext__rot">mínima</span>'}<b>${esc(fmtValor(l.pior.v, ind))}</b> ${esc(rotuloPeriodo(l.pior.periodo, periodicidade))}</span>
      </div>
    </div>`;
}

// Minigráfico dos dois mandatos na mesma escala, cada um na cor do seu governo, com a média
// tracejada e a faixa da pandemia (HTML por cima: o SVG é esticado e deformaria o texto).
function graficoDuelo(cmp) {
  const W = 320, H = 86, pt = 8, pb = 6;
  const todos = cmp.lados.flatMap((l) => l.dentro);
  const t0 = todos[0].ini, t1 = todos[todos.length - 1].fim;
  let lo = Infinity, hi = -Infinity;
  for (const p of todos) { lo = Math.min(lo, p.v); hi = Math.max(hi, p.v); }
  const folga = (hi - lo) * 0.08 || 1;
  lo -= folga; hi += folga;
  const x = (t) => ((t - t0) / (t1 - t0)) * W;
  const y = (v) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  let svg = `<svg class="duelo__svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">`;
  if (lo < 0 && hi > 0) svg += `<line class="spark__zero" x1="0" x2="${W}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" vector-effect="non-scaling-stroke"/>`;
  cmp.lados.forEach((l, i) => {
    const xa = x(Math.max(l.m.t0, t0)), xb = x(Math.min(l.m.t1, t1));
    const ps = l.dentro;
    const d = ps.map((p, k) => `${k ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join('');
    const base = y(lo);
    svg += `<rect x="${xa.toFixed(1)}" y="0" width="${(xb - xa).toFixed(1)}" height="${H}" fill="${l.m.cor}" fill-opacity=".07"/>`;
    svg += `<path d="${d}L${x(ps[ps.length - 1].t).toFixed(1)} ${base}L${x(ps[0].t).toFixed(1)} ${base}Z" fill="${l.m.cor}" fill-opacity=".14"/>`;
    if (cmp.regra.criterio === 'media') {
      svg += `<line class="duelo__media" x1="${xa.toFixed(1)}" x2="${xb.toFixed(1)}" y1="${y(l.media).toFixed(1)}" y2="${y(l.media).toFixed(1)}" stroke="${l.m.cor}" vector-effect="non-scaling-stroke"/>`;
    }
    svg += `<path class="duelo__linha" style="--d:${0.15 + i * 0.55}s" d="${d}" stroke="${l.m.cor}" pathLength="1" vector-effect="non-scaling-stroke"/>`;
  });
  svg += '</svg>';
  const pa = Math.max(PANDEMIA.t0, t0), pb2 = Math.min(PANDEMIA.t1, t1);
  const faixa = pb2 > pa
    ? `<div class="duelo__pand${cmp.semPandemia ? ' duelo__pand--fora' : ''}" style="left:${((x(pa) / W) * 100).toFixed(2)}%;width:${(((x(pb2) - x(pa)) / W) * 100).toFixed(2)}%">${seloPandemia(cmp.semPandemia ? 'Fora da conta' : 'Pandemia')}</div>`
    : '';
  return svg + faixa;
}

// Cartão de um indicador. compacto = grade (abre o detalhe ao clicar); senão, bloco do detalhe.
export function htmlDuelo(ind, pts, mandatos, periodicidade, { compacto = true, semPandemia = false } = {}) {
  const cmp = compararIndicador(ind, pts, mandatos, { semPandemia });
  if (!cmp) return '';
  const r = cmp.regra;
  const venc = cmp.vencedor == null ? null : cmp.lados[cmp.vencedor].m;
  const resumo = `${ind.titulo}${semPandemia ? ', sem os meses da pandemia' : ''}: ${cmp.lados.map((l) => `${l.m.curtoGov} ${fmtCrit(l.valor, ind, r)}`).join(', ')}. ${r.melhor ? `Quanto ${r.melhor}, melhor.` : ''} ${venc ? `Melhor no governo ${venc.curtoGov}.` : 'Praticamente igual.'}`;
  const tag = compacto ? 'button' : 'div';
  return `<${tag} ${compacto ? 'type="button" ' : ''}class="duelo${compacto ? '' : ' duelo--det'}" data-id="${esc(ind.id)}"${venc ? ` style="--v:${venc.cor}"` : ''}${compacto ? ` aria-label="${esc(resumo)} Abrir detalhes"` : ''}>
      <div class="duelo__topo">
        <h2 class="duelo__titulo">${compacto ? esc(ind.curto || ind.titulo) : 'Bolsonaro × Lula'}</h2>
        ${seloSentido(ind)}
      </div>
      <div class="duelo__lados">
        ${htmlLado(cmp.lados[0], 0, cmp, ind, periodicidade)}
        <span class="duelo__vs" aria-hidden="true">vs</span>
        ${htmlLado(cmp.lados[1], 1, cmp, ind, periodicidade)}
      </div>
      <div class="duelo__graf">${graficoDuelo(cmp)}</div>
      <div class="duelo__pe">
        ${seloVencedor(cmp)}
        ${compacto ? '<span class="duelo__mais">Ver detalhes <span aria-hidden="true">→</span></span>' : ''}
      </div>
      ${r.aviso ? `<p class="duelo__aviso">${esc(r.aviso)}</p>` : ''}
    </${tag}>`;
}

// Governo Bolsonaro por fase (antes, durante e depois da pandemia), com o governo Lula ao lado.
// Só dados medidos, pela mesma regra do cartão.
export function htmlFases(ind, pts, mandatos, periodicidade) {
  const gov = mandatosDuelo(mandatos);
  if (gov.length < 2) return '';
  const r = regra(ind);
  const [b, l] = gov;
  const doGov = (m) => pts.filter((p) => mandatoDoPonto(p, mandatos)?.id === m.id);
  const pb = doGov(b), pl = doGov(l);
  const fases = [
    { nome: 'Antes da pandemia', ps: pb.filter((p) => p.t < PANDEMIA.t0), cor: b.cor },
    { nome: 'Pandemia', ps: pb.filter(naPandemia), cor: b.cor, pand: true },
    { nome: 'Depois da pandemia', ps: pb.filter((p) => p.t >= PANDEMIA.t1), cor: b.cor },
    { nome: 'Governo Lula', ps: pl, cor: l.cor },
  ].filter((f) => f.ps.length);
  if (fases.length < 3) return '';
  const base = r.criterio === 'variacao' ? 'variação no período' : 'média no período';
  const blocos = fases.map((f, i) => {
    const v = valorDe(f.ps, pts, r.criterio);
    const per = `${rotuloPeriodo(f.ps[0].periodo, periodicidade)} a ${rotuloPeriodo(f.ps[f.ps.length - 1].periodo, periodicidade)}`;
    return `<div class="fase${f.pand ? ' fase--pand' : ''}${i === fases.length - 1 ? ' fase--lula' : ''}" style="--c:${f.cor};animation-delay:${(0.1 + i * 0.12).toFixed(2)}s">
        <div class="fase__nome">${f.pand ? seloPandemia() : esc(f.nome)}</div>
        <div class="fase__valor">${numero(v, ind, r.criterio === 'variacao')}</div>
        <div class="fase__per">${esc(per)} · ${base}</div>
      </div>`;
  }).join('');
  return `<section class="painel fases" aria-labelledby="fases-titulo">
      <h2 class="painel__titulo" id="fases-titulo">Governo Bolsonaro por fase</h2>
      <div class="fases__grade">${blocos}</div>
      <p class="tab__nota">Dados medidos, sem projeção. Uma projeção do que "teria acontecido" sem a pandemia depende do método escolhido: a tendência de 2019 levada adiante dá até juros negativos em 2022. Indicadores acumulados em 12 meses ou 4 trimestres (inflação, PIB) ainda carregam meses anteriores no começo de cada fase.</p>
    </section>`;
}

// Cabeçalho da comparação: os dois governos frente a frente.
export function htmlPlacar(mandatos, ultimoDado) {
  const [a, b] = mandatosDuelo(mandatos);
  if (!a || !b) return '';
  const cab = (m, extra) => `<div class="frente" style="--c:${m.cor}">
      <span class="frente__ini">${esc(m.curtoGov.slice(0, 1))}</span>
      <span class="frente__txt"><b>${esc(m.nomeGov)}</b><small>${anos(m)}${extra}</small></span>
    </div>`;
  return `<div class="placar">
      ${cab(a, '')}
      <span class="placar__vs">VS</span>
      ${cab(b, ultimoDado ? ` · dados até ${esc(ultimoDado)}` : '')}
    </div>`;
}

// Botões "Mandato inteiro | Sem a pandemia" (o mesmo estado na grade e no detalhe).
export function htmlSegPandemia(semPandemia) {
  return `<div class="seg seg--pand" role="group" aria-label="Meses considerados">
      <button type="button" data-pand="0" aria-pressed="${!semPandemia}">Mandato inteiro</button>
      <button type="button" data-pand="1" aria-pressed="${semPandemia}">${ICONE.virus}Sem a pandemia <small>${esc(rotuloPandemia())}</small></button>
    </div>`;
}

// Contagem animada dos números quando entram na tela (uma vez por elemento).
let observador = null;
export function animarNumeros(raiz, ind, reduzir) {
  const els = raiz.querySelectorAll('.conta:not([data-ok])');
  if (reduzir || !('IntersectionObserver' in window)) return;
  observador ||= new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      observador.unobserve(e.target);
      contar(e.target);
    }
  }, { threshold: 0.4 });
  els.forEach((el) => {
    el.dataset.ok = '1';
    el._ind = typeof ind === 'function' ? ind(el) : ind;
    el._txt = el.textContent;
    observador.observe(el);
  });
}

function contar(el) {
  const alvo = Number(el.dataset.v), ind = el._ind, sinal = el.dataset.sinal;
  if (!ind || !Number.isFinite(alvo)) return;
  const dur = 1100, t0 = performance.now();
  const passo = (agora) => {
    const k = Math.min(1, (agora - t0) / dur);
    const v = alvo * (1 - (1 - k) ** 3);
    el.textContent = k < 1 ? (sinal ? fmtVariacao(0, v, ind) : fmtValor(v, ind)) : el._txt;
    if (k < 1) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}

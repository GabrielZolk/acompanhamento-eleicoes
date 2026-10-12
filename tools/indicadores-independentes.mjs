// Indicadores "independentes" do "Raio-X do Brasil": medidos por quem NÃO é o governo federal (organismos
// internacionais, universidades, institutos privados, mercado e entidades de classe), para quem desconfia do IBGE
// poder comparar. Chamados por tools/build-indicadores.mjs, que valida, grava e monta o índice. Sem chave de API:
//   - FAO (ONU), FAOSTAT, bulk "Food_Security_Data_E_All_Data_(Normalized).zip" (bulks-faostat.fao.org; a API
//     faostatservices passou a exigir autenticação): prevalência de subnutrição (item 210041) e de insegurança
//     alimentar grave (210401) e moderada ou grave (210091), Brasil, médias de 3 anos. O ZIP é lido por tools/xlsx.mjs.
//   - DIEESE, Pesquisa Nacional da Cesta Básica, banco de dados (www.dieese.org.br/cesta/produto, consulta pública
//     por POST que devolve tabela HTML): gasto mensal e tempo de trabalho da cesta em São Paulo.
//   - B3, Ibovespa (fechamento diário) via Ipeadata (série GM366_IBVSP366) ÷ dólar PTAX de fim de mês (Banco
//     Central, SGS 3696).
//   - Ipeadata (www.ipeadata.gov.br/api/odata4), que republica séries de terceiros: Fecomercio-SP (ICC), CNI (ICEI),
//     CNC (Peic) e FipeZap (índice de preços de imóveis anunciados).
//   - Banco Central, SGS (via `sgs()` de build-indicadores.mjs), que republica a variação mensal do IPC-Fipe (193) e
//     do IGP-M da FGV (189).
// Ficaram de fora (sem série aberta legível por máquina): Índices de Confiança do Consumidor e da Indústria da FGV
// (só no FGV Dados, com cadastro; no lugar entram o ICC da Fecomercio-SP e o ICEI da CNI), EMBI+ do J.P. Morgan
// (a série no Ipeadata está inativa desde julho de 2024) e pedidos de recuperação judicial da Serasa Experian (a
// planilha pública cobre só os dois últimos anos; o histórico é vendido).
//
// Uso: indicadoresIndependentes({ sgs }) devolve entradas no formato de INDICADORES de build-indicadores.mjs
// (metadados do índice + `montar()`); `sgs` é o leitor de séries do SGS de lá ([{ data: "AAAA-MM-DD", valor }]).
// Cada entrada traz também `independente: true`, `fonteTipo` e `melhor` ("maior" | "menor" | null).
import { lerZip } from './xlsx.mjs';

const UA = 'apuracao-2026-painel/1.0 (indicadores)';
const INICIO = '2003-01';
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const arred = (v, casas) => Math.round(v * 10 ** casas) / 10 ** casas;
const ordenar = (m) => [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1));
const pad2 = (n) => String(n).padStart(2, '0');
const hoje = (() => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; })();

// Mesma política de build-indicadores.mjs: uma requisição por vez, 3 tentativas com espera crescente.
// `tentativas`: o Ipeadata às vezes recusa conexões por alguns segundos seguidos, então lá se tenta mais vezes.
async function baixar(url, ler, { tentativas = 3, ...opcoes } = {}) {
  for (let tentativa = 1; ; tentativa++) {
    await pausa(300);
    try {
      const res = await fetch(url, { ...opcoes, headers: { 'User-Agent': UA, Accept: '*/*', ...opcoes.headers }, signal: AbortSignal.timeout(180e3) });
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
      return await ler(res);
    } catch (err) {
      if (tentativa >= tentativas) throw err;
      console.warn(`  tentativa ${tentativa} falhou (${String(err.cause?.message || err.message).slice(0, 120)}); repetindo...`);
      await pausa(3000 * tentativa ** 2);
    }
  }
}

// Variação acumulada em 12 meses (%) a partir de variações mensais (%) Map("AAAA-MM" → %).
function acumulado12(mensal, casas) {
  const serie = [];
  for (const [p] of ordenar(mensal)) {
    let f = 1, q = p, ok = true;
    for (let i = 0; i < 12; i++) {
      const v = mensal.get(q);
      if (v == null) { ok = false; break; }
      f *= 1 + v / 100;
      const a = Number(q.slice(0, 4)), m = Number(q.slice(5, 7));
      q = m === 1 ? `${a - 1}-12` : `${a}-${pad2(m - 1)}`;
    }
    if (ok && p >= INICIO) serie.push([p, arred((f - 1) * 100, casas)]);
  }
  return serie;
}

// Variação em 12 meses (%) de um índice de nível Map("AAAA-MM" → número).
function variacao12(indice, casas) {
  const serie = [];
  for (const [p, v] of ordenar(indice)) {
    const base = indice.get(`${Number(p.slice(0, 4)) - 1}${p.slice(4)}`);
    if (base && p >= INICIO) serie.push([p, arred((v / base - 1) * 100, casas)]);
  }
  return serie;
}

// ---------------------------------------------------------------- Ipeadata
const IPEA = 'https://www.ipeadata.gov.br/api/odata4';
const IPEA_PAGINA = 'https://www.ipeadata.gov.br/Default.aspx';

// [{ data: "AAAA-MM-DD", valor }] em ordem, sem nulos.
async function ipeadata(codigo) {
  const json = await baixar(`${IPEA}/ValoresSerie(SERCODIGO='${codigo}')`, async (res) => JSON.parse(await res.text()), { tentativas: 6, headers: { Accept: 'application/json' } });
  const v = json?.value;
  if (!Array.isArray(v) || !v.length) throw new Error(`Ipeadata: série ${codigo} vazia ou resposta inesperada`);
  return v.filter((x) => typeof x.VALVALOR === 'number' && Number.isFinite(x.VALVALOR) && /^\d{4}-\d{2}-\d{2}/.test(x.VALDATA))
    .map((x) => ({ data: x.VALDATA.slice(0, 10), valor: x.VALVALOR }))
    .sort((a, b) => (a.data < b.data ? -1 : 1));
}
// Série mensal do Ipeadata → Map("AAAA-MM" → valor × fator).
const ipeaMensal = async (codigo, fator = 1) => new Map((await ipeadata(codigo)).map(({ data, valor }) => [data.slice(0, 7), valor * fator]));

// ---------------------------------------------------------------- FAO (FAOSTAT, Food Security)
const FAO_ZIP = 'https://bulks-faostat.fao.org/production/Food_Security_Data_E_All_Data_(Normalized).zip';
const FAO_PAGINA = 'https://www.fao.org/faostat/en/#data/FS';
const FAO_BRASIL = '21'; // Area Code do FAOSTAT (M49 076)
const FAO_ITENS = ['210041', '210401', '210091']; // subnutrição; insegurança grave; moderada ou grave (população total)

let faoCache = null;
// Map(itemCode → Map("AAAA-12" → valor)) do Brasil, só elemento "Value" (6121, %); período = último ano da janela
// de 3 anos. Valores "<N" (a FAO não publica número abaixo de 2,5% na subnutrição) viram N e são listados no log.
function dadosFAO() {
  faoCache ??= (async () => {
    const buf = await baixar(FAO_ZIP, async (res) => {
      const b = Buffer.from(await res.arrayBuffer());
      if (b.length < 4 || b.readUInt32LE(0) !== 0x04034b50) throw new Error('FAO: resposta não é ZIP');
      return b;
    });
    const zip = lerZip(buf);
    const nome = [...zip.keys()].find((k) => /All_Data_\(Normalized\)\.csv$/i.test(k));
    if (!nome) throw new Error('FAO: CSV não encontrado no ZIP');
    const linhas = zip.get(nome).toString('utf8').replace(/^﻿/, '').split(/\r?\n/);
    const cab = linhas[0].split(',').map((c) => c.replace(/"/g, '').trim());
    const col = (n) => { const i = cab.indexOf(n); if (i < 0) throw new Error(`FAO: coluna ${n} ausente`); return i; };
    const [cArea, cItem, cElem, cAno, cValor] = ['Area Code', 'Item Code', 'Element Code', 'Year', 'Value'].map(col);
    const itens = new Map(), abaixo = new Map();
    for (const l of linhas.slice(1)) {
      if (!l.startsWith(`"${FAO_BRASIL}",`)) continue;
      const c = [...l.matchAll(/"([^"]*)"|(?<=,|^)([^,"]*)(?=,|$)/g)].map((m) => m[1] ?? m[2]);
      if (c[cArea] !== FAO_BRASIL || c[cElem] !== '6121' || !FAO_ITENS.includes(c[cItem])) continue;
      const janela = /^(\d{4})-(\d{4})$/.exec(c[cAno]);
      if (!janela) continue;
      const bruto = (c[cValor] || '').trim();
      const teto = /^<\s*(\d+(?:\.\d+)?)$/.exec(bruto);
      let v;
      if (teto) { v = Number(teto[1]); abaixo.set(c[cItem], [...(abaixo.get(c[cItem]) || []), `${c[cAno]} (<${teto[1]})`]); }
      else if (bruto === '') continue;
      else v = Number(bruto);
      if (!Number.isFinite(v)) throw new Error(`FAO: valor inválido "${bruto}" (${c[cItem]}, ${c[cAno]})`);
      if (!itens.has(c[cItem])) itens.set(c[cItem], new Map());
      itens.get(c[cItem]).set(`${janela[2]}-12`, v);
    }
    return { itens, abaixo };
  })();
  return faoCache;
}
async function serieFAO(item) {
  const { itens, abaixo } = await dadosFAO();
  const m = itens.get(item);
  if (!m) throw new Error(`FAO: item ${item} sem dados do Brasil`);
  if (abaixo.get(item)?.length) console.log(`  (FAO publica só "menos de N" em: ${abaixo.get(item).join(", ")}; gravado como N)`);
  return { serie: ordenar(m).filter(([p]) => p >= INICIO) };
}

const FAO_NOTA_FIES = 'Estimativa da FAO pela Escala de Experiência de Insegurança Alimentar (FIES), que a FAO aplica ' +
  'no mundo todo com a pesquisa Gallup World Poll. Atenção: no caso do Brasil, a FAO informa que a série é uma ' +
  '"estimativa oficial integrada aos dados da FAO" — ou seja, combina a pesquisa Gallup com os levantamentos ' +
  'nacionais (a Escala Brasileira de Insegurança Alimentar do IBGE, na PNAD e na POF); nos triênios mais ' +
  'recentes o valor é marcado como "oficial". Não é, portanto, totalmente independente do IBGE. Cada ponto é a média ' +
  'de três anos e aparece no último ano da janela (2023–2025 → 2025). A FAO revisa a série inteira a cada edição ' +
  'do relatório SOFI.';

// ---------------------------------------------------------------- DIEESE (Cesta Básica)
const DIEESE_CONSULTA = 'https://www.dieese.org.br/cesta/produto';
const DIEESE_PAGINA = 'https://www.dieese.org.br/cesta/';
const DIEESE_SP = 8;

// Tabela do banco de dados da cesta (produto 1 = total da cesta) para São Paulo: [["AAAA-MM", texto]].
async function cestaDIEESE(tipoDado) {
  const corpo = new URLSearchParams({ farinha: 'true', produtos: '1', tipoDado: String(tipoDado), cidades: String(DIEESE_SP),
    dataInicial: `01${INICIO.slice(0, 4)}`, dataFinal: `12${hoje.slice(0, 4)}` });
  const html = await baixar(DIEESE_CONSULTA, async (res) => {
    const t = await res.text();
    if (!/<table[^>]*id="dados"/i.test(t)) throw new Error('DIEESE: resposta sem a tabela de dados');
    return t;
  }, { method: 'POST', body: corpo.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' } });
  const linhas = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((m) => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => c[1].replace(/<[^>]*>/g, '').trim()));
  if (!/s.o paulo/i.test(linhas[0]?.[1] || '')) throw new Error(`DIEESE: cabeçalho inesperado ${JSON.stringify(linhas[0])}`);
  const serie = [];
  for (const [mes, valor] of linhas.slice(1)) {
    const m = /^(\d{2})-(\d{4})$/.exec(mes || '');
    if (!m || !valor || valor === '-') continue;
    serie.push([`${m[2]}-${m[1]}`, valor]);
  }
  return ordenar(new Map(serie));
}

// ---------------------------------------------------------------- entradas
const comum = { independente: true };

export function indicadoresIndependentes({ sgs }) {
  return [
    {
      ...comum,
      id: 'fao_subnutricao',
      titulo: 'Subnutrição — prevalência estimada pela FAO (média de 3 anos)',
      curto: 'Subnutrição (FAO)',
      tema: 'social',
      fonteTipo: 'internacional',
      melhor: 'menor',
      unidade: '%',
      casas: 1,
      periodicidade: 'anual',
      descricao: 'Percentual da população que não consegue, de forma habitual, consumir calorias suficientes para uma ' +
        'vida ativa e saudável (indicador da "fome" usado pela ONU e base do Mapa da Fome). Média de três anos.',
      fonte: 'FAO (ONU) — FAOSTAT, Suite of Food Security Indicators (item 210041)',
      fonteUrl: FAO_PAGINA,
      nota: 'Cálculo da própria FAO a partir da oferta de alimentos do país (balanços alimentares da FAO) e da ' +
        'distribuição do consumo entre a população (modelada com pesquisas domiciliares). Cada ponto é a média de três ' +
        'anos e aparece no último ano da janela (2023–2025 → 2025). Abaixo de 2,5% a FAO não publica o número, só ' +
        '"menos de 2,5%" (é o limite do Mapa da Fome); nesses anos o gráfico mostra 2,5, que deve ser lido como "2,5 ou ' +
        'menos". A FAO revisa a série inteira a cada edição do relatório SOFI.',
      async montar() { return serieFAO('210041'); },
    },
    {
      ...comum,
      id: 'fao_inseguranca_grave',
      titulo: 'Insegurança alimentar grave — estimativa da FAO (média de 3 anos)',
      curto: 'Fome grave (FAO)',
      tema: 'social',
      fonteTipo: 'internacional',
      melhor: 'menor',
      unidade: '%',
      casas: 1,
      periodicidade: 'anual',
      descricao: 'Percentual da população que, em algum momento do ano, ficou sem comida ou passou um dia ou mais sem ' +
        'comer por falta de dinheiro ou de outros recursos. Média de três anos.',
      fonte: 'FAO (ONU) — FAOSTAT, Suite of Food Security Indicators (item 210401)',
      fonteUrl: FAO_PAGINA,
      nota: FAO_NOTA_FIES + ' A série da FAO para o Brasil começa no triênio 2014–2016.',
      async montar() { return serieFAO('210401'); },
    },
    {
      ...comum,
      id: 'fao_inseguranca_moderada',
      titulo: 'Insegurança alimentar moderada ou grave — estimativa da FAO (média de 3 anos)',
      curto: 'Insegurança alimentar (FAO)',
      tema: 'social',
      fonteTipo: 'internacional',
      melhor: 'menor',
      unidade: '%',
      casas: 1,
      periodicidade: 'anual',
      descricao: 'Percentual da população que, por falta de dinheiro, teve de reduzir a quantidade ou a qualidade da ' +
        'comida ou não teve certeza de que conseguiria comer (inclui os casos graves). Média de três anos.',
      fonte: 'FAO (ONU) — FAOSTAT, Suite of Food Security Indicators (item 210091)',
      fonteUrl: FAO_PAGINA,
      nota: FAO_NOTA_FIES + ' A série da FAO para o Brasil começa no triênio 2014–2016.',
      async montar() { return serieFAO('210091'); },
    },
    {
      ...comum,
      id: 'cesta_dieese_sp',
      titulo: 'Custo da cesta básica em São Paulo (DIEESE)',
      curto: 'Cesta básica SP',
      tema: 'custo de vida',
      fonteTipo: 'entidade de classe',
      melhor: 'menor',
      unidade: 'R$',
      casas: 2,
      periodicidade: 'mensal',
      descricao: 'Quanto custam, no mês, os 13 alimentos da cesta básica (carne, leite, feijão, arroz, farinha, batata, ' +
        'tomate, pão, café, banana, açúcar, óleo e manteiga) na cidade de São Paulo, nas quantidades para um adulto. ' +
        'Valores da época, sem correção pela inflação.',
      fonte: 'DIEESE — Pesquisa Nacional da Cesta Básica de Alimentos (banco de dados)',
      fonteUrl: DIEESE_PAGINA,
      nota: 'O DIEESE (Departamento Intersindical de Estatística e Estudos Socioeconômicos) é mantido pelos ' +
        'sindicatos de trabalhadores e coleta os preços por conta própria, sem usar dados do IBGE. As quantidades da ' +
        'cesta seguem o Decreto-Lei 399/1938 (ração mínima para um adulto) e variam por região. Preços nominais (da ' +
        'época): para comparar com a renda, veja também as horas de trabalho necessárias para comprá-la.',
      async montar() {
        const serie = (await cestaDIEESE(5)).map(([p, t]) => {
          const v = Number(t.replace(/\./g, '').replace(',', '.'));
          if (!/^[\d.]+,\d{2}$/.test(t) || !Number.isFinite(v)) throw new Error(`DIEESE: valor inválido "${t}" em ${p}`);
          return [p, v];
        });
        return { serie };
      },
    },
    {
      ...comum,
      id: 'cesta_horas',
      titulo: 'Horas de trabalho com salário mínimo para comprar a cesta básica (São Paulo, DIEESE)',
      curto: 'Horas pela cesta',
      tema: 'custo de vida',
      fonteTipo: 'entidade de classe',
      melhor: 'menor',
      unidade: 'horas',
      casas: 1,
      periodicidade: 'mensal',
      descricao: 'Quantas horas um trabalhador que ganha o salário mínimo precisa trabalhar no mês para comprar a ' +
        'cesta básica na cidade de São Paulo. Quanto menos horas, maior o poder de compra do mínimo em comida.',
      fonte: 'DIEESE — Pesquisa Nacional da Cesta Básica de Alimentos (banco de dados, tempo de trabalho)',
      fonteUrl: DIEESE_PAGINA,
      nota: 'Cálculo do DIEESE: custo da cesta ÷ salário mínimo bruto × 220 horas (jornada mensal). O DIEESE publica ' +
        'o tempo de trabalho por cidade; a média das capitais não está no banco de dados (e o conjunto de capitais ' +
        'pesquisadas mudou: nove entraram em 2016), por isso aqui fica São Paulo, a série mais longa.',
      async montar() {
        const serie = (await cestaDIEESE(3)).map(([p, t]) => {
          const m = /^(\d+)h(\d{2})m$/.exec(t);
          if (!m) throw new Error(`DIEESE: tempo inválido "${t}" em ${p}`);
          return [p, arred(Number(m[1]) + Number(m[2]) / 60, 2)];
        });
        return { serie };
      },
    },
    {
      ...comum,
      id: 'ibovespa_usd',
      titulo: 'Ibovespa em dólares (fim do mês)',
      curto: 'Bolsa em US$',
      tema: 'economia',
      fonteTipo: 'mercado',
      melhor: 'maior',
      unidade: 'pontos (US$)',
      casas: 0,
      periodicidade: 'mensal',
      descricao: 'Principal índice da bolsa brasileira (Ibovespa) dividido pela cotação do dólar no último dia útil ' +
        'do mês: mostra quanto valem as ações brasileiras para um investidor estrangeiro.',
      fonte: 'B3 — Ibovespa (fechamento diário, via Ipeadata, série GM366_IBVSP366); Banco Central — dólar PTAX de fim de período (SGS 3696)',
      fonteUrl: 'https://www.b3.com.br/pt_br/market-data-e-indices/indices/indices-amplos/ibovespa.htm',
      nota: 'Cálculo deste painel: fechamento do Ibovespa no último pregão do mês ÷ dólar PTAX de venda do fim do mês. ' +
        'O índice é formado pelos preços negociados na bolsa (não é estatística oficial); a cotação PTAX é calculada ' +
        'pelo Banco Central a partir dos negócios no mercado de câmbio. Não desconta a inflação americana. No mês ' +
        'corrente, fica de fora até haver PTAX de fim de mês.',
      async montar() {
        const ibov = new Map();
        for (const { data, valor } of await ipeadata('GM366_IBVSP366')) ibov.set(data.slice(0, 7), valor); // último pregão do mês
        const ptax = new Map((await sgs(3696, '2002-01')).map(({ data, valor }) => [data.slice(0, 7), valor]));
        const serie = [];
        for (const [p, v] of ordenar(ibov)) if (p >= INICIO && ptax.get(p)) serie.push([p, Math.round(v / ptax.get(p))]);
        return { serie };
      },
    },
    {
      ...comum,
      id: 'confianca_consumidor',
      titulo: 'Confiança do consumidor (ICC, Fecomercio-SP)',
      curto: 'Confiança do consumidor',
      tema: 'economia',
      fonteTipo: 'entidade de classe',
      melhor: 'maior',
      unidade: 'pontos',
      casas: 1,
      periodicidade: 'mensal',
      descricao: 'Índice de Confiança do Consumidor: como os moradores da cidade de São Paulo avaliam a situação ' +
        'econômica atual e o que esperam para os próximos meses. Vai de 0 a 200; acima de 100 indica otimismo.',
      fonte: 'Fecomercio-SP — Índice de Confiança do Consumidor (via Banco Central, SGS 4393)',
      fonteUrl: 'https://www.fecomercio.com.br/pesquisas/indice/icc',
      nota: 'Pesquisa mensal da Federação do Comércio de Bens, Serviços e Turismo do Estado de São Paulo (entidade ' +
        'patronal), com entrevistas só na cidade de São Paulo; não cobre o país todo. O Índice de Confiança ' +
        'do Consumidor da FGV, de alcance nacional, não tem série aberta (só no FGV Dados, com cadastro).',
      async montar() {
        return { serie: (await sgs(4393)).map(({ data, valor }) => [data.slice(0, 7), arred(valor, 2)]) };
      },
    },
    {
      ...comum,
      id: 'confianca_industria',
      titulo: 'Confiança do empresário industrial (ICEI, CNI)',
      curto: 'Confiança da indústria',
      tema: 'economia',
      fonteTipo: 'entidade de classe',
      melhor: 'maior',
      unidade: 'pontos',
      casas: 1,
      periodicidade: 'mensal',
      descricao: 'Índice de Confiança do Empresário Industrial: como os industriais avaliam as condições atuais e as ' +
        'expectativas para a empresa e a economia. Vai de 0 a 100; acima de 50 indica confiança.',
      fonte: 'CNI — Índice de Confiança do Empresário Industrial (via Ipeadata, série CNI12_ICEIGER12)',
      fonteUrl: 'https://www.portaldaindustria.com.br/estatisticas/icei-indice-de-confianca-do-empresario-industrial/',
      nota: 'Pesquisa mensal da Confederação Nacional da Indústria (entidade patronal) com empresas industriais de todo ' +
        'o país. Série mensal desde 2010 (antes era trimestral). O Índice de Confiança da Indústria da FGV não tem ' +
        'série aberta (só no FGV Dados, com cadastro).',
      async montar() {
        return { serie: ordenar(await ipeaMensal('CNI12_ICEIGER12')).filter(([p]) => p >= INICIO).map(([p, v]) => [p, arred(v, 2)]) };
      },
    },
    {
      ...comum,
      id: 'endividamento_cnc',
      titulo: 'Famílias endividadas (Peic, CNC)',
      curto: 'Famílias endividadas',
      tema: 'crédito e dívidas',
      fonteTipo: 'entidade de classe',
      melhor: 'menor',
      unidade: '%',
      casas: 1,
      periodicidade: 'mensal',
      descricao: 'Percentual das famílias que dizem ter dívidas (cartão de crédito, cheque especial, carnê, ' +
        'empréstimos, financiamento de carro ou casa etc.), em dia ou em atraso.',
      fonte: 'CNC — Pesquisa de Endividamento e Inadimplência do Consumidor (Peic), via Ipeadata (série CNC12_PEICT12)',
      fonteUrl: 'https://portaldocomercio.org.br/tag/peic/',
      nota: 'Pesquisa mensal da Confederação Nacional do Comércio (entidade patronal), com entrevistas ' +
        'nas capitais. Ter dívida não é necessariamente ruim (inclui financiamentos e o uso do cartão); o ' +
        'sinal de aperto é o atraso (veja "Famílias com contas em atraso"). Série disponível desde 2013.',
      async montar() {
        return { serie: ordenar(await ipeaMensal('CNC12_PEICT12', 100)).filter(([p]) => p >= INICIO).map(([p, v]) => [p, arred(v, 2)]) };
      },
    },
    {
      ...comum,
      id: 'inadimplencia_cnc',
      titulo: 'Famílias com contas em atraso (Peic, CNC)',
      curto: 'Contas em atraso',
      tema: 'crédito e dívidas',
      fonteTipo: 'entidade de classe',
      melhor: 'menor',
      unidade: '%',
      casas: 1,
      periodicidade: 'mensal',
      descricao: 'Percentual das famílias com dívidas ou contas em atraso.',
      fonte: 'CNC — Pesquisa de Endividamento e Inadimplência do Consumidor (Peic), via Ipeadata (série CNC12_PEICA12)',
      fonteUrl: 'https://portaldocomercio.org.br/tag/peic/',
      nota: 'Pesquisa mensal da Confederação Nacional do Comércio (entidade patronal), com entrevistas ' +
        'nas capitais. É o que a família declara, não um cadastro de inadimplentes. Série disponível ' +
        'desde 2013.',
      async montar() {
        return { serie: ordenar(await ipeaMensal('CNC12_PEICA12', 100)).filter(([p]) => p >= INICIO).map(([p, v]) => [p, arred(v, 2)]) };
      },
    },
    {
      ...comum,
      id: 'imoveis_fipezap',
      titulo: 'Preço de venda de imóveis residenciais (FipeZap, 12 meses)',
      curto: 'Preço dos imóveis',
      tema: 'custo de vida',
      fonteTipo: 'universidade',
      melhor: null,
      unidade: '%',
      casas: 2,
      periodicidade: 'mensal',
      descricao: 'Variação em 12 meses do preço médio pedido nos anúncios de venda de apartamentos e casas, Índice ' +
        'FipeZap (média de dezenas de cidades).',
      fonte: 'Fipe e Zap — Índice FipeZap de preços de imóveis anunciados, venda, Brasil (via Ipeadata, série FIPE12_VENBR12)',
      fonteUrl: 'https://www.fipe.org.br/pt-br/indices/fipezap/',
      nota: 'Calculado pela Fipe (Fundação Instituto de Pesquisas Econômicas, ligada à USP) com os preços pedidos nos ' +
        'anúncios do grupo Zap (portais Zap e Viva Real) — preço de anúncio, não o de fechamento do negócio. O índice ' +
        'Brasil começou com poucas cidades e foi incorporando outras ao longo do tempo. Cálculo deste painel: variação ' +
        'do índice em relação ao mesmo mês do ano anterior.',
      async montar() {
        return { serie: variacao12(await ipeaMensal('FIPE12_VENBR12'), 2) };
      },
    },
    {
      ...comum,
      id: 'ipcfipe_12m',
      titulo: 'Inflação pelo IPC-Fipe (cidade de São Paulo, 12 meses)',
      curto: 'IPC-Fipe',
      tema: 'custo de vida',
      fonteTipo: 'universidade',
      melhor: 'menor',
      unidade: '%',
      casas: 2,
      periodicidade: 'mensal',
      descricao: 'Variação acumulada em 12 meses dos preços ao consumidor na cidade de São Paulo, medida pela Fipe ' +
        '(USP), com coleta própria de preços.',
      fonte: 'Fipe — Índice de Preços ao Consumidor (IPC-Fipe), variação mensal via Banco Central (SGS 193)',
      fonteUrl: 'https://www.fipe.org.br/pt-br/indices/ipc/',
      nota: 'A Fipe (Fundação Instituto de Pesquisas Econômicas, ligada à USP) coleta os preços por conta própria, ' +
        'só no município de São Paulo, para famílias com renda de 1 a 10 salários mínimos. Cálculo deste painel: ' +
        'variações mensais encadeadas nos 12 meses terminados em cada mês.',
      async montar() {
        return { serie: acumulado12(new Map((await sgs(193, '2002-01')).map(({ data, valor }) => [data.slice(0, 7), valor])), 2) };
      },
    },
    {
      ...comum,
      id: 'igpm_12m',
      titulo: 'IGP-M da FGV (12 meses)',
      curto: 'IGP-M',
      tema: 'custo de vida',
      fonteTipo: 'instituto privado',
      melhor: 'menor',
      unidade: '%',
      casas: 2,
      periodicidade: 'mensal',
      descricao: 'Variação acumulada em 12 meses do Índice Geral de Preços – Mercado, da FGV, o "índice do aluguel": ' +
        'usado para reajustar muitos contratos de aluguel e tarifas.',
      fonte: 'FGV IBRE — IGP-M, variação mensal via Banco Central (SGS 189)',
      fonteUrl: 'https://portalibre.fgv.br/igp',
      nota: 'A Fundação Getulio Vargas (instituição privada) coleta os preços por conta própria. O IGP-M não mede só o ' +
        'custo de vida: 60% do peso vai para preços no atacado (produtor), muito ligados ao dólar e às commodities; ' +
        '30% para o consumidor e 10% para a construção. Por isso oscila bem mais que o IPCA e pode ficar negativo. ' +
        'Cálculo deste painel: variações mensais encadeadas nos 12 meses terminados em cada mês.',
      async montar() {
        return { serie: acumulado12(new Map((await sgs(189, '2002-01')).map(({ data, valor }) => [data.slice(0, 7), valor])), 2) };
      },
    },
  ];
}

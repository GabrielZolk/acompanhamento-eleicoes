// Mais indicadores do "Raio-X do Brasil" (despesa primária, diesel, etanol, investimento direto, balança comercial,
// produção industrial, varejo, inadimplência e poupança real), chamados por tools/build-indicadores.mjs, que valida,
// grava e monta o índice (e mantém o arquivo anterior se um indicador falhar). Só fontes oficiais, sem chave de API:
//   - Banco Central, SGS: investimento direto no país, líquido, mensal (22885) e saldo da balança comercial de bens
//     do balanço de pagamentos, mensal (22707), ambos em US$ milhões (BPM6); inadimplência da carteira de crédito
//     com recursos livres das pessoas físicas (21112); rentabilidade da poupança no período, aniversário no dia 1
//     (25 até maio de 2012; 195, regra dos depósitos feitos desde 4/5/2012); PIB acumulado em 12 meses a preços
//     correntes, R$ milhões (4382), usado como denominador da despesa primária.
//   - Tesouro Nacional, Resultado do Tesouro Nacional (série histórica mensal, tabela 1.1): despesa total do
//     governo central, R$ milhões correntes (via `rtnMensal` de build-indicadores.mjs).
//   - ANP, Levantamento de Preços de Combustíveis (via `combustivel` de build-indicadores.mjs, mesma correção pelo
//     IPCA da gasolina): óleo diesel S-10, óleo diesel (comum) antes do S-10, e etanol hidratado.
//   - IBGE, SIDRA: Pesquisa Industrial Mensal – Produção Física, tabela 8888 (indústria geral, variação acumulada
//     em 12 meses) e Pesquisa Mensal de Comércio, tabela 8880 (volume de vendas do varejo, variação em 12 meses).
//
// Fora daqui, por falta de fonte oficial legível por máquina sem baixar gigabytes: tarifa média residencial de
// energia (a ANEEL só publica os microdados do SAMP, ~300 MB por ano) e número de servidores civis ativos do
// Executivo federal (o Painel Estatístico de Pessoal é um painel interativo, sem arquivo de série histórica).
//
// Uso: indicadoresMais(ctx) devolve entradas no formato de INDICADORES de build-indicadores.mjs (metadados do índice
// + `montar()`). `ctx` traz funções de lá: { indiceIPCA, sgs, combustivel, rtnMensal, sidra, serieSidra, periodoMovel }.
const INICIO = '2003-01';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesPorExtenso = (p) => `${MESES[Number(p.slice(5, 7)) - 1]} de ${p.slice(0, 4)}`;
const arred = (v, casas) => Math.round(v * 10 ** casas) / 10 ** casas;
const ordenar = (m) => [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1));
const pad2 = (n) => String(n).padStart(2, '0');

// Mês anterior a "AAAA-MM".
const mesAnterior = (p) => {
  const a = Number(p.slice(0, 4)), m = Number(p.slice(5, 7));
  return m === 1 ? `${a - 1}-12` : `${a}-${pad2(m - 1)}`;
};
// Os 12 meses terminados em `p` (do mais recente para trás).
const janela12 = (p) => {
  const r = [p];
  while (r.length < 12) r.push(mesAnterior(r[r.length - 1]));
  return r;
};

// Soma móvel de 12 meses de um Map("AAAA-MM" → valor), só onde os 12 meses existem, desde INICIO.
function soma12(mensal, escala, casas) {
  const serie = [];
  for (const [p] of ordenar(mensal)) {
    if (p < INICIO) continue;
    const jan = janela12(p);
    if (jan.some((q) => !mensal.has(q))) continue;
    serie.push([p, arred(jan.reduce((s, q) => s + mensal.get(q), 0) * escala, casas)]);
  }
  return serie;
}

// Série mensal do SGS → Map("AAAA-MM" → valor).
const mapaMensal = (pontos) => new Map(pontos.map(({ data, valor }) => [data.slice(0, 7), valor]));

// Diesel: o S-10 (menos enxofre, hoje a maior parte das vendas) só entra no levantamento da ANP em dezembro de
// 2012; antes disso, usa-se o óleo diesel comum (então o único pesquisado). A emenda é feita no primeiro mês com
// S-10 (no Brasil e em cada UF). As duas séries vêm do mesmo `combustivel` e são corrigidas até o mesmo mês.
function emendar(antes, depois) {
  if (!depois.length) return antes;
  const corte = depois[0][0];
  return [...antes.filter(([p]) => p < corte), ...depois];
}

// ---------------------------------------------------------------- entradas
export function indicadoresMais({ indiceIPCA, sgs, combustivel, rtnMensal, sidra, serieSidra, periodoMovel }) {
  return [
    {
      id: 'despesa_primaria',
      titulo: 'Despesa primária do governo federal (12 meses, % do PIB)',
      curto: 'Despesa primária',
      tema: 'impostos e contas públicas',
      unidade: '% do PIB',
      casas: 1,
      periodicidade: 'mensal',
      descricao: 'Tudo o que o governo central (Tesouro, Previdência e Banco Central) gastou nos últimos 12 meses sem ' +
        'contar os juros da dívida (aposentadorias, salários, programas sociais, custeio e investimentos), em ' +
        'proporção do PIB dos mesmos 12 meses.',
      fonte: 'Tesouro Nacional — Resultado do Tesouro Nacional (série histórica mensal, tabela 1.1, "Despesa total"); ' +
        'Banco Central (SGS 4382, PIB acumulado em 12 meses)',
      fonteUrl: 'https://www.tesourotransparente.gov.br/ckan/dataset/resultado-do-tesouro-nacional',
      nota: 'Cálculo deste painel: soma da despesa total dos últimos 12 meses (valores correntes) ÷ PIB nominal ' +
        'acumulado nos mesmos 12 meses estimado pelo Banco Central. Não inclui as transferências constitucionais a ' +
        'estados e municípios (FPE, FPM etc.), que o Tesouro deduz da receita. Critério de caixa; em dezembro, é a ' +
        'despesa do ano. Os gastos extraordinários da pandemia (2020) estão incluídos.',
      async montar() {
        const DESPESA = /^4\.\s*DESPESA TOTAL/i;
        const despesa = (await rtnMensal([DESPESA])).get(DESPESA);
        const pib = mapaMensal(await sgs(4382, '2002-01'));
        const soma = new Map(soma12(despesa, 1, 6));
        const serie = [];
        for (const [p, v] of soma) if (pib.get(p) > 0) serie.push([p, arred((v / pib.get(p)) * 100, 2)]);
        return { serie };
      },
    },
    {
      id: 'diesel',
      titulo: 'Preço do óleo diesel',
      curto: 'Diesel',
      tema: 'custo de vida',
      unidade: 'R$/litro',
      casas: 2,
      periodicidade: 'mensal',
      descricao: 'Preço médio do óleo diesel S-10 nos postos (revenda), média mensal, corrigido pelo IPCA.', // completada em montar()
      fonte: 'ANP — Levantamento de Preços de Combustíveis (série histórica mensal); IPCA mensal do IBGE (SGS 433)',
      fonteUrl: 'https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/precos-revenda-e-de-distribuicao-combustiveis/serie-historica-do-levantamento-de-precos',
      nota: 'Diesel S-10 a partir de dezembro de 2012, quando a ANP passou a pesquisá-lo; antes disso, óleo diesel ' +
        'comum (o único pesquisado). Na emenda (dezembro de 2012) o S-10 custava cerca de 3,5% a mais que o comum. Valores reais: o ' +
        'preço nominal de cada mês (guardado à parte) é multiplicado pela inflação (IPCA) acumulada até o mês mais ' +
        'recente da série, por isso o último ponto é igual ao preço nominal atual. Por estado, a média de cada UF ' +
        'corrigida pelo mesmo IPCA nacional. A ANP não fez pesquisa entre 18/8 e 17/10/2020.',
      porUF: true,
      async montar() {
        const comum = await combustivel('OLEO DIESEL');
        const s10 = await combustivel('OLEO DIESEL S10', '2012-01');
        if (comum.base !== s10.base) throw new Error(`diesel: meses-base diferentes (${comum.base} × ${s10.base})`);
        const porUF = {};
        for (const uf of Object.keys(comum.porUF)) porUF[uf] = emendar(comum.porUF[uf], s10.porUF[uf] || []);
        return {
          serie: emendar(comum.serie, s10.serie),
          nominal: emendar(comum.nominal, s10.nominal),
          porUF,
          meta: { descricao: `Preço médio do óleo diesel nos postos (revenda), média mensal, em reais de ${mesPorExtenso(s10.base)}, corrigido pelo IPCA (diesel S-10 desde dezembro de 2012; antes, diesel comum).` },
        };
      },
    },
    {
      id: 'etanol',
      titulo: 'Preço do etanol hidratado',
      curto: 'Etanol',
      tema: 'custo de vida',
      unidade: 'R$/litro',
      casas: 2,
      periodicidade: 'mensal',
      descricao: 'Preço médio do etanol hidratado nos postos (revenda), média mensal, corrigido pelo IPCA.', // completada em montar()
      fonte: 'ANP — Levantamento de Preços de Combustíveis (série histórica mensal); IPCA mensal do IBGE (SGS 433)',
      fonteUrl: 'https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/precos-revenda-e-de-distribuicao-combustiveis/serie-historica-do-levantamento-de-precos',
      nota: 'Valores reais: o preço nominal de cada mês (o que se pagava na bomba na época, guardado à parte) é ' +
        'multiplicado pela inflação (IPCA) acumulada até o mês mais recente da série, por isso o último ponto é igual ' +
        'ao preço nominal atual. Por estado, a média de cada UF corrigida pelo mesmo IPCA nacional. A ANP não fez ' +
        'pesquisa entre 18/8 e 17/10/2020.',
      porUF: true,
      async montar() {
        const r = await combustivel('ETANOL HIDRATADO');
        return {
          ...r,
          meta: { descricao: `Preço médio do etanol hidratado nos postos (revenda), média mensal, em reais de ${mesPorExtenso(r.base)}, corrigido pelo IPCA.` },
        };
      },
    },
    {
      id: 'ied',
      titulo: 'Investimento estrangeiro direto no país (12 meses)',
      curto: 'Investimento estrangeiro',
      tema: 'economia',
      unidade: 'US$ bi',
      casas: 1,
      periodicidade: 'mensal',
      descricao: 'Investimento direto no país (IDP), líquido, nos últimos 12 meses, em bilhões de dólares: dinheiro ' +
        'que estrangeiros colocam em empresas no Brasil (abrir ou comprar empresas, aumentar o capital, emprestar à ' +
        'filial), menos o que retiram.',
      fonte: 'Banco Central — Estatísticas do setor externo (SGS 22885)',
      fonteUrl: 'https://www.bcb.gov.br/estatisticas/estatisticassetorexterno',
      nota: 'Cálculo deste painel: soma dos 12 meses terminados em cada mês. Metodologia do Manual de Balanço de ' +
        'Pagamentos (BPM6), com participação no capital e operações intercompanhia. Dólares correntes, sem correção ' +
        'pela inflação americana. Os últimos meses podem ser revistos.',
      async montar() {
        return { serie: soma12(mapaMensal(await sgs(22885, '2002-01')), 1 / 1000, 2) }; // US$ milhões → bilhões
      },
    },
    {
      id: 'saldo_comercial',
      titulo: 'Saldo da balança comercial (12 meses)',
      curto: 'Balança comercial',
      tema: 'economia',
      unidade: 'US$ bi',
      casas: 1,
      periodicidade: 'mensal',
      descricao: 'Exportações menos importações de bens nos últimos 12 meses, em bilhões de dólares. Positivo = ' +
        'superávit (o país vendeu mais do que comprou).',
      fonte: 'Banco Central — Estatísticas do setor externo, balança comercial do balanço de pagamentos (SGS 22707)',
      fonteUrl: 'https://www.bcb.gov.br/estatisticas/estatisticassetorexterno',
      nota: 'Cálculo deste painel: soma dos 12 meses terminados em cada mês. Conceito do balanço de pagamentos (BPM6), ' +
        'que difere um pouco do saldo divulgado pela Secex/MDIC (data de registro e ajustes de cobertura). Só bens, ' +
        'sem serviços. Dólares correntes.',
      async montar() {
        return { serie: soma12(mapaMensal(await sgs(22707, '2002-01')), 1 / 1000, 2) }; // US$ milhões → bilhões
      },
    },
    {
      id: 'producao_industrial',
      titulo: 'Produção industrial (variação em 12 meses)',
      curto: 'Produção industrial',
      tema: 'economia',
      unidade: '%',
      casas: 1,
      periodicidade: 'mensal',
      descricao: 'Variação do volume produzido pela indústria (extrativa e de transformação) nos últimos 12 meses em ' +
        'relação aos 12 meses anteriores.',
      fonte: 'IBGE — Pesquisa Industrial Mensal – Produção Física (SIDRA, tabela 8888)',
      fonteUrl: 'https://sidra.ibge.gov.br/tabela/8888',
      nota: 'Indústria geral, variação acumulada em 12 meses publicada pelo IBGE (calculada sobre o índice sem ajuste ' +
        'sazonal, que não é necessário para comparar 12 meses com 12 meses). Série com base 2022 = 100; os últimos ' +
        'meses podem ser revistos.',
      async montar() {
        const linhas = await sidra('t/8888/n1/all/v/11604/p/all/c544/129314');
        return { serie: serieSidra(linhas, 'D3C', periodoMovel, 2).filter(([p]) => p >= INICIO) };
      },
    },
    {
      id: 'vendas_varejo',
      titulo: 'Vendas do varejo (volume, variação em 12 meses)',
      curto: 'Vendas do varejo',
      tema: 'economia',
      unidade: '%',
      casas: 1,
      periodicidade: 'mensal',
      descricao: 'Variação do volume de vendas do comércio varejista (descontada a inflação) nos últimos 12 meses em ' +
        'relação aos 12 meses anteriores.',
      fonte: 'IBGE — Pesquisa Mensal de Comércio (SIDRA, tabela 8880)',
      fonteUrl: 'https://sidra.ibge.gov.br/tabela/8880',
      nota: 'Varejo restrito: não inclui veículos, motos e peças, material de construção e atacado de alimentos ' +
        '(que formam o varejo ampliado). Variação acumulada em 12 meses publicada pelo IBGE; os últimos meses podem ' +
        'ser revistos.',
      async montar() {
        const linhas = await sidra('t/8880/n1/all/v/11711/p/all/c11046/56734');
        return { serie: serieSidra(linhas, 'D3C', periodoMovel, 2).filter(([p]) => p >= INICIO) };
      },
    },
    {
      id: 'inadimplencia_pf',
      titulo: 'Inadimplência das pessoas físicas',
      curto: 'Inadimplência',
      tema: 'crédito e dívidas',
      unidade: '%',
      casas: 1,
      periodicidade: 'mensal',
      descricao: 'Parte do crédito com recursos livres concedido a pessoas físicas (cartão, cheque especial, crédito ' +
        'pessoal, consignado, veículos etc.) com parcelas atrasadas há mais de 90 dias.',
      fonte: 'Banco Central — Estatísticas monetárias e de crédito (SGS 21112)',
      fonteUrl: 'https://dadosabertos.bcb.gov.br/dataset/21112-inadimplencia-da-carteira-de-credito-com-recursos-livres---pessoas-fisicas---total',
      nota: 'Percentual do saldo da carteira com atraso superior a 90 dias. Recursos livres: crédito com taxa ' +
        'negociada livremente (exclui crédito imobiliário e rural com recursos direcionados). A série atual começa ' +
        'em março de 2011.',
      async montar() {
        return { serie: (await sgs(21112, '2011-01')).map(({ data, valor }) => [data.slice(0, 7), arred(valor, 2)]) };
      },
    },
    {
      id: 'rendimento_poupanca_real',
      titulo: 'Rendimento real da poupança (12 meses)',
      curto: 'Poupança real',
      tema: 'crédito e dívidas',
      unidade: '%',
      casas: 1,
      periodicidade: 'mensal',
      descricao: 'Quanto a caderneta de poupança rendeu acima (ou abaixo, se negativo) da inflação nos últimos 12 ' +
        'meses. Negativo = o dinheiro na poupança perdeu poder de compra.',
      fonte: 'Banco Central — rentabilidade da poupança (SGS 25 e 195); IBGE — IPCA mensal (SGS 433)',
      fonteUrl: 'https://www.bcb.gov.br/estatisticas/remuneracaodepositospoupanca',
      nota: 'Cálculo deste painel: rendimento acumulado em 12 meses de um depósito com aniversário no dia 1 ' +
        '(rentabilidade de cada mês publicada pelo Banco Central) dividido pela inflação (IPCA) dos mesmos 12 meses. ' +
        'Até maio de 2012, regra antiga (0,5% ao mês + TR); depois, regra dos depósitos feitos desde 4/5/2012 ' +
        '(70% da Selic + TR quando a Selic está em 8,5% ao ano ou menos). Poupança é isenta de imposto de renda.',
      async montar() {
        const rend = new Map();
        for (const { data, valor } of await sgs(25, '2002-01')) if (data.endsWith('-01') && data < '2012-05-04') rend.set(data.slice(0, 7), valor);
        for (const { data, valor } of await sgs(195, '2012-01')) if (data.endsWith('-01')) rend.set(data.slice(0, 7), valor);
        const { indice, ultimo } = await indiceIPCA();
        const serie = [];
        for (const [p] of ordenar(rend)) {
          if (p < INICIO || p > ultimo) continue;
          const jan = janela12(p);
          const ant = jan[11] && mesAnterior(jan[11]);
          if (jan.some((q) => !rend.has(q)) || !indice.has(p) || !indice.has(ant)) continue;
          const poup = jan.reduce((f, q) => f * (1 + rend.get(q) / 100), 1);
          const ipca = indice.get(p) / indice.get(ant);
          serie.push([p, arred((poup / ipca - 1) * 100, 2)]);
        }
        return { serie };
      },
    },
  ];
}

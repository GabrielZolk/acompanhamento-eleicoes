// Indicadores extras do "Raio-X do Brasil" (juro real, dívida líquida, estatais federais e área queimada),
// chamados por tools/build-indicadores.mjs, que valida, grava e monta o índice. Só fontes oficiais, sem chave de API:
//   - Banco Central, SGS (via `sgs()` de build-indicadores.mjs): meta Selic (432), dívida líquida do setor público
//     consolidado em % do PIB (4513) e NFSP das empresas estatais federais, resultado primário, fluxo mensal em
//     R$ milhões (4646).
//   - Banco Central, Olinda (olinda.bcb.gov.br, serviço Expectativas): pesquisa Focus, expectativa de IPCA para os
//     12 meses seguintes (ExpectativasMercadoInflacao12Meses, série suavizada, mediana, todos os respondentes).
//   - INPE, Programa Queimadas (dataserver-coids.inpe.br): área queimada do produto AQ1km, CSV mensal por bioma.
//     Usa a coleção mais recente publicada (pasta colecaoN; a coleção 1 fica na pasta AQ1km).
//
// Uso: indicadoresExtra({ indiceIPCA, sgs }) devolve entradas no formato de INDICADORES de build-indicadores.mjs
// (metadados do índice + `montar()`); `indiceIPCA` é o índice de preços encadeado de lá (SGS 433) e `sgs` o leitor
// de séries do SGS de lá ([{ data: "AAAA-MM-DD", valor }]).
const UA = 'apuracao-2026-painel/1.0 (indicadores)';
const INICIO = '2003-01';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesPorExtenso = (p) => `${MESES[Number(p.slice(5, 7)) - 1]} de ${p.slice(0, 4)}`;
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const arred = (v, casas) => Math.round(v * 10 ** casas) / 10 ** casas;
const ordenar = (m) => [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1));
const pad2 = (n) => String(n).padStart(2, '0');

// Mesma política de build-indicadores.mjs: uma requisição por vez, 3 tentativas com espera crescente.
async function baixar(url, ler, headers = {}) {
  for (let tentativa = 1; ; tentativa++) {
    await pausa(300);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*', ...headers }, signal: AbortSignal.timeout(120e3) });
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
      return await ler(res);
    } catch (err) {
      if (tentativa >= 3) throw err;
      console.warn(`  tentativa ${tentativa} falhou (${err.message.slice(0, 120)}); repetindo...`);
      await pausa(2000 * tentativa ** 2);
    }
  }
}
const baixarTexto = (url) => baixar(url, async (res) => {
  const txt = await res.text();
  if (!txt.trim()) throw new Error(`resposta vazia em ${url}`);
  return txt;
});

// Mês anterior a "AAAA-MM".
const mesAnterior = (p) => {
  const a = Number(p.slice(0, 4)), m = Number(p.slice(5, 7));
  return m === 1 ? `${a - 1}-12` : `${a}-${pad2(m - 1)}`;
};

// ---------------------------------------------------------------- Banco Central (Focus, via Olinda)
const OLINDA_FOCUS = 'https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoInflacao12Meses';
const FOCUS_PAGINA = 'https://www.bcb.gov.br/publicacoes/focus';

// Mediana da expectativa de IPCA para os 12 meses seguintes, série suavizada, base de cálculo 0 (todas as
// respostas válidas dos últimos 30 dias): Map("AAAA-MM" → % do último dia do mês com dado).
async function expectativaIPCA12m() {
  const filtro = "Indicador eq 'IPCA' and Suavizada eq 'S' and baseCalculo eq 0";
  const url = `${OLINDA_FOCUS}?$format=json&$top=100000&$select=Data,Mediana&$orderby=Data%20asc&$filter=${encodeURIComponent(filtro)}`;
  const json = await baixar(url, async (res) => JSON.parse(await res.text()), { Accept: 'application/json' });
  const linhas = json?.value;
  if (!Array.isArray(linhas) || linhas.length < 1000) throw new Error(`Focus: resposta inesperada (${linhas?.length ?? 'sem'} linhas)`);
  const porMes = new Map();
  for (const { Data, Mediana } of [...linhas].sort((a, b) => (a.Data < b.Data ? -1 : 1))) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(Data) || typeof Mediana !== 'number' || !Number.isFinite(Mediana)) continue;
    porMes.set(Data.slice(0, 7), Mediana); // fica o último do mês
  }
  return porMes;
}

// ---------------------------------------------------------------- INPE (área queimada AQ1km)
const AQ_BASE = 'https://dataserver-coids.inpe.br/queimadas/queimadas/area_queimada';
const QUEIMADAS_PAGINA = 'https://terrabrasilis.dpi.inpe.br/queimadas/portal/';

// Pasta e CSV mais recentes: colecaoN (maior N) ou, na falta, AQ1km (coleção 1).
async function csvAreaQueimada() {
  const raiz = await baixarTexto(`${AQ_BASE}/`);
  const colecoes = [...raiz.matchAll(/href="(colecao(\d+))\/"/gi)].sort((a, b) => Number(b[2]) - Number(a[2])).map((m) => m[1]);
  for (const pasta of [...colecoes, 'AQ1km']) {
    const lista = await baixarTexto(`${AQ_BASE}/${pasta}/csv/`).catch(() => '');
    const arq = [...lista.matchAll(/href="(aq1km_biomas_v(\d+)\.csv)"/gi)].sort((a, b) => Number(b[2]) - Number(a[2]))[0]?.[1];
    if (arq) return { url: `${AQ_BASE}/${pasta}/csv/${arq}`, pasta };
  }
  throw new Error('INPE: CSV de área queimada (aq1km_biomas_vN.csv) não encontrado');
}

// Área queimada no Brasil por ano (soma dos meses da coluna "Total mensal"), só anos com os 12 meses:
// [["AAAA-12", km²]].
async function areaQueimadaAnual() {
  const { url, pasta } = await csvAreaQueimada();
  const txt = await baixarTexto(url);
  const linhas = txt.replace(/^﻿/, '').split(/\r?\n/).map((l) => l.split(',').map((c) => c.trim()));
  const cTotal = linhas[0]?.findIndex((c) => /^total mensal$/i.test(c));
  if (!(cTotal >= 0) || !/^ano$/i.test(linhas[0][0])) throw new Error(`INPE: cabeçalho inesperado em ${url}`);
  const soma = new Map(), meses = new Map();
  for (const l of linhas.slice(1)) {
    if (!/^\d{4}$/.test(l[0]) || !/^\d{1,2}$/.test(l[1])) continue; // pula as linhas "Total anual"
    const v = Number(l[cTotal]);
    if (l[cTotal] === '' || !Number.isFinite(v)) throw new Error(`INPE: valor inválido em ${l.join(',')}`);
    soma.set(l[0], (soma.get(l[0]) || 0) + v);
    meses.set(l[0], new Set(meses.get(l[0])).add(Number(l[1])));
  }
  const serie = ordenar([...soma].filter(([ano]) => meses.get(ano).size === 12 && ano >= INICIO.slice(0, 4)).map(([ano, v]) => [`${ano}-12`, Math.round(v)]));
  return { serie, url, pasta };
}

// ---------------------------------------------------------------- entradas
export function indicadoresExtra({ indiceIPCA, sgs }) {
  return [
    {
      id: 'juro_real',
      titulo: 'Juro real (Selic menos inflação esperada para 12 meses)',
      curto: 'Juro real',
      tema: 'crédito e dívidas',
      unidade: '%',
      casas: 1,
      periodicidade: 'mensal',
      descricao: 'Quanto a taxa básica de juros (meta Selic) rende acima da inflação que o mercado espera para os ' +
        'próximos 12 meses, em % ao ano. Juro real alto encarece o crédito e freia a economia; baixo estimula.',
      fonte: 'Banco Central — Copom (SGS 432) e pesquisa Focus (expectativa de IPCA para 12 meses)',
      fonteUrl: FOCUS_PAGINA,
      nota: 'Cálculo deste painel: (1 + meta Selic) ÷ (1 + mediana da expectativa de IPCA para os 12 meses seguintes) ' +
        '− 1. Meta Selic em vigor no último dia do mês e expectativa da última pesquisa Focus do mês (série suavizada). ' +
        'É o juro real "ex-ante" (pela inflação esperada, não pela que de fato ocorreu). No mês corrente, valores da ' +
        'data mais recente.',
      async montar() {
        const selic = new Map();
        for (const { data, valor } of await sgs(432)) selic.set(data.slice(0, 7), valor); // fica o último do mês
        const expectativa = await expectativaIPCA12m();
        const serie = [];
        for (const [p, s] of ordenar(selic)) {
          const e = expectativa.get(p);
          if (p < INICIO || e == null) continue;
          serie.push([p, arred(((1 + s / 100) / (1 + e / 100) - 1) * 100, 2)]);
        }
        return { serie };
      },
    },
    {
      id: 'divida_liquida',
      titulo: 'Dívida líquida do setor público (% do PIB)',
      curto: 'Dívida líquida',
      tema: 'impostos e contas públicas',
      unidade: '% do PIB',
      casas: 1,
      periodicidade: 'mensal',
      descricao: 'Tudo o que o setor público (União, INSS, estados, municípios, Banco Central e estatais) deve, menos ' +
        'o que tem a receber (como as reservas internacionais e os créditos com bancos públicos), em proporção do PIB.',
      fonte: 'Banco Central — Estatísticas fiscais (SGS 4513)',
      fonteUrl: 'https://dadosabertos.bcb.gov.br/dataset/4513-divida-liquida-do-setor-publico--pib---total---setor-publico-consolidado',
      nota: 'Setor público consolidado; exclui Petrobras, Eletrobras e os bancos públicos. Como as reservas ' +
        'internacionais entram como ativo, a dívida líquida cai quando o dólar sobe, ao contrário da dívida bruta.',
      async montar() {
        return { serie: (await sgs(4513)).map(({ data, valor }) => [data.slice(0, 7), arred(valor, 2)]).filter(([p]) => p >= INICIO) };
      },
    },
    {
      id: 'estatais',
      titulo: 'Resultado primário das estatais federais (12 meses)',
      curto: 'Estatais federais',
      tema: 'impostos e contas públicas',
      unidade: 'R$ bi',
      casas: 1,
      periodicidade: 'mensal',
      descricao: 'Receitas menos despesas das empresas estatais federais (sem os juros) nos últimos 12 meses, em ' +
        'bilhões de reais corrigidos pelo IPCA. Positivo = superávit; negativo = déficit.', // completada em montar()
      fonte: 'Banco Central — Estatísticas fiscais (SGS 4646); IPCA mensal do IBGE (SGS 433)',
      fonteUrl: 'https://dadosabertos.bcb.gov.br/dataset/4646-nfsp-sem-desvalorizacao-cambial---fluxo-mensal-corrente---resultado-primario---total---empresa',
      nota: 'O Banco Central publica as necessidades de financiamento do setor público (NFSP), em que déficit é ' +
        'positivo; aqui o sinal foi invertido para que superávit apareça como positivo. Cálculo deste painel: cada ' +
        'mês é corrigido pelo IPCA até o mês mais recente com IPCA divulgado e somam-se os últimos 12 meses. A ' +
        'estatística do Banco Central não inclui Petrobras e Eletrobras (esta, até ser privatizada em 2022) nem os ' +
        'bancos públicos (Banco do Brasil, Caixa, BNDES), em toda a série.',
      async montar() {
        const mensal = new Map((await sgs(4646, '2001-01')).map(({ data, valor }) => [data.slice(0, 7), valor]));
        const { indice, ultimo } = await indiceIPCA();
        const base = indice.get(ultimo);
        const nivel = (p) => indice.get(p > ultimo ? ultimo : p);
        const serie = [];
        for (const [p] of ordenar(mensal)) {
          if (p < INICIO) continue;
          let soma = 0, q = p, ok = true;
          for (let i = 0; i < 12; i++, q = mesAnterior(q)) {
            const v = mensal.get(q);
            if (v == null || !nivel(q)) { ok = false; break; }
            soma += (v * base) / nivel(q);
          }
          if (ok) serie.push([p, arred(-soma / 1000, 2) || 0]); // R$ milhões → R$ bilhões; NFSP → superávit positivo
        }
        return {
          serie,
          meta: {
            descricao: 'Receitas menos despesas das empresas estatais federais (sem os juros) nos últimos 12 meses, em ' +
              `bilhões de reais de ${mesPorExtenso(ultimo)} (corrigidos pelo IPCA). Positivo = superávit; negativo = déficit.`,
          },
        };
      },
    },
    {
      id: 'queimadas',
      titulo: 'Área queimada no Brasil (km² por ano)',
      curto: 'Área queimada',
      tema: 'meio ambiente',
      unidade: 'km²',
      casas: 0,
      periodicidade: 'anual',
      descricao: 'Área atingida por fogo no ano em todo o Brasil (todos os biomas), mapeada por satélite, em km².',
      fonte: 'INPE — Programa Queimadas, área queimada AQ1km',
      fonteUrl: QUEIMADAS_PAGINA,
      nota: 'Produto AQ1km do INPE (resolução de 1 km, a partir do sensor MODIS dos satélites da NASA), soma dos ' +
        'meses de janeiro a dezembro e dos seis biomas. Só anos completos. Inclui queimadas de vegetação nativa, de ' +
        'pastagens e de lavouras. O INPE reprocessa a série a cada nova coleção do produto; usa-se a mais recente.',
      async montar() {
        const { serie, url } = await areaQueimadaAnual();
        console.log(`  (${url.split('/').slice(-3).join('/')})`);
        return { serie };
      },
    },
  ];
}

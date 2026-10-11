// Gera public/data/indicadores/: séries históricas de indicadores oficiais do Brasil (desde jan/2003, quando
// há série comparável) para a seção "Raio-X do Brasil", com as faixas de cada mandato presidencial.
// Uso: node tools/build-indicadores.mjs   (ou npm run build:indicadores)
//
// Fontes (só órgãos oficiais, sem chave de API):
//   - Banco Central, SGS (api.bcb.gov.br/dados/serie/bcdata.sgs.{código}/dados): IPCA 12 meses (13522),
//     IPCA mensal (433), meta Selic (432, diária), dólar venda média mensal (3698), dívida bruta do governo
//     geral % PIB (13762), salário mínimo nominal (1619). Séries diárias só aceitam janelas de até 10 anos
//     (na prática o servidor recusa janelas de 10 anos exatos), então tudo é pedido em blocos de 5 anos.
//   - IBGE, SIDRA (apisidra.ibge.gov.br/values/...): PNAD Contínua, tabelas 6381 (desocupação, trimestre
//     móvel, Brasil), 4099 (desocupação trimestral por UF) e 6390 (rendimento médio real habitual, trimestre
//     móvel); Contas Nacionais Trimestrais, tabela 5932 (PIB, taxa acumulada em 4 trimestres); IPCA por grupo e
//     subitem, tabelas 655, 2938, 1419 e 7060 (alimentação no domicílio e itens do mercado.json).
//   - ANP, Levantamento de Preços de Combustíveis (gov.br/anp, séries históricas mensais em XLSX, Brasil e
//     estados): gasolina comum e GLP (botijão de 13 kg). O XLSX é lido sem dependências por tools/xlsx.mjs.
//
// Formato:
//   indice.json: { geradoEm, mandatos: [...], contexto: [...], indicadores: [{ id, titulo, ..., arquivo, porUF }] }
//   {id}.json:   { id, atualizadoEm: "AAAA-MM", serie: [["AAAA-MM", valor], ...], nominal?: [...], porUF?: { sp: [...], ... } }
//                (`nominal`: só nos combustíveis, preço da época sem correção; `serie` e `porUF` são valores reais)
//   mercado.json: { atualizadoEm, fonte, fonteUrl, itens: [{ id, nome, grupo, serie }] } — variação mensal do IPCA
//                de itens do dia a dia desde 2012; não entra em indice.json.
// Período trimestral = último mês do trimestre (2025T3 → "2025-09"; trimestre móvel jul–set → "2025-09").
//
// Saída determinística: nenhum carimbo de hora da execução. `atualizadoEm` é o período do último ponto da série
// e `geradoEm` é o maior `atualizadoEm` (AAAA-MM); sem dado novo, os arquivos saem idênticos e o git não vê diff.
// Se um indicador falhar, o arquivo anterior fica como está (com aviso); o script só sai com erro se todos falharem.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UFS } from '../public/js/ufs.js';
import { lerXlsx, dataExcel } from './xlsx.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outDir = path.join(root, 'public', 'data', 'indicadores');
const SGS = 'https://api.bcb.gov.br/dados/serie/bcdata.sgs';
const SIDRA = 'https://apisidra.ibge.gov.br/values';
const UA = { 'User-Agent': 'apuracao-2026-painel/1.0 (indicadores)', Accept: 'application/json' };
const INICIO = '2003-01';

const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const arred = (v, casas) => Math.round(v * 10 ** casas) / 10 ** casas;
const pad2 = (n) => String(n).padStart(2, '0');
const hoje = (() => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; })();
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesPorExtenso = (p) => `${MESES[Number(p.slice(5, 7)) - 1]} de ${p.slice(0, 4)}`;

// Uma requisição por vez, com pausa entre elas; 3 tentativas com espera crescente para falhas transitórias.
// `ler(res)` interpreta a resposta (e lança erro se ela não servir, o que também conta como tentativa falha).
async function baixar(url, ler, headers = UA) {
  for (let tentativa = 1; ; tentativa++) {
    await pausa(300);
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(90e3) });
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}: ${(await res.text()).slice(0, 160)}`);
      return await ler(res);
    } catch (err) {
      if (tentativa >= 3) throw err;
      console.warn(`  tentativa ${tentativa} falhou (${err.message.slice(0, 120)}); repetindo...`);
      await pausa(2000 * tentativa ** 2);
    }
  }
}

const baixarJSON = (url) => baixar(url, async (res) => {
  const json = JSON.parse(await res.text()); // o BCB às vezes devolve HTML de erro com status 200
  if (json && !Array.isArray(json) && json.error) throw new Error(`${json.error} (${url})`);
  return json;
});

// Arquivo binário (planilhas da ANP); confere a assinatura de ZIP para não aceitar uma página de erro em HTML.
const baixarArquivo = (url) => baixar(url, async (res) => {
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) throw new Error(`resposta não é XLSX em ${url}`);
  return buf;
}, { ...UA, Accept: '*/*' });

// ---------------------------------------------------------------- Banco Central (SGS)
// Devolve [{ data: "AAAA-MM-DD", valor }] em ordem, sem repetidos, só até hoje (a série 432 e a 1619 trazem
// datas futuras: a meta vigente até a próxima reunião do Copom e o mínimo já decretado até dezembro).
async function sgs(codigo, desde = INICIO) {
  const anoIni = Number(desde.slice(0, 4)), anoFim = Number(hoje.slice(0, 4));
  const pontos = new Map();
  for (let a = anoIni; a <= anoFim; a += 5) {
    const fim = Math.min(a + 4, anoFim);
    const url = `${SGS}.${codigo}/dados?formato=json&dataInicial=01/01/${a}&dataFinal=31/12/${fim}`;
    const dados = await baixarJSON(url);
    if (!Array.isArray(dados)) throw new Error(`resposta inesperada da série ${codigo}`);
    for (const { data, valor } of dados) {
      const [d, m, y] = String(data).split('/');
      const iso = `${y}-${m}-${d}`, v = Number(valor);
      if (iso > hoje || valor === '' || valor == null || !Number.isFinite(v)) continue;
      pontos.set(iso, v);
    }
  }
  return [...pontos].sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([data, valor]) => ({ data, valor }));
}

// Série mensal do SGS → [["AAAA-MM", valor]].
const mensal = (pontos, casas) => pontos.map(({ data, valor }) => [data.slice(0, 7), arred(valor, casas)]);

// ---------------------------------------------------------------- IBGE (SIDRA)
// Devolve as linhas de dados (sem o cabeçalho) da consulta.
async function sidra(caminho) {
  const linhas = await baixarJSON(`${SIDRA}/${caminho}`);
  if (!Array.isArray(linhas) || linhas.length < 2) throw new Error(`SIDRA sem dados: ${caminho}`);
  return linhas.slice(1);
}

// Código de período do SIDRA → "AAAA-MM". Trimestre móvel: "202509" já é o último mês (jul-ago-set 2025).
// Trimestre: "202503" = 3º trimestre de 2025 → último mês, "2025-09".
const periodoMovel = (c) => `${c.slice(0, 4)}-${c.slice(4, 6)}`;
const periodoTrimestre = (c) => `${c.slice(0, 4)}-${pad2(Number(c.slice(4, 6)) * 3)}`;

function serieSidra(linhas, campoPeriodo, conv, casas) {
  const m = new Map();
  for (const l of linhas) {
    const v = Number(l.V);
    if (l.V === '' || !Number.isFinite(v)) continue; // "...", "-", "X": sem dado
    m.set(conv(l[campoPeriodo]), arred(v, casas));
  }
  return [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

// IPCA por subitem: a série mensal está repartida em tabelas do SIDRA por período (mudanças de estrutura da POF).
// A classificação 315 usa os mesmos códigos nas quatro tabelas para os itens usados aqui.
const IPCA_TABELAS = [
  { tabela: 655, ate: '2006-06' },  // ago/1999 – jun/2006
  { tabela: 2938, ate: '2011-12' }, // jul/2006 – dez/2011
  { tabela: 1419, ate: '2019-12' }, // jan/2012 – dez/2019
  { tabela: 7060, ate: null },      // jan/2020 em diante
];

// Variação mensal (variável 63) de vários códigos da classificação 315 → Map(código → Map("AAAA-MM" → valor)).
async function ipcaSubitens(codigos, desde) {
  const out = new Map(codigos.map((c) => [String(c), new Map()]));
  for (const { tabela, ate } of IPCA_TABELAS) {
    if (ate && ate < desde) continue; // tabela toda antes do período pedido
    const linhas = await sidra(`t/${tabela}/n1/all/v/63/p/all/c315/${codigos.join(',')}`);
    for (const l of linhas) {
      const v = Number(l.V), p = periodoMovel(l.D3C);
      if (l.V === '' || !Number.isFinite(v) || p < desde) continue; // "...", "-": sem dado
      out.get(l.D4C)?.set(p, v);
    }
  }
  return out;
}

// Meses consecutivos de `ini` a `fim` (inclusive), "AAAA-MM".
function meses(ini, fim) {
  const r = [];
  for (let [a, m] = [Number(ini.slice(0, 4)), Number(ini.slice(5))]; `${a}-${pad2(m)}` <= fim; m === 12 ? (a++, m = 1) : m++) r.push(`${a}-${pad2(m)}`);
  return r;
}

// Índice de preços (IPCA, base arbitrária) encadeado a partir das variações mensais do SGS 433; memorizado
// porque é usado pelo salário mínimo e pelos combustíveis.
let ipcaIndice = null;
async function indiceIPCA() {
  if (!ipcaIndice) {
    ipcaIndice = (async () => {
      const ipca = mensal(await sgs(433), 2);
      const indice = new Map();
      let nivel = 1;
      for (const [p, v] of ipca) indice.set(p, (nivel *= 1 + v / 100));
      return { indice, ultimo: ipca[ipca.length - 1][0] };
    })();
    ipcaIndice.catch(() => { ipcaIndice = null; });
  }
  return ipcaIndice;
}

// ---------------------------------------------------------------- ANP (Levantamento de Preços de Combustíveis)
// Séries históricas mensais de preço médio de revenda, por estado e Brasil, em duas planilhas cada (até 2012 e
// desde 2013). As planilhas são baixadas e lidas uma vez só (gasolina e botijão saem dos mesmos arquivos).
const ANP_SHLP = 'https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/precos-revenda-e-de-distribuicao-combustiveis/shlp';
const ANP_ARQUIVOS = {
  brasil: [`${ANP_SHLP}/2001-2012/mensal-brasil-2001-a-2012.xlsx`, `${ANP_SHLP}/mensal/mensal-brasil-desde-jan2013.xlsx`],
  estados: [`${ANP_SHLP}/2001-2012/mensal-estados-2001-a-2012.xlsx`, `${ANP_SHLP}/mensal/mensal-estados-desde-jan2013.xlsx`],
};
const ANP_PAGINA = 'https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/precos-revenda-e-de-distribuicao-combustiveis/serie-historica-do-levantamento-de-precos';
const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const UF_POR_NOME = new Map(UFS.map((u) => [semAcento(u.nome), u.uf]));

// Linhas de uma planilha da ANP → [{ periodo, produto, estado?, preco }]. O cabeçalho é a linha que começa
// com "MÊS"; as colunas são achadas pelo nome (o texto acima do cabeçalho muda a cada versão do arquivo).
function linhasANP(buf, arquivo) {
  const [planilha] = lerXlsx(buf);
  if (!planilha) throw new Error(`planilha vazia: ${arquivo}`);
  const iCab = planilha.linhas.findIndex((l) => l && semAcento(l[0]) === 'MES');
  if (iCab < 0) throw new Error(`cabeçalho não encontrado: ${arquivo}`);
  const cab = planilha.linhas[iCab].map((c) => semAcento(c ?? ''));
  const col = (nome) => cab.indexOf(nome);
  const cMes = col('MES'), cProd = col('PRODUTO'), cEst = col('ESTADO'), cPreco = col('PRECO MEDIO REVENDA');
  if (cProd < 0 || cPreco < 0) throw new Error(`colunas esperadas ausentes: ${arquivo}`);
  const out = [];
  for (const l of planilha.linhas.slice(iCab + 1)) {
    if (!l || typeof l[cMes] !== 'number' || typeof l[cPreco] !== 'number') continue; // "-" = sem coleta
    out.push({ periodo: dataExcel(l[cMes]).slice(0, 7), produto: semAcento(l[cProd]), estado: cEst >= 0 ? semAcento(l[cEst]) : null, preco: l[cPreco] });
  }
  return out;
}

let anpDados = null;
function dadosANP() {
  if (!anpDados) {
    anpDados = (async () => {
      const r = {};
      for (const [tipo, urls] of Object.entries(ANP_ARQUIVOS)) {
        r[tipo] = [];
        for (const url of urls) r[tipo].push(...linhasANP(await baixarArquivo(url), url.split('/').pop()));
      }
      return r;
    })();
    anpDados.catch(() => { anpDados = null; });
  }
  return anpDados;
}

// Monta { serie (real), nominal, porUF (real), meta } de um produto da ANP. Valores reais: preço nominal
// multiplicado pelo IPCA acumulado entre o mês e o último mês da série de preços; se o IPCA desse(s) último(s)
// mês(es) ainda não saiu, eles não são corrigidos (o último ponto real é sempre igual ao nominal).
async function combustivel(produto, desde = INICIO) {
  const anp = await dadosANP();
  const { indice, ultimo: ultimoIPCA } = await indiceIPCA();
  const mapa = (linhas) => new Map(linhas.filter((l) => l.produto === produto && l.periodo >= desde).map((l) => [l.periodo, l.preco]));
  const nominalBR = [...mapa(anp.brasil)].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (!nominalBR.length) throw new Error(`ANP sem dados de ${produto}`);
  const base = nominalBR[nominalBR.length - 1][0];
  const nivel = (p) => indice.get(p > ultimoIPCA ? ultimoIPCA : p);
  const real = (pontos) => pontos.filter(([p]) => nivel(p)).map(([p, v]) => [p, arred((v * nivel(base)) / nivel(p), 2)]);
  const porUF = {};
  for (const u of UFS) {
    const s = [...mapa(anp.estados.filter((l) => UF_POR_NOME.get(l.estado) === u.uf))].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    if (!s.length) throw new Error(`ANP sem dados de ${produto} para ${u.uf}`);
    porUF[u.uf] = real(s);
  }
  return { serie: real(nominalBR), nominal: nominalBR.map(([p, v]) => [p, arred(v, 2)]), porUF, base };
}

// ---------------------------------------------------------------- indicadores
// Cada um tem os metadados do índice e `montar()`, que devolve { serie, porUF?, meta? } (meta sobrescreve
// campos do índice que dependem dos dados, como o mês de referência do salário mínimo real).
const INDICADORES = [
  {
    id: 'ipca',
    titulo: 'Inflação (IPCA em 12 meses)',
    curto: 'Inflação',
    unidade: '%',
    casas: 2,
    periodicidade: 'mensal',
    descricao: 'Variação acumulada dos preços ao consumidor (IPCA) nos últimos 12 meses.',
    fonte: 'IBGE — IPCA, via Banco Central (SGS 13522)',
    fonteUrl: 'https://www.ibge.gov.br/estatisticas/economicas/precos-e-custos/9256-indice-nacional-de-precos-ao-consumidor-amplo.html',
    nota: null,
    async montar() {
      return { serie: mensal(await sgs(13522), 2) };
    },
  },
  {
    id: 'alimentos',
    titulo: 'Inflação dos alimentos (alimentação no domicílio, 12 meses)',
    curto: 'Alimentos',
    unidade: '%',
    casas: 2,
    periodicidade: 'mensal',
    descricao: 'Variação acumulada em 12 meses dos preços da alimentação no domicílio (comida comprada em ' +
      'supermercados, feiras e padarias para consumo em casa), grupo do IPCA.',
    fonte: 'IBGE — IPCA (SIDRA, tabelas 655, 2938, 1419 e 7060)',
    fonteUrl: 'https://sidra.ibge.gov.br/tabela/7060',
    nota: 'Desde 2012, a variação em 12 meses publicada pelo IBGE; antes disso, calculada por este painel ' +
      'encadeando as variações mensais publicadas (o IBGE não divulga o acumulado em 12 meses dessas tabelas).',
    async montar() {
      // 12 meses calculados a partir das variações mensais (precisa de 11 meses antes do início).
      const mensais = (await ipcaSubitens([7171], '2002-02')).get('7171');
      const calc = new Map();
      const ps = [...mensais.keys()].sort();
      for (const p of meses(INICIO, ps[ps.length - 1])) {
        const janela = meses(`${Number(p.slice(0, 4)) - 1}${p.slice(4)}`, p).slice(1); // os 12 meses terminados em p
        if (janela.some((q) => !mensais.has(q))) continue;
        calc.set(p, arred((janela.reduce((f, q) => f * (1 + mensais.get(q) / 100), 1) - 1) * 100, 2));
      }
      // Acumulado em 12 meses oficial (variável 2265), existente nas tabelas desde 2012; prevalece sobre o cálculo.
      const oficial = new Map();
      for (const t of [1419, 7060]) {
        for (const [p, v] of serieSidra(await sidra(`t/${t}/n1/all/v/2265/p/all/c315/7171`), 'D3C', periodoMovel, 2)) oficial.set(p, v);
      }
      let difMax = 0;
      for (const [p, v] of oficial) if (calc.has(p)) difMax = Math.max(difMax, Math.abs(calc.get(p) - v));
      console.log(`  (12 meses calculado × oficial, 2012+: diferença máxima de ${difMax.toFixed(2)} p.p.)`);
      const serie = [...new Map([...calc, ...oficial])].filter(([p]) => p >= INICIO).sort((a, b) => (a[0] < b[0] ? -1 : 1));
      return { serie };
    },
  },
  {
    id: 'desemprego',
    titulo: 'Taxa de desemprego (desocupação)',
    curto: 'Desemprego',
    unidade: '%',
    casas: 1,
    periodicidade: 'mensal',
    descricao: 'Percentual da força de trabalho (14 anos ou mais) sem trabalho e procurando emprego. Brasil: trimestre móvel ' +
      '(o ponto de cada mês é o trimestre encerrado nele). Por estado: trimestres fechados.',
    fonte: 'IBGE — PNAD Contínua (SIDRA, tabelas 6381 e 4099)',
    fonteUrl: 'https://sidra.ibge.gov.br/tabela/6381',
    nota: 'A PNAD Contínua começa em 2012; a pesquisa anterior (PME, só seis regiões metropolitanas) tem outra ' +
      'metodologia e não é comparável, por isso não há dados antes de 2012.',
    porUF: true,
    async montar() {
      const serie = serieSidra(await sidra('t/6381/n1/all/v/4099/p/all'), 'D3C', periodoMovel, 1);
      const linhas = await sidra('t/4099/n3/all/v/4099/p/all');
      const porUF = {};
      for (const u of UFS) {
        porUF[u.uf] = serieSidra(linhas.filter((l) => l.D1C === u.ibge), 'D3C', periodoTrimestre, 1);
        if (!porUF[u.uf].length) throw new Error(`sem dados de desocupação para ${u.uf}`);
      }
      return { serie, porUF };
    },
  },
  {
    id: 'renda',
    titulo: 'Renda média do trabalho (real)',
    curto: 'Renda',
    unidade: 'R$',
    casas: 0,
    periodicidade: 'mensal',
    descricao: 'Rendimento médio mensal real habitualmente recebido de todos os trabalhos pelas pessoas ocupadas ' +
      '(14 anos ou mais), em trimestre móvel (o ponto de cada mês é o trimestre encerrado nele).',
    fonte: 'IBGE — PNAD Contínua (SIDRA, tabela 6390)',
    fonteUrl: 'https://sidra.ibge.gov.br/tabela/6390',
    nota: 'Valores reais como publicados pelo IBGE: toda a série é deflacionada para os preços do trimestre mais ' +
      'recente, e por isso é revista a cada divulgação. A PNAD Contínua começa em 2012.',
    async montar() {
      return { serie: serieSidra(await sidra('t/6390/n1/all/v/5933/p/all'), 'D3C', periodoMovel, 0) };
    },
  },
  {
    id: 'pib',
    titulo: 'Crescimento do PIB (acumulado em 4 trimestres)',
    curto: 'PIB',
    unidade: '%',
    casas: 1,
    periodicidade: 'trimestral',
    descricao: 'Variação real do PIB a preços de mercado nos últimos quatro trimestres em relação aos quatro ' +
      'trimestres anteriores. No 4º trimestre, equivale ao crescimento do ano.',
    fonte: 'IBGE — Contas Nacionais Trimestrais (SIDRA, tabela 5932)',
    fonteUrl: 'https://sidra.ibge.gov.br/tabela/5932',
    nota: 'Os últimos trimestres podem ser revistos pelo IBGE nas divulgações seguintes.',
    async montar() {
      const linhas = await sidra('t/5932/n1/all/v/6562/p/all/c11255/90707');
      return { serie: serieSidra(linhas, 'D3C', periodoTrimestre, 1).filter(([p]) => p >= INICIO) };
    },
  },
  {
    id: 'salario',
    titulo: 'Salário mínimo real',
    curto: 'Salário mínimo',
    unidade: 'R$',
    casas: 0,
    periodicidade: 'mensal',
    descricao: 'Salário mínimo nacional em vigor em cada mês, corrigido pelo IPCA.', // completada em montar()
    fonte: 'Banco Central (SGS 1619, salário mínimo; SGS 433, IPCA mensal do IBGE)',
    fonteUrl: 'https://www.ibge.gov.br/estatisticas/economicas/precos-e-custos/9256-indice-nacional-de-precos-ao-consumidor-amplo.html',
    nota: 'Cálculo deste painel: valor nominal multiplicado pela inflação (IPCA) acumulada entre o mês e o mês ' +
      'mais recente com IPCA divulgado.',
    async montar() {
      const nominal = new Map(mensal(await sgs(1619), 2));
      const { indice, ultimo } = await indiceIPCA();
      const base = indice.get(ultimo);
      const serie = [];
      for (const [p, v] of nominal) if (indice.has(p)) serie.push([p, arred((v * base) / indice.get(p), 2)]);
      return {
        serie,
        meta: { descricao: `Salário mínimo nacional em vigor em cada mês, corrigido pelo IPCA, em reais de ${mesPorExtenso(ultimo)}.` },
      };
    },
  },
  {
    id: 'gasolina',
    titulo: 'Preço da gasolina comum',
    curto: 'Gasolina',
    unidade: 'R$/litro',
    casas: 2,
    periodicidade: 'mensal',
    descricao: 'Preço médio da gasolina comum nos postos (revenda), média mensal, corrigido pelo IPCA.', // completada em montar()
    fonte: 'ANP — Levantamento de Preços de Combustíveis (série histórica mensal); IPCA mensal do IBGE (SGS 433)',
    fonteUrl: ANP_PAGINA,
    nota: 'Valores reais: o preço nominal de cada mês (o que se pagava na bomba na época, guardado à parte) é ' +
      'multiplicado pela inflação (IPCA) acumulada até o mês mais recente da série, por isso o último ponto é igual ' +
      'ao preço nominal atual. Por estado, a média de cada UF corrigida pelo mesmo IPCA nacional. A ANP não fez ' +
      'pesquisa entre 18/8 e 17/10/2020.',
    porUF: true,
    async montar() {
      const r = await combustivel('GASOLINA COMUM');
      return {
        ...r,
        meta: { descricao: `Preço médio da gasolina comum nos postos (revenda), média mensal, em reais de ${mesPorExtenso(r.base)}, corrigido pelo IPCA.` },
      };
    },
  },
  {
    id: 'botijao',
    titulo: 'Preço do botijão de gás (13 kg)',
    curto: 'Botijão',
    unidade: 'R$/13 kg',
    casas: 2,
    periodicidade: 'mensal',
    descricao: 'Preço médio do botijão de gás de cozinha (GLP, 13 kg) na revenda, média mensal, corrigido pelo IPCA.', // completada em montar()
    fonte: 'ANP — Levantamento de Preços de Combustíveis (série histórica mensal); IPCA mensal do IBGE (SGS 433)',
    fonteUrl: ANP_PAGINA,
    nota: 'Valores reais: o preço nominal de cada mês (o que se pagava na época, guardado à parte) é multiplicado ' +
      'pela inflação (IPCA) acumulada até o mês mais recente da série, por isso o último ponto é igual ao preço ' +
      'nominal atual. Por estado, a média de cada UF corrigida pelo mesmo IPCA nacional. A ANP não fez pesquisa ' +
      'entre 18/8 e 17/10/2020.',
    porUF: true,
    async montar() {
      const r = await combustivel('GLP');
      return {
        ...r,
        meta: { descricao: `Preço médio do botijão de gás de cozinha (GLP, 13 kg) na revenda, média mensal, em reais de ${mesPorExtenso(r.base)}, corrigido pelo IPCA.` },
      };
    },
  },
  {
    id: 'selic',
    titulo: 'Taxa básica de juros (meta Selic)',
    curto: 'Selic',
    unidade: '%',
    casas: 2,
    periodicidade: 'mensal',
    descricao: 'Meta da taxa Selic definida pelo Copom, em % ao ano: valor em vigor no último dia de cada mês ' +
      '(no mês corrente, o valor em vigor na data mais recente).',
    fonte: 'Banco Central — Copom (SGS 432)',
    fonteUrl: 'https://www.bcb.gov.br/controleinflacao/historicotaxasjuros',
    nota: null,
    async montar() {
      const fimDoMes = new Map();
      for (const { data, valor } of await sgs(432)) fimDoMes.set(data.slice(0, 7), arred(valor, 2)); // fica o último do mês
      return { serie: [...fimDoMes] };
    },
  },
  {
    id: 'dolar',
    titulo: 'Dólar comercial (média mensal)',
    curto: 'Dólar',
    unidade: 'R$/US$',
    casas: 2,
    periodicidade: 'mensal',
    descricao: 'Taxa de câmbio do dólar comercial (venda), média das cotações diárias de cada mês.',
    fonte: 'Banco Central (SGS 3698)',
    fonteUrl: 'https://www.bcb.gov.br/estabilidadefinanceira/historicocotacoes',
    nota: 'Valores nominais, sem correção pela inflação.',
    async montar() {
      return { serie: mensal(await sgs(3698), 4) };
    },
  },
  {
    id: 'divida',
    titulo: 'Dívida bruta do governo geral',
    curto: 'Dívida pública',
    unidade: '% do PIB',
    casas: 1,
    periodicidade: 'mensal',
    descricao: 'Dívida bruta do governo geral (governo federal, INSS, estados e municípios) em proporção do PIB ' +
      'acumulado em 12 meses, ao fim de cada mês.',
    fonte: 'Banco Central — Estatísticas fiscais (SGS 13762)',
    fonteUrl: 'https://dadosabertos.bcb.gov.br/dataset/13762-divida-bruta-do-governo-geral--pib---metodologia-utilizada-a-partir-de-2008',
    nota: 'A série com a metodologia atual (adotada em 2008) começa em dezembro de 2006; não há dado comparável antes disso.',
    async montar() {
      return { serie: mensal(await sgs(13762, '2006-01'), 2) };
    },
  },
];

const MANDATOS = [
  { id: 'lula1', nome: 'Lula (1º mandato)', curto: 'Lula 1', inicio: '2003-01-01', fim: '2006-12-31' },
  { id: 'lula2', nome: 'Lula (2º mandato)', curto: 'Lula 2', inicio: '2007-01-01', fim: '2010-12-31' },
  { id: 'dilma1', nome: 'Dilma (1º mandato)', curto: 'Dilma 1', inicio: '2011-01-01', fim: '2014-12-31' },
  { id: 'dilma2', nome: 'Dilma (2º mandato)', curto: 'Dilma 2', inicio: '2015-01-01', fim: '2016-05-11', nota: 'Afastada em 12/05/2016; impeachment em 31/08/2016' },
  { id: 'temer', nome: 'Temer', curto: 'Temer', inicio: '2016-05-12', fim: '2018-12-31', nota: 'Interino até 31/08/2016' },
  { id: 'bolsonaro', nome: 'Bolsonaro', curto: 'Bolsonaro', inicio: '2019-01-01', fim: '2022-12-31' },
  { id: 'lula3', nome: 'Lula (3º mandato)', curto: 'Lula 3', inicio: '2023-01-01', fim: null },
];

const CONTEXTO = [
  { inicio: '2008-10-01', fim: '2009-03-31', rotulo: 'Crise financeira global' },
  { inicio: '2014-04-01', fim: '2016-12-31', rotulo: 'Recessão (CODACE/FGV)' },
  { inicio: '2020-03-01', fim: '2021-12-31', rotulo: 'Pandemia de covid-19' },
];

// ---------------------------------------------------------------- mercado.json
// Variação mensal do IPCA (Brasil) de itens do dia a dia, desde jan/2012 (tabelas 1419 e 7060; os códigos da
// classificação 315 são os mesmos nas duas). Não entra no índice: é usado à parte pela página.
const MERCADO_INICIO = '2012-01';
const MERCADO_ITENS = [
  { id: 'geral', nome: 'Inflação geral (IPCA)', grupo: 'referencia', codigo: 7169 },
  { id: 'alimentos', nome: 'Alimentação no domicílio', grupo: 'referencia', codigo: 7171 },
  { id: 'arroz', nome: 'Arroz', grupo: 'mercado', codigo: 7173 },
  { id: 'feijao', nome: 'Feijão-carioca', grupo: 'mercado', codigo: 12222 },
  { id: 'cafe', nome: 'Café moído', grupo: 'mercado', codigo: 7392 },
  { id: 'carnes', nome: 'Carnes', grupo: 'mercado', codigo: 7283 },
  { id: 'frango', nome: 'Frango inteiro', grupo: 'mercado', codigo: 107617 },
  { id: 'ovo', nome: 'Ovo de galinha', grupo: 'mercado', codigo: 7355 },
  { id: 'leite', nome: 'Leite longa vida', grupo: 'mercado', codigo: 12393 },
  { id: 'pao', nome: 'Pão francês', grupo: 'mercado', codigo: 7375 },
  { id: 'oleo', nome: 'Óleo de soja', grupo: 'mercado', codigo: 7385 },
  { id: 'acucar', nome: 'Açúcar refinado', grupo: 'mercado', codigo: 7220 },
  { id: 'tomate', nome: 'Tomate', grupo: 'mercado', codigo: 7212 },
  { id: 'batata', nome: 'Batata-inglesa', grupo: 'mercado', codigo: 7202 },
  { id: 'banana', nome: 'Banana-prata', grupo: 'mercado', codigo: 7260 },
  { id: 'botijao', nome: 'Gás de botijão', grupo: 'casa', codigo: 7482 },
  { id: 'energia', nome: 'Energia elétrica residencial', grupo: 'casa', codigo: 7485 },
  { id: 'gasolina', nome: 'Gasolina', grupo: 'casa', codigo: 7657 },
];

async function montarMercado() {
  const dados = await ipcaSubitens(MERCADO_ITENS.map((i) => i.codigo), MERCADO_INICIO);
  const fim = [...dados.get('7169').keys()].sort().pop();
  const itens = MERCADO_ITENS.map(({ id, nome, grupo, codigo }) => {
    const m = dados.get(String(codigo));
    const faltam = meses(MERCADO_INICIO, fim).filter((p) => !m.has(p));
    if (faltam.length) console.warn(`  AVISO: ${id} (${codigo}) sem dado em ${faltam.join(', ')}`);
    const serie = [...m].filter(([p]) => p <= fim).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([p, v]) => [p, arred(v, 2)]);
    return { id, nome, grupo, serie };
  });
  return {
    atualizadoEm: fim,
    fonte: 'IBGE — IPCA (SIDRA, tabelas 1419 e 7060)',
    fonteUrl: 'https://sidra.ibge.gov.br/tabela/7060',
    itens,
  };
}

// ---------------------------------------------------------------- validação e gravação
function validar(id, serie) {
  if (!Array.isArray(serie) || serie.length < 8) throw new Error(`${id}: série vazia ou curta demais`);
  for (let i = 0; i < serie.length; i++) {
    const [p, v] = serie[i];
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p) || typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${id}: ponto inválido ${JSON.stringify(serie[i])}`);
    if (i && p <= serie[i - 1][0]) throw new Error(`${id}: períodos fora de ordem/repetidos em ${p}`);
  }
}

const lerJSON = (arq) => { try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return null; } };
const gravar = (arq, obj) => fs.writeFileSync(arq, JSON.stringify(obj) + '\n');

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const indiceAnterior = lerJSON(path.join(outDir, 'indice.json'));
  const entradas = [], datas = [];
  let ok = 0;

  for (const ind of INDICADORES) {
    const { montar, porUF = false, ...meta } = ind;
    const arquivo = `${ind.id}.json`, destino = path.join(outDir, arquivo);
    let extra = {}, atualizadoEm = null;
    console.log(`\n${ind.id}...`);
    try {
      const r = await montar();
      validar(ind.id, r.serie);
      if (porUF) for (const [uf, s] of Object.entries(r.porUF)) validar(`${ind.id}/${uf}`, s);
      if (r.nominal) validar(`${ind.id}/nominal`, r.nominal);
      atualizadoEm = r.serie[r.serie.length - 1][0];
      const saida = { id: ind.id, atualizadoEm, serie: r.serie };
      if (r.nominal) saida.nominal = r.nominal; // preços da época, sem correção (combustíveis)
      if (porUF) saida.porUF = r.porUF;
      gravar(destino, saida);
      extra = r.meta || {};
      ok++;
      const s = r.serie, n = s.length;
      console.log(`  ${n} pontos: ${s[0][0]} = ${s[0][1]} … ${s[n - 1][0]} = ${s[n - 1][1]}` +
        (porUF ? ` (+ ${Object.keys(r.porUF).length} UFs)` : '') + ` — ${(fs.statSync(destino).size / 1024).toFixed(1)} KB`);
    } catch (err) {
      console.warn(`  AVISO: ${ind.id} falhou (${err.message}); mantendo o arquivo anterior.`);
      const anterior = lerJSON(destino);
      if (!anterior) { console.warn(`  AVISO: não há arquivo anterior de ${ind.id}; fica fora do índice.`); continue; }
      atualizadoEm = anterior.atualizadoEm;
      // Campos que dependem dos dados (ex.: mês de referência do salário real) vêm do índice anterior.
      const ant = indiceAnterior?.indicadores?.find((x) => x.id === ind.id);
      if (ant) extra = { descricao: ant.descricao };
    }
    datas.push(atualizadoEm);
    const serieArq = lerJSON(destino)?.serie;
    entradas.push({ ...meta, ...extra, inicioSerie: serieArq?.[0]?.[0] ?? null, nota: meta.nota ?? null, arquivo, porUF });
  }

  // mercado.json (fora do índice): variação mensal de itens do supermercado e da casa.
  console.log('\nmercado...');
  const destinoMercado = path.join(outDir, 'mercado.json');
  try {
    const m = await montarMercado();
    for (const it of m.itens) validar(`mercado/${it.id}`, it.serie);
    gravar(destinoMercado, m);
    ok++;
    console.log(`  ${m.itens.length} itens, ${m.itens[0].serie[0][0]} … ${m.atualizadoEm} — ${(fs.statSync(destinoMercado).size / 1024).toFixed(1)} KB`);
  } catch (err) {
    console.warn(`  AVISO: mercado falhou (${err.message}); mantendo o arquivo anterior.`);
  }

  if (!ok) {
    console.error('\nERRO: todos os indicadores falharam; nada foi atualizado.');
    process.exit(1);
  }

  // Ordem das chaves igual à do contrato.
  const CHAVES = ['id', 'titulo', 'curto', 'unidade', 'casas', 'periodicidade', 'descricao', 'fonte', 'fonteUrl', 'inicioSerie', 'nota', 'arquivo', 'porUF'];
  const indicadores = entradas.map((e) => Object.fromEntries(CHAVES.map((k) => [k, e[k]])));
  const geradoEm = datas.filter(Boolean).sort().pop();
  gravar(path.join(outDir, 'indice.json'), { geradoEm, mandatos: MANDATOS, contexto: CONTEXTO, indicadores });
  console.log(`\nindice.json: ${indicadores.length} indicadores, geradoEm ${geradoEm} (${ok}/${INDICADORES.length + 1} arquivos atualizados, contando mercado.json).`);
}

main().catch((err) => { console.error(err); process.exit(1); });

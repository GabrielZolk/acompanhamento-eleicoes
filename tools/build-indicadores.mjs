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
//     móvel); Contas Nacionais Trimestrais, tabela 5932 (PIB, taxa acumulada em 4 trimestres).
//
// Formato:
//   indice.json: { geradoEm, mandatos: [...], contexto: [...], indicadores: [{ id, titulo, ..., arquivo, porUF }] }
//   {id}.json:   { id, atualizadoEm: "AAAA-MM", serie: [["AAAA-MM", valor], ...], porUF?: { sp: [...], ... } }
// Período trimestral = último mês do trimestre (2025T3 → "2025-09"; trimestre móvel jul–set → "2025-09").
//
// Saída determinística: nenhum carimbo de hora da execução. `atualizadoEm` é o período do último ponto da série
// e `geradoEm` é o maior `atualizadoEm` (AAAA-MM); sem dado novo, os arquivos saem idênticos e o git não vê diff.
// Se um indicador falhar, o arquivo anterior fica como está (com aviso); o script só sai com erro se todos falharem.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UFS } from '../public/js/ufs.js';

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
async function baixarJSON(url) {
  for (let tentativa = 1; ; tentativa++) {
    await pausa(300);
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(90e3) });
      const texto = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}: ${texto.slice(0, 160)}`);
      const json = JSON.parse(texto); // o BCB às vezes devolve HTML de erro com status 200
      if (json && !Array.isArray(json) && json.error) throw new Error(`${json.error} (${url})`);
      return json;
    } catch (err) {
      if (tentativa >= 3) throw err;
      console.warn(`  tentativa ${tentativa} falhou (${err.message.slice(0, 120)}); repetindo...`);
      await pausa(2000 * tentativa ** 2);
    }
  }
}

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
      const ipca = mensal(await sgs(433), 2);
      // Índice de preços encadeado (base arbitrária) a partir das variações mensais.
      const indice = new Map();
      let nivel = 1;
      for (const [p, v] of ipca) indice.set(p, (nivel *= 1 + v / 100));
      const ultimo = ipca[ipca.length - 1][0], base = indice.get(ultimo);
      const serie = [];
      for (const [p, v] of nominal) if (indice.has(p)) serie.push([p, arred((v * base) / indice.get(p), 2)]);
      return {
        serie,
        meta: { descricao: `Salário mínimo nacional em vigor em cada mês, corrigido pelo IPCA, em reais de ${mesPorExtenso(ultimo)}.` },
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
      atualizadoEm = r.serie[r.serie.length - 1][0];
      const saida = { id: ind.id, atualizadoEm, serie: r.serie };
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

  if (!ok) {
    console.error('\nERRO: todos os indicadores falharam; nada foi atualizado.');
    process.exit(1);
  }

  // Ordem das chaves igual à do contrato.
  const CHAVES = ['id', 'titulo', 'curto', 'unidade', 'casas', 'periodicidade', 'descricao', 'fonte', 'fonteUrl', 'inicioSerie', 'nota', 'arquivo', 'porUF'];
  const indicadores = entradas.map((e) => Object.fromEntries(CHAVES.map((k) => [k, e[k]])));
  const geradoEm = datas.filter(Boolean).sort().pop();
  gravar(path.join(outDir, 'indice.json'), { geradoEm, mandatos: MANDATOS, contexto: CONTEXTO, indicadores });
  console.log(`\nindice.json: ${indicadores.length} indicadores, geradoEm ${geradoEm} (${ok}/${INDICADORES.length} atualizados).`);
}

main().catch((err) => { console.error(err); process.exit(1); });

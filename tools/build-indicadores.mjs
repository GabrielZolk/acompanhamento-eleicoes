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
//     Também: juros do cartão de crédito rotativo (22022) e do crédito livre a pessoas físicas (20740),
//     endividamento (29037) e comprometimento de renda das famílias (29034), resultado primário (5793) e juros
//     nominais (5760) do setor público consolidado, % do PIB em 12 meses.
//   - ANP, Levantamento de Preços de Combustíveis (gov.br/anp, séries históricas mensais em XLSX, Brasil e
//     estados): gasolina comum e GLP (botijão de 13 kg). O XLSX é lido sem dependências por tools/xlsx.mjs.
//   - Tesouro Nacional (tesourotransparente.gov.br): Resultado do Tesouro Nacional, série histórica mensal (XLSX
//     achado pela API CKAN; arrecadação de impostos e contribuições federais) e Estimativa da Carga Tributária
//     Bruta do Governo Geral (XLSX anexo à edição mais recente da publicação anual).
//   - INPE, PRODES (TerraBrasilis): taxa anual de desmatamento na Amazônia Legal, soma dos nove estados (JSON
//     do painel; o nome do arquivo muda a cada ano e é lido do código do painel).
//   - Mais séries de renda, emprego, economia e social: reservas internacionais (SGS 3546); PNAD Contínua, tabelas
//     8513 (taxa de informalidade, trimestre móvel) e 6320 (empregados do setor privado com carteira); Contas
//     Nacionais Trimestrais, tabela 1846 (FBCF e PIB a preços correntes → taxa de investimento em 4 trimestres);
//     PNAD Contínua anual, tabela 7435 (Gini do rendimento domiciliar per capita); salário mínimo (SGS 1619) em
//     litros de gasolina e botijões ao preço nominal da ANP no mesmo mês.
//   - MDIC, Comex Stat (api-comexstat.mdic.gov.br): exportações de bens por mês, US$ FOB (soma de 12 meses).
//   - IBGE, Síntese de Indicadores Sociais (ftp.ibge.gov.br, ZIP de planilhas .ods lidas por tools/xlsx.mjs):
//     pobreza e extrema pobreza pelas linhas de US$ 6,85 e US$ 2,15 por dia (PPC 2017), Brasil, anual desde 2012.
//
// Formato:
//   indice.json: { geradoEm, mandatos: [...], contexto: [...], indicadores: [{ id, titulo, ..., tema, arquivo, porUF }] }
//                (`tema`: custo de vida, renda e emprego, crédito e dívidas, impostos e contas públicas, economia
//                meio ambiente ou social; `periodicidade` "anual": o período "AAAA-MM" é o ano de 12 meses terminado nele)
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
import { lerXlsx, lerZip, lerOds, dataExcel } from './xlsx.mjs';
import { indicadoresSociais } from './indicadores-sociais.mjs';
import { indicadoresExtra } from './indicadores-extra.mjs';
import { indicadoresSeguranca } from './indicadores-seguranca.mjs';
import { indicadoresMais } from './indicadores-mais.mjs';

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

// Página HTML (ou script) como texto. O gov.br responde 404 a quem pede só application/json.
const baixarTexto = (url) => baixar(url, async (res) => {
  const txt = await res.text();
  if (!txt.trim()) throw new Error(`resposta vazia em ${url}`);
  return txt;
}, { ...UA, Accept: 'text/html,application/xhtml+xml,*/*' });

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
      // Desde 2002 para que a arrecadação em 12 meses (soma de meses corrigidos) já exista em jan/2003.
      const ipca = mensal(await sgs(433, '2002-01'), 2);
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

// ---------------------------------------------------------------- Tesouro Nacional
// Resultado do Tesouro Nacional (RTN), série histórica mensal: o nome do XLSX muda a cada mês
// (seriehistoricajul26.xlsx...), então o endereço vem da API CKAN do Tesouro Transparente.
const TESOURO_CKAN = 'https://www.tesourotransparente.gov.br/ckan/api/3/action/package_show?id=resultado-do-tesouro-nacional';
const RTN_PAGINA = 'https://www.tesourotransparente.gov.br/ckan/dataset/resultado-do-tesouro-nacional';

// Linhas da tabela 1.1 (R$ milhões correntes, mensal) → Map(rótulo → Map("AAAA-MM" → valor)), só das linhas
// cujo rótulo casa com algum dos regex pedidos.
async function rtnMensal(rotulos) {
  const pacote = await baixarJSON(TESOURO_CKAN);
  const rec = pacote?.result?.resources?.find((r) => /xlsx/i.test(r.format) && /s[ée]rie hist[óo]rica.*mensal/i.test(r.name));
  if (!rec) throw new Error('RTN: planilha mensal não encontrada no CKAN do Tesouro');
  const planilhas = lerXlsx(await baixarArquivo(rec.url));
  const tab = planilhas.find((p) => p.nome.trim() === '1.1');
  if (!tab) throw new Error('RTN: aba 1.1 ausente');
  const iCab = tab.linhas.findIndex((l) => l && semAcento(l[0]) === 'DISCRIMINACAO');
  if (iCab < 0) throw new Error('RTN: cabeçalho "Discriminação" não encontrado');
  const periodos = tab.linhas[iCab].map((c) => (typeof c === 'number' ? dataExcel(c).slice(0, 7) : null));
  const out = new Map();
  for (const re of rotulos) {
    const linha = tab.linhas.slice(iCab + 1).find((l) => l && typeof l[0] === 'string' && re.test(l[0].trim()));
    if (!linha) throw new Error(`RTN: linha ${re} não encontrada`);
    const m = new Map();
    linha.forEach((v, i) => { if (i && periodos[i] && typeof v === 'number') m.set(periodos[i], v); });
    out.set(re, m);
  }
  return out;
}

// Estimativa da Carga Tributária Bruta do Governo Geral (publicação anual). A página da publicação lista as
// edições ("/AAAA/id"); a mais recente tem o anexo "Base CTB GG.xlsx", cuja Tabela 1 traz a carga em % do PIB.
const CTB_PAGINA = 'https://www.tesourotransparente.gov.br/publicacoes/carga-tributaria-do-governo-geral';

async function cargaTributaria() {
  const lista = await baixarTexto(CTB_PAGINA);
  const edicoes = [...lista.matchAll(/carga-tributaria-do-governo-geral\/(\d{4})\/(\d+)/g)]
    .map((m) => ({ ano: Number(m[1]), id: Number(m[2]) }))
    .sort((a, b) => b.ano - a.ano || b.id - a.id);
  if (!edicoes.length) throw new Error('carga tributária: nenhuma edição na página da publicação');
  const { ano, id } = edicoes[0];
  const pagina = await baixarTexto(`${CTB_PAGINA}/${ano}/${id}`);
  const anexos = [...pagina.matchAll(/<a\b[^>]*href="(https:\/\/thot-arquivos\.tesouro\.gov\.br\/publicacao-anexo\/\d+)"[^>]*title="([^"]*\.xlsx)"/gi)]
    .map((m) => ({ url: m[1], nome: m[2] }));
  const anexo = anexos.find((a) => /ctb|carga/i.test(a.nome)) || anexos[0];
  if (!anexo) throw new Error(`carga tributária: edição ${ano} sem anexo XLSX`);
  const tab = lerXlsx(await baixarArquivo(anexo.url)).find((p) => /^tabela 1\b/i.test(p.nome.trim()));
  if (!tab) throw new Error('carga tributária: aba "Tabela 1" ausente');
  const iCab = tab.linhas.findIndex((l) => l && /^ESFERA DE GOVERNO$/.test(semAcento(l[0] ?? '')) && typeof l[1] === 'number');
  if (iCab < 0) throw new Error('carga tributária: cabeçalho de anos não encontrado');
  const anos = tab.linhas[iCab];
  // A tabela tem duas linhas "Governo Geral": em R$ milhões e em fração do PIB (0,32 = 32%); fica a segunda.
  const linha = tab.linhas.slice(iCab + 1).find((l) => l && semAcento(l[0] ?? '') === 'GOVERNO GERAL' &&
    l.slice(1, anos.length).every((v) => v == null || (typeof v === 'number' && v > 0 && v < 1)));
  if (!linha) throw new Error('carga tributária: linha do governo geral em % do PIB não encontrada');
  const serie = [];
  for (let i = 1; i < anos.length; i++) {
    if (typeof anos[i] === 'number' && typeof linha[i] === 'number') serie.push([`${anos[i]}-12`, arred(linha[i] * 100, 2)]);
  }
  return { serie, edicao: ano };
}

// ---------------------------------------------------------------- INPE (PRODES / TerraBrasilis)
// O painel do PRODES lê as taxas de um JSON cujo nome tem o ano (rates2025.json); o nome atual é lido do script
// do painel, com tentativa direta dos últimos anos se isso falhar.
const PRODES_PAINEL = 'https://terrabrasilis.dpi.inpe.br/app/dashboard/deforestation/biomes/legal_amazon/rates';
const PRODES_ARQS = 'https://terrabrasilis.dpi.inpe.br/app/prodes/dashboard/deforestation/files/';

async function taxasPRODES() {
  const nomes = [];
  try {
    const html = await baixarTexto(PRODES_PAINEL);
    const app = html.match(/src="([^"]*\/app\.[0-9a-f]+\.js)"/)?.[1];
    if (app) {
      const js = await baixarTexto(new URL(app, PRODES_PAINEL).href);
      for (const m of js.matchAll(/rates(\d{4})\.json/g)) nomes.push(m[0]);
    }
  } catch (err) {
    console.warn(`  (painel do PRODES ilegível: ${err.message.slice(0, 100)}; tentando nomes por ano)`);
  }
  const ano = Number(hoje.slice(0, 4));
  for (let a = ano; a >= ano - 3; a--) nomes.push(`rates${a}.json`);
  for (const nome of [...new Set(nomes)]) {
    let json;
    try { json = await baixarJSON(PRODES_ARQS + nome); } catch { continue; }
    if (!Array.isArray(json?.periods)) continue;
    const serie = json.periods.map((p) => {
      const area = p.features.reduce((s, f) => s + f.areas.reduce((t, a) => t + a.area, 0), 0);
      return [`${p.endDate.year}-${pad2(p.endDate.month)}`, area, p.features.length];
    });
    const estranho = serie.find(([, , n]) => n !== 9);
    if (estranho) throw new Error(`PRODES: ${estranho[0]} com ${estranho[2]} estados (esperado 9)`);
    return serie.map(([p, v]) => [p, Math.round(v)]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }
  throw new Error('PRODES: arquivo de taxas não encontrado');
}

// ---------------------------------------------------------------- MDIC (Comex Stat)
// Exportações brasileiras de bens (US$ FOB) por mês, da API pública do Comex Stat. Uma consulta só traz todos os
// meses desde 2002 (o período precisa ir de janeiro a dezembro). A API limita a frequência de chamadas (HTTP 429,
// "tente novamente em 10 segundos"), por isso as novas tentativas aqui esperam mais que as do `baixar`.
const COMEX_API = 'https://api-comexstat.mdic.gov.br/general?language=pt';
const COMEX_PAGINA = 'https://comexstat.mdic.gov.br/pt/geral';

async function exportacoesMensais() {
  const corpo = JSON.stringify({
    flow: 'export', monthDetail: true, period: { from: '2002-01', to: `${hoje.slice(0, 4)}-12` },
    metrics: ['metricFOB'], filters: [], details: [],
  });
  for (let tentativa = 1; ; tentativa++) {
    await pausa(300);
    try {
      const res = await fetch(COMEX_API, {
        method: 'POST', body: corpo, signal: AbortSignal.timeout(120e3),
        headers: { ...UA, 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} no Comex Stat: ${(await res.text()).slice(0, 160)}`);
      const lista = JSON.parse(await res.text())?.data?.list;
      if (!Array.isArray(lista) || !lista.length) throw new Error('Comex Stat: resposta sem dados');
      const m = new Map();
      for (const { year, monthNumber, metricFOB } of lista) {
        const v = Number(metricFOB);
        if (/^\d{4}$/.test(year) && /^\d{2}$/.test(monthNumber) && Number.isFinite(v)) m.set(`${year}-${monthNumber}`, v);
      }
      return m;
    } catch (err) {
      if (tentativa >= 4) throw err;
      console.warn(`  tentativa ${tentativa} falhou (${err.message.slice(0, 120)}); repetindo...`);
      await pausa(15000 * tentativa);
    }
  }
}

// ---------------------------------------------------------------- IBGE (Síntese de Indicadores Sociais)
// As taxas de pobreza pelas linhas do Banco Mundial (US$ 2,15 e US$ 6,85 por dia, PPC 2017) não estão no SIDRA
// (lá, a tabela 5817 dos ODS usa outra linha): vêm das tabelas da SIS, publicadas no FTP do IBGE em ZIPs de
// planilhas .ods. A tabela "Pobr_Geo" (2.18 na edição de 2025) tem uma aba por ano, desde 2012, com a linha
// "Brasil". As edições são lidas da mais recente para trás; a primeira com as duas linhas vale.
const SIS_FTP = 'https://ftp.ibge.gov.br/Indicadores_Sociais/Sintese_de_Indicadores_Sociais/';
const SIS_PAGINA = 'https://www.ibge.gov.br/estatisticas/sociais/trabalho/9221-sintese-de-indicadores-sociais.html';

const linksFTP = async (url) => [...(await baixarTexto(url)).matchAll(/href="([^"?#/][^"?#]*)"/g)].map((m) => m[1]).filter((h) => !/^[a-z]+:/i.test(h));

let sisPobrezaDados = null;
function sisPobreza() {
  if (!sisPobrezaDados) {
    sisPobrezaDados = (async () => {
      const edicoes = (await linksFTP(SIS_FTP))
        .map((h) => h.match(/^Sintese_de_Indicadores_Sociais_(\d{4})\/$/)?.[1]).filter(Boolean).map(Number).sort((a, b) => b - a);
      if (!edicoes.length) throw new Error('SIS: nenhuma edição no FTP do IBGE');
      for (const ed of edicoes.slice(0, 3)) {
        try {
          const dirOds = `${SIS_FTP}Sintese_de_Indicadores_Sociais_${ed}/Tabelas/ods/`;
          const zipNome = (await linksFTP(dirOds)).find((h) => /Renda.*\.zip$/i.test(h));
          if (!zipNome) throw new Error('sem ZIP de distribuição de renda em .ods');
          const zip = lerZip(await baixarArquivo(dirOds + zipNome));
          const candidatos = [...zip.keys()].filter((n) => /Pobr_Geo\)?\.ods$/i.test(n)).sort();
          for (const nome of candidatos) {
            const extrema = new Map(), pobreza = new Map();
            for (const { nome: aba, linhas } of lerOds(zip.get(nome))) {
              if (!/^\d{4}$/.test(aba.trim())) continue; // abas "2024 (CV)" são coeficientes de variação
              const cab = linhas.find((l) => l.some((c) => typeof c === 'string' && /US\$\s*2,15\b/.test(c)));
              const brasil = linhas.find((l) => typeof l[0] === 'string' && l[0].trim() === 'Brasil');
              if (!cab || !brasil) continue;
              const col = (re) => cab.findIndex((c) => typeof c === 'string' && re.test(c) && /PPC 2017/.test(c));
              const c215 = col(/US\$\s*2,15\b/), c685 = col(/US\$\s*6,85\b/);
              if (c215 < 0 || c685 < 0 || typeof brasil[c215] !== 'number' || typeof brasil[c685] !== 'number') continue;
              extrema.set(`${aba.trim()}-12`, arred(brasil[c215], 2));
              pobreza.set(`${aba.trim()}-12`, arred(brasil[c685], 2));
            }
            if (extrema.size >= 8) {
              const ord = (m) => [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1));
              return { extrema: ord(extrema), pobreza: ord(pobreza), edicao: ed, tabela: nome };
            }
          }
          throw new Error('nenhuma tabela "Pobr_Geo" com as linhas de US$ 2,15 e US$ 6,85 (PPC 2017)');
        } catch (err) {
          console.warn(`  (SIS ${ed}: ${err.message.slice(0, 140)}; tentando a edição anterior)`);
        }
      }
      throw new Error('SIS: nenhuma edição recente com a tabela de pobreza esperada');
    })();
    sisPobrezaDados.catch(() => { sisPobrezaDados = null; });
  }
  return sisPobrezaDados;
}

// ---------------------------------------------------------------- salário mínimo em combustível
// Quantas unidades (litros de gasolina, botijões de GLP) o salário mínimo nominal do mês compra ao preço médio
// nominal de revenda do mesmo mês no Brasil (ANP). Os dois lados estão em reais da época, então não há deflação.
async function minimoEmProduto(produto, casas) {
  const anp = await dadosANP();
  const preco = new Map(anp.brasil.filter((l) => l.produto === produto && l.periodo >= INICIO).map((l) => [l.periodo, l.preco]));
  if (!preco.size) throw new Error(`ANP sem dados de ${produto}`);
  const serie = [];
  for (const [p, sm] of mensal(await sgs(1619), 2)) if (preco.has(p)) serie.push([p, arred(sm / preco.get(p), casas)]);
  return serie;
}

// ---------------------------------------------------------------- indicadores
// Cada um tem os metadados do índice e `montar()`, que devolve { serie, porUF?, meta? } (meta sobrescreve
// campos do índice que dependem dos dados, como o mês de referência do salário mínimo real).
const INDICADORES = [
  {
    id: 'ipca',
    titulo: 'Inflação (IPCA em 12 meses)',
    curto: 'Inflação',
    tema: 'custo de vida',
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
    tema: 'custo de vida',
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
    tema: 'renda e emprego',
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
    tema: 'renda e emprego',
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
    tema: 'economia',
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
    tema: 'renda e emprego',
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
    tema: 'custo de vida',
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
    tema: 'custo de vida',
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
    tema: 'crédito e dívidas',
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
    tema: 'economia',
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
    tema: 'impostos e contas públicas',
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
  {
    id: 'juros_cartao',
    titulo: 'Juros do cartão de crédito rotativo',
    curto: 'Juros do cartão',
    tema: 'crédito e dívidas',
    unidade: '%',
    casas: 1,
    periodicidade: 'mensal',
    descricao: 'Taxa média de juros do cartão de crédito rotativo para pessoas físicas, em % ao ano: o que se paga ' +
      'quando não se quita a fatura inteira.',
    fonte: 'Banco Central — Estatísticas monetárias e de crédito (SGS 22022)',
    fonteUrl: 'https://dadosabertos.bcb.gov.br/dataset/22022-taxa-media-de-juros-das-operacoes-de-credito-com-recursos-livres---pessoas-fisicas---cartao-d',
    nota: 'Média das operações de rotativo regular e não regular (pagamento mínimo e atraso). Desde abril de 2017 o ' +
      'rotativo só pode ser usado por um mês, e desde janeiro de 2024 os juros e encargos totais ficam limitados ao ' +
      'valor da dívida original (Lei 14.690/2023). A série atual começa em março de 2011.',
    async montar() {
      return { serie: mensal(await sgs(22022, '2011-01'), 2) };
    },
  },
  {
    id: 'juros_pf',
    titulo: 'Juros do crédito para pessoas físicas',
    curto: 'Juros (pessoa física)',
    tema: 'crédito e dívidas',
    unidade: '%',
    casas: 1,
    periodicidade: 'mensal',
    descricao: 'Taxa média de juros das operações de crédito com recursos livres para pessoas físicas (cartão, cheque ' +
      'especial, crédito pessoal, consignado, veículos etc.), em % ao ano.',
    fonte: 'Banco Central — Estatísticas monetárias e de crédito (SGS 20740)',
    fonteUrl: 'https://dadosabertos.bcb.gov.br/dataset/20740-taxa-media-de-juros-das-operacoes-de-credito-com-recursos-livres---pessoas-fisicas---total',
    nota: 'Recursos livres: crédito com taxa negociada livremente (exclui crédito imobiliário e rural com recursos ' +
      'direcionados). A série atual começa em março de 2011.',
    async montar() {
      return { serie: mensal(await sgs(20740, '2011-01'), 2) };
    },
  },
  {
    id: 'endividamento',
    titulo: 'Endividamento das famílias',
    curto: 'Endividamento',
    tema: 'crédito e dívidas',
    unidade: '%',
    casas: 1,
    periodicidade: 'mensal',
    descricao: 'Dívidas das famílias com bancos e demais instituições financeiras em proporção da renda das famílias ' +
      'acumulada nos últimos 12 meses.',
    fonte: 'Banco Central (SGS 29037)',
    fonteUrl: 'https://dadosabertos.bcb.gov.br/dataset/29037-endividamento-das-familias-com-o-sistema-financeiro-nacional-em-relacao-a-renda-acumulada-dos',
    nota: 'Inclui o crédito habitacional; sem ele (SGS 29038) o endividamento é cerca de 19 pontos menor. A renda é a ' +
      'renda nacional disponível bruta das famílias. Os últimos meses podem ser revistos.',
    async montar() {
      return { serie: mensal(await sgs(29037, '2005-01'), 2) };
    },
  },
  {
    id: 'comprometimento',
    titulo: 'Comprometimento da renda com dívidas',
    curto: 'Renda comprometida',
    tema: 'crédito e dívidas',
    unidade: '%',
    casas: 1,
    periodicidade: 'mensal',
    descricao: 'Parte da renda mensal das famílias usada para pagar juros e amortizações de dívidas com o sistema ' +
      'financeiro (com ajuste sazonal).',
    fonte: 'Banco Central (SGS 29034)',
    fonteUrl: 'https://dadosabertos.bcb.gov.br/dataset/29034-comprometimento-de-renda-das-familias-com-o-servico-da-divida-com-o-sistema-financeiro-nacion',
    nota: 'Inclui o crédito habitacional. A renda é a renda nacional disponível bruta das famílias. Os últimos meses ' +
      'podem ser revistos.',
    async montar() {
      return { serie: mensal(await sgs(29034, '2005-01'), 2) };
    },
  },
  {
    id: 'carga',
    titulo: 'Carga tributária',
    curto: 'Carga tributária',
    tema: 'impostos e contas públicas',
    unidade: '% do PIB',
    casas: 1,
    periodicidade: 'anual',
    descricao: 'Total de impostos, taxas e contribuições arrecadados por União, estados e municípios no ano, em ' +
      'proporção do PIB (carga tributária bruta do governo geral).',
    fonte: 'Tesouro Nacional — Estimativa da Carga Tributária Bruta do Governo Geral',
    fonteUrl: CTB_PAGINA,
    nota: 'Estimativa anual do Tesouro, revista a cada edição (a série toda segue a metodologia da edição mais recente); ' +
      'começa em 2010. A Receita Federal publica outra estimativa, com metodologia diferente, que costuma dar cerca de ' +
      '2 pontos a mais.',
    async montar() {
      const { serie, edicao } = await cargaTributaria();
      console.log(`  (edição ${edicao} da publicação)`);
      return { serie };
    },
  },
  {
    id: 'arrecadacao',
    titulo: 'Arrecadação federal (12 meses, corrigida pela inflação)',
    curto: 'Arrecadação federal',
    tema: 'impostos e contas públicas',
    unidade: 'R$ bi',
    casas: 1,
    periodicidade: 'mensal',
    descricao: 'Impostos e contribuições federais arrecadados nos últimos 12 meses, corrigidos pelo IPCA.', // completada em montar()
    fonte: 'Tesouro Nacional — Resultado do Tesouro Nacional, série histórica mensal; IPCA mensal do IBGE (SGS 433)',
    fonteUrl: RTN_PAGINA,
    nota: 'Receita administrada pela Receita Federal (impostos e contribuições, como IR, Cofins, IPI e IOF) mais a ' +
      'arrecadação líquida da Previdência (RGPS), pelo critério de caixa. Não inclui royalties, dividendos de ' +
      'estatais e outras receitas não tributárias. Cálculo deste painel: cada mês é corrigido pelo IPCA até o mês ' +
      'mais recente e somado aos 11 anteriores.',
    async montar() {
      const RFB = /^1\.1\s*-/, RGPS = /^1\.3\s*-/;
      const rtn = await rtnMensal([RFB, RGPS]);
      const { indice, ultimo: ultimoIPCA } = await indiceIPCA();
      const ps = [...rtn.get(RFB).keys()].filter((p) => rtn.get(RGPS).has(p)).sort();
      const base = ps[ps.length - 1];
      const nivel = (p) => indice.get(p > ultimoIPCA ? ultimoIPCA : p);
      const real = new Map(ps.filter(nivel).map((p) => [p, ((rtn.get(RFB).get(p) + rtn.get(RGPS).get(p)) * nivel(base)) / nivel(p)]));
      const serie = [];
      for (const p of meses(INICIO, base)) {
        const janela = meses(`${Number(p.slice(0, 4)) - 1}${p.slice(4)}`, p).slice(1);
        if (janela.some((q) => !real.has(q))) continue;
        serie.push([p, arred(janela.reduce((s, q) => s + real.get(q), 0) / 1000, 1)]); // R$ milhões → bilhões
      }
      return {
        serie,
        meta: { descricao: `Impostos e contribuições federais arrecadados nos últimos 12 meses, em reais de ${mesPorExtenso(base)} (corrigidos pelo IPCA).` },
      };
    },
  },
  {
    id: 'primario',
    titulo: 'Resultado primário do setor público (12 meses)',
    curto: 'Resultado primário',
    tema: 'impostos e contas públicas',
    unidade: '% do PIB',
    casas: 2,
    periodicidade: 'mensal',
    descricao: 'Receitas menos despesas do setor público (União, estados, municípios e estatais, sem os juros da ' +
      'dívida) nos últimos 12 meses, em % do PIB. Positivo = superávit (sobrou dinheiro); negativo = déficit.',
    fonte: 'Banco Central — Estatísticas fiscais (SGS 5793)',
    fonteUrl: 'https://dadosabertos.bcb.gov.br/dataset/5793-nfsp-sem-desvalorizacao-cambial--pib---fluxo-acumulado-em-12-meses---resultado-primario---tota',
    nota: 'O Banco Central publica as necessidades de financiamento do setor público (NFSP), em que déficit é ' +
      'positivo; aqui o sinal foi invertido para que superávit apareça como positivo. Setor público consolidado, ' +
      'exclui Petrobras e Eletrobras e não considera a desvalorização cambial.',
    async montar() {
      return { serie: (await sgs(5793, '2002-01')).map(({ data, valor }) => [data.slice(0, 7), arred(-valor, 2) || 0]).filter(([p]) => p >= INICIO) };
    },
  },
  {
    id: 'juros_divida',
    titulo: 'Gasto com juros da dívida pública (12 meses)',
    curto: 'Juros da dívida',
    tema: 'impostos e contas públicas',
    unidade: '% do PIB',
    casas: 2,
    periodicidade: 'mensal',
    descricao: 'Juros nominais apropriados pelo setor público consolidado (União, estados, municípios e estatais) nos ' +
      'últimos 12 meses, em % do PIB.',
    fonte: 'Banco Central — Estatísticas fiscais (SGS 5760)',
    fonteUrl: 'https://dadosabertos.bcb.gov.br/dataset/5760-nfsp-sem-desvalorizacao-cambial--pib---fluxo-acumulado-em-12-meses---juros-nominais---total',
    nota: 'Inclui o resultado das operações de swap cambial do Banco Central. Exclui Petrobras e Eletrobras.',
    async montar() {
      return { serie: mensal(await sgs(5760, '2002-01'), 2).filter(([p]) => p >= INICIO) };
    },
  },
  {
    id: 'desmatamento',
    titulo: 'Desmatamento na Amazônia Legal',
    curto: 'Desmatamento',
    tema: 'meio ambiente',
    unidade: 'km²',
    casas: 0,
    periodicidade: 'anual',
    descricao: 'Área de floresta desmatada (corte raso) em um ano na Amazônia Legal, medida por satélite. O ano ' +
      'PRODES vai de agosto a julho: o valor de 2024 é de agosto de 2023 a julho de 2024.',
    fonte: 'INPE — PRODES (TerraBrasilis)',
    fonteUrl: PRODES_PAINEL,
    nota: 'Taxa anual somada dos nove estados da Amazônia Legal. A taxa do ano mais recente pode ser a estimativa ' +
      'preliminar do INPE, substituída pela taxa consolidada no ano seguinte.',
    async montar() {
      return { serie: (await taxasPRODES()).filter(([p]) => p >= INICIO) };
    },
  },
  {
    id: 'sm_gasolina',
    titulo: 'Litros de gasolina que o salário mínimo compra',
    curto: 'Mínimo em gasolina',
    tema: 'renda e emprego',
    unidade: 'litros',
    casas: 0,
    periodicidade: 'mensal',
    descricao: 'Salário mínimo nacional do mês dividido pelo preço médio da gasolina comum nos postos no mesmo mês: ' +
      'quantos litros um salário mínimo inteiro compra.',
    fonte: 'Banco Central (SGS 1619, salário mínimo); ANP — Levantamento de Preços de Combustíveis (série histórica mensal)',
    fonteUrl: ANP_PAGINA,
    nota: 'Cálculo deste painel com valores nominais do mesmo mês (o salário e o preço da época), por isso não ' +
      'precisa de correção pela inflação. Preço médio de revenda no Brasil; a ANP não fez pesquisa entre 18/8 e ' +
      '17/10/2020, e o mês sem preço fica sem ponto.',
    async montar() {
      return { serie: await minimoEmProduto('GASOLINA COMUM', 1) };
    },
  },
  {
    id: 'sm_botijao',
    titulo: 'Botijões de gás que o salário mínimo compra',
    curto: 'Mínimo em botijões',
    tema: 'renda e emprego',
    unidade: 'botijões',
    casas: 1,
    periodicidade: 'mensal',
    descricao: 'Salário mínimo nacional do mês dividido pelo preço médio do botijão de gás de cozinha (GLP, 13 kg) ' +
      'no mesmo mês: quantos botijões um salário mínimo inteiro compra.',
    fonte: 'Banco Central (SGS 1619, salário mínimo); ANP — Levantamento de Preços de Combustíveis (série histórica mensal)',
    fonteUrl: ANP_PAGINA,
    nota: 'Cálculo deste painel com valores nominais do mesmo mês (o salário e o preço da época), por isso não ' +
      'precisa de correção pela inflação. Preço médio de revenda no Brasil; a ANP não fez pesquisa entre 18/8 e ' +
      '17/10/2020, e o mês sem preço fica sem ponto.',
    async montar() {
      return { serie: await minimoEmProduto('GLP', 2) };
    },
  },
  {
    id: 'informalidade',
    titulo: 'Taxa de informalidade',
    curto: 'Informalidade',
    tema: 'renda e emprego',
    unidade: '%',
    casas: 1,
    periodicidade: 'mensal',
    descricao: 'Percentual dos ocupados (14 anos ou mais) em trabalho informal: empregados e domésticos sem carteira, ' +
      'empregadores e trabalhadores por conta própria sem CNPJ e trabalhadores familiares auxiliares. Trimestre ' +
      'móvel (o ponto de cada mês é o trimestre encerrado nele).',
    fonte: 'IBGE — PNAD Contínua (SIDRA, tabela 8513)',
    fonteUrl: 'https://sidra.ibge.gov.br/tabela/8513',
    nota: 'O IBGE só passou a calcular a taxa de informalidade a partir do trimestre out–dez de 2015 (quando a PNAD ' +
      'Contínua começou a perguntar sobre CNPJ); não há série oficial comparável antes disso.',
    async montar() {
      return { serie: serieSidra(await sidra('t/8513/n1/all/v/12466/p/all'), 'D3C', periodoMovel, 1) };
    },
  },
  {
    id: 'carteira',
    titulo: 'Empregados com carteira assinada no setor privado',
    curto: 'Com carteira',
    tema: 'renda e emprego',
    unidade: 'milhões',
    casas: 1,
    periodicidade: 'mensal',
    descricao: 'Número de empregados do setor privado com carteira de trabalho assinada (exclusive trabalhadores ' +
      'domésticos), em milhões de pessoas, em trimestre móvel (o ponto de cada mês é o trimestre encerrado nele).',
    fonte: 'IBGE — PNAD Contínua (SIDRA, tabela 6320)',
    fonteUrl: 'https://sidra.ibge.gov.br/tabela/6320',
    nota: 'Estimativa da pesquisa domiciliar do IBGE (não é o registro administrativo do Caged/RAIS). A PNAD ' +
      'Contínua começa em 2012.',
    async montar() {
      const mil = serieSidra(await sidra('t/6320/n1/all/v/4090/p/all/c11913/31722'), 'D3C', periodoMovel, 0);
      return { serie: mil.map(([p, v]) => [p, arred(v / 1000, 3)]) }; // mil pessoas → milhões
    },
  },
  {
    id: 'investimento',
    titulo: 'Taxa de investimento (FBCF, % do PIB)',
    curto: 'Investimento',
    tema: 'economia',
    unidade: '% do PIB',
    casas: 1,
    periodicidade: 'trimestral',
    descricao: 'Formação bruta de capital fixo (máquinas, equipamentos, construções e outros investimentos em capital) ' +
      'em proporção do PIB, somados os últimos quatro trimestres, a preços correntes.',
    fonte: 'IBGE — Contas Nacionais Trimestrais (SIDRA, tabela 1846)',
    fonteUrl: 'https://sidra.ibge.gov.br/tabela/1846',
    nota: 'Cálculo deste painel: FBCF dos últimos 4 trimestres ÷ PIB dos mesmos 4 trimestres (valores correntes), ' +
      'o que tira a sazonalidade. A taxa do trimestre isolado publicada pelo IBGE (tabela 6727) oscila mais; no 4º ' +
      'trimestre, o valor daqui é a taxa do ano. Os últimos trimestres podem ser revistos.',
    async montar() {
      const linhas = await sidra('t/1846/n1/all/v/585/p/all/c11255/90707,93406');
      const pib = new Map(), fbcf = new Map();
      for (const l of linhas) {
        const v = Number(l.V);
        if (l.V === '' || !Number.isFinite(v)) continue;
        (l.D4C === '90707' ? pib : l.D4C === '93406' ? fbcf : new Map()).set(periodoTrimestre(l.D3C), v);
      }
      const ps = [...pib.keys()].filter((p) => fbcf.has(p)).sort();
      const serie = [];
      for (let i = 3; i < ps.length; i++) {
        const janela = ps.slice(i - 3, i + 1);
        const [a, m] = [Number(ps[i].slice(0, 4)), Number(ps[i].slice(5))];
        const esperado = `${m === 12 ? a : a - 1}-${pad2(m === 12 ? 3 : m + 3)}`; // 1º trimestre da janela
        if (janela[0] !== esperado) continue; // trimestre faltando
        const soma = (mapa) => janela.reduce((s, p) => s + mapa.get(p), 0);
        if (ps[i] >= INICIO) serie.push([ps[i], arred((soma(fbcf) / soma(pib)) * 100, 2)]);
      }
      return { serie };
    },
  },
  {
    id: 'reservas',
    titulo: 'Reservas internacionais',
    curto: 'Reservas',
    tema: 'economia',
    unidade: 'US$ bi',
    casas: 0,
    periodicidade: 'mensal',
    descricao: 'Reservas internacionais do Brasil (conceito liquidez) no fim de cada mês, em bilhões de dólares: ' +
      'moeda estrangeira, ouro e outros ativos em poder do Banco Central.',
    fonte: 'Banco Central (SGS 3546)',
    fonteUrl: 'https://www.bcb.gov.br/estatisticas/reservasinternacionais',
    nota: 'Valores em dólares correntes, sem correção pela inflação americana. O conceito liquidez inclui os ' +
      'recursos emprestados em operações de linha com recompra.',
    async montar() {
      return { serie: (await sgs(3546)).map(({ data, valor }) => [data.slice(0, 7), arred(valor / 1000, 1)]) }; // US$ milhões → bilhões
    },
  },
  {
    id: 'exportacoes',
    titulo: 'Exportações em 12 meses',
    curto: 'Exportações',
    tema: 'economia',
    unidade: 'US$ bi',
    casas: 0,
    periodicidade: 'mensal',
    descricao: 'Valor das exportações brasileiras de bens nos últimos 12 meses (US$ FOB), em bilhões de dólares.',
    fonte: 'Ministério do Desenvolvimento, Indústria, Comércio e Serviços — Comex Stat (Secex)',
    fonteUrl: COMEX_PAGINA,
    nota: 'Cálculo deste painel: soma dos 12 meses terminados em cada mês. Dólares correntes, sem correção pela ' +
      'inflação americana; só bens (não inclui serviços).',
    async montar() {
      const mensais = await exportacoesMensais();
      const ultimo = [...mensais.keys()].sort().pop();
      const serie = [];
      for (const p of meses(INICIO, ultimo)) {
        const janela = meses(`${Number(p.slice(0, 4)) - 1}${p.slice(4)}`, p).slice(1);
        if (janela.some((q) => !mensais.has(q))) continue;
        serie.push([p, arred(janela.reduce((s, q) => s + mensais.get(q), 0) / 1e9, 2)]); // US$ → bilhões
      }
      return { serie };
    },
  },
  {
    id: 'pobreza',
    titulo: 'Pobreza (linha de US$ 6,85/dia PPC)',
    curto: 'Pobreza',
    tema: 'social',
    unidade: '%',
    casas: 1,
    periodicidade: 'anual',
    descricao: 'Percentual da população com rendimento domiciliar per capita abaixo de US$ 6,85 por dia (paridade de ' +
      'poder de compra de 2017), a linha de pobreza do Banco Mundial para países de renda média-alta.',
    fonte: 'IBGE — Síntese de Indicadores Sociais (PNAD Contínua anual, tabela de pobreza por Grandes Regiões e UFs)',
    fonteUrl: SIS_PAGINA,
    nota: 'Rendimento de todas as fontes, inclusive programas sociais, na 1ª visita da PNAD Contínua. Toda a série é ' +
      'refeita a cada edição anual da Síntese (aqui, a mais recente com essa linha). Começa em 2012.',
    async montar() {
      const r = await sisPobreza();
      console.log(`  (SIS ${r.edicao}, ${r.tabela})`);
      return { serie: r.pobreza };
    },
  },
  {
    id: 'extrema_pobreza',
    titulo: 'Extrema pobreza (US$ 2,15/dia PPC)',
    curto: 'Extrema pobreza',
    tema: 'social',
    unidade: '%',
    casas: 1,
    periodicidade: 'anual',
    descricao: 'Percentual da população com rendimento domiciliar per capita abaixo de US$ 2,15 por dia (paridade de ' +
      'poder de compra de 2017), a linha internacional de extrema pobreza do Banco Mundial.',
    fonte: 'IBGE — Síntese de Indicadores Sociais (PNAD Contínua anual, tabela de pobreza por Grandes Regiões e UFs)',
    fonteUrl: SIS_PAGINA,
    nota: 'Rendimento de todas as fontes, inclusive programas sociais, na 1ª visita da PNAD Contínua. Toda a série é ' +
      'refeita a cada edição anual da Síntese (aqui, a mais recente com essa linha). Começa em 2012.',
    async montar() {
      const r = await sisPobreza();
      console.log(`  (SIS ${r.edicao}, ${r.tabela})`);
      return { serie: r.extrema };
    },
  },
  {
    id: 'gini',
    titulo: 'Índice de Gini do rendimento domiciliar per capita',
    curto: 'Desigualdade (Gini)',
    tema: 'social',
    unidade: 'índice',
    casas: 3,
    periodicidade: 'anual',
    descricao: 'Mede a desigualdade da renda por pessoa dos domicílios, de 0 (todos têm a mesma renda) a 1 (uma só ' +
      'pessoa tem toda a renda). Quanto menor, menos desigual.',
    fonte: 'IBGE — PNAD Contínua, rendimento de todas as fontes (SIDRA, tabela 7435)',
    fonteUrl: 'https://sidra.ibge.gov.br/tabela/7435',
    nota: 'Rendimento de todas as fontes (trabalho, aposentadorias, programas sociais etc.), a preços médios do ano. ' +
      'A PNAD Contínua começa em 2012.',
    async montar() {
      return { serie: serieSidra(await sidra('t/7435/n1/all/v/10681/p/all'), 'D3C', (c) => `${c}-12`, 3) };
    },
  },
];

// Indicadores sociais (Bolsa Família, Ideb, homicídios): fontes e cálculo em tools/indicadores-sociais.mjs.
INDICADORES.push(...indicadoresSociais({ indiceIPCA }));
// Juro real, dívida líquida, estatais federais e área queimada: fontes e cálculo em tools/indicadores-extra.mjs.
INDICADORES.push(...indicadoresExtra({ indiceIPCA, sgs }));
// Segurança pública (Sinesp e SINARM): fontes e cálculo em tools/indicadores-seguranca.mjs.
INDICADORES.push(...indicadoresSeguranca());
INDICADORES.push(...indicadoresMais({ indiceIPCA, sgs, combustivel, rtnMensal, sidra, serieSidra, periodoMovel })); // tools/indicadores-mais.mjs

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
  { id: 'fora', nome: 'Alimentação fora do domicílio', grupo: 'mercado', codigo: 7433 }, // subgrupo 1201
  { id: 'refeicao', nome: 'Refeição', grupo: 'mercado', codigo: 7434 },
  { id: 'lanche', nome: 'Lanche', grupo: 'mercado', codigo: 7435 },
  { id: 'aluguel', nome: 'Aluguel residencial', grupo: 'casa', codigo: 7448 },
  { id: 'condominio', nome: 'Condomínio', grupo: 'casa', codigo: 7449 },
  { id: 'agua', nome: 'Taxa de água e esgoto', grupo: 'casa', codigo: 7451 },
  { id: 'plano', nome: 'Plano de saúde', grupo: 'casa', codigo: 7696 },
  { id: 'remedios', nome: 'Produtos farmacêuticos', grupo: 'casa', codigo: 7662 }, // item 6101
  // "Acesso à internet" tem o mesmo código nas duas tabelas; a telefonia móvel muda de código (e de nome) em 2020.
  { id: 'internet', nome: 'Acesso à internet', grupo: 'casa', codigo: 107688 },
  { id: 'onibus', nome: 'Ônibus urbano', grupo: 'casa', codigo: 7628 },
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
  // Outros medidores de inflação, fora do IBGE, para conferir o IPCA (variação mensal, via Banco Central).
  const INDEPENDENTES = [
    { id: 'ipc_fipe', nome: 'IPC-Fipe (USP, cidade de São Paulo)', codigo: 193 },
    { id: 'ipc_fgv', nome: 'IPC-Br (FGV)', codigo: 191 },
  ];
  for (const { id, nome, codigo } of INDEPENDENTES) {
    try {
      const serie = mensal(await sgs(codigo, `${MERCADO_INICIO}-01`), 2).filter(([p]) => p <= fim);
      validar(id, serie);
      itens.push({ id, nome, grupo: 'independentes', serie });
    } catch (err) {
      console.warn(`  AVISO: ${id} (SGS ${codigo}) não entrou: ${err.message}`);
    }
  }
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
  const CHAVES = ['id', 'titulo', 'curto', 'tema', 'unidade', 'casas', 'periodicidade', 'descricao', 'fonte', 'fonteUrl', 'inicioSerie', 'nota', 'arquivo', 'porUF'];
  const indicadores = entradas.map((e) => Object.fromEntries(CHAVES.map((k) => [k, e[k]])));
  const geradoEm = datas.filter(Boolean).sort().pop();
  gravar(path.join(outDir, 'indice.json'), { geradoEm, mandatos: MANDATOS, contexto: CONTEXTO, indicadores });
  console.log(`\nindice.json: ${indicadores.length} indicadores, geradoEm ${geradoEm} (${ok}/${INDICADORES.length + 1} arquivos atualizados, contando mercado.json).`);
}

main().catch((err) => { console.error(err); process.exit(1); });

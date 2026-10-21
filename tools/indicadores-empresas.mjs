// Indicadores de saúde das empresas do "Raio-X do Brasil": pedidos de recuperação judicial e falências decretadas,
// do Indicador de Falências e Recuperações da Serasa Experian (bureau de crédito privado; levantamento mensal nos
// fóruns, varas de falência e diários oficiais de todo o país). Chamado por tools/build-indicadores.mjs, que valida,
// grava e monta o índice. Sem chave de API.
//
// A Serasa hoje publica só os dois últimos anos (planilha "falencias-e-recuperacoes-<mês><ano>.xlsx", achada na
// página de indicadores econômicos); o histórico completo (desde 1991) saía na planilha que ela publicou até abril de
// 2025, que não está mais no site dela e é lida de uma cópia fixa no Internet Archive (web.archive.org, captura de
// 22/07/2025 do endereço original da Serasa). Junção: meses cobertos pela planilha atual vêm dela (metodologia nova,
// aba "Total de CNPJs"); os anteriores vêm da planilha histórica (aba "Total de Ocorrências", cujos totais anuais
// ficam próximos da contagem por CNPJ e longe da contagem por processo). Em 2024, ano coberto pelas duas, a soma
// anual da contagem nova fica 3,5% abaixo da antiga nas recuperações requeridas e 0,8% abaixo nas falências
// decretadas — a quebra é pequena, mas existe, e está na nota (o log mostra a comparação a cada execução).
// Falências: usa-se as decretadas (falência de fato), e não as requeridas: o pedido de falência é muito usado como
// instrumento de cobrança e, na contagem nova, as requeridas ficaram 8,6% abaixo da antiga em 2024.
//
// Ficaram de fora (sem série aberta legível por máquina):
//   - Empresas abertas e fechadas (baixas de CNPJ) do Mapa de Empresas (gov.br/empresas-e-negocios): os números
//     estão só em boletins quadrimestrais em PDF e em painéis Qlik Sense do Serpro (dd.serpro.gov.br, consulta
//     interativa via WebSocket); as Estatísticas CNPJ da Redesim só dão o estoque atual por situação cadastral.
//     Os dados abertos do CNPJ da Receita Federal são o cadastro inteiro (dezenas de GB), sem série agregada.
//   - Indicador de falências e recuperações da Boa Vista SCPC (hoje Equifax): só em comunicados à imprensa.
//
// Uso: indicadoresEmpresas() devolve entradas no formato de INDICADORES de build-indicadores.mjs (metadados do índice
// + `montar()`), com `independente: true`, `fonteTipo` e `melhor`.
import { lerXlsx } from './xlsx.mjs';

const UA = 'apuracao-2026-painel/1.0 (indicadores)';
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const pad2 = (n) => String(n).padStart(2, '0');
const ordenar = (m) => [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1));

// Mesma política de build-indicadores.mjs: uma requisição por vez, várias tentativas com espera crescente.
async function baixar(url, ler, { tentativas = 4, ...opcoes } = {}) {
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

const baixarXlsx = (url) => baixar(url, async (res) => {
  const b = Buffer.from(await res.arrayBuffer());
  if (b.length < 4 || b.readUInt32LE(0) !== 0x04034b50) throw new Error(`resposta não é XLSX em ${url}`);
  return b;
});

// ---------------------------------------------------------------- Serasa Experian
const SERASA = 'https://www.serasaexperian.com.br';
const SERASA_PAGINA = `${SERASA}/conteudos/indicadores-economicos/`;
// Última planilha com a série desde 1991 (Serasa, dados até abril de 2025), em cópia fixa do Internet Archive.
const SERASA_HISTORICO_ORIGINAL = `${SERASA}/images-cms/wp-content/uploads/2021/01/Falencias-e-Recuperacoes-Abril-2025.xlsx`;
const SERASA_HISTORICO = `https://web.archive.org/web/20250722142317id_/${SERASA_HISTORICO_ORIGINAL}`;
// Primeiro período de 12 meses inteiro sob a Lei 11.101/2005 (em vigor desde 9/6/2005, criou a recuperação judicial):
// jun/2005–mai/2006.
const SERASA_INICIO = '2006-05';

// Número de série do Excel (dia 1º do mês) → "AAAA-MM".
function mesExcel(n) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}
const texto = (c) => String(c ?? '').trim().toLowerCase();

function aba(planilhas, re, onde) {
  const p = planilhas.find((x) => re.test(x.nome.trim()));
  if (!p) throw new Error(`Serasa: aba ${re} ausente em ${onde} (abas: ${planilhas.map((x) => x.nome).join(', ')})`);
  return p.linhas;
}

// Linhas de dados (mês em número de série do Excel) → Map("AAAA-MM" → { falDecretadas, rjRequeridas }).
// `col` diz em que coluna está cada medida; as linhas futuras ainda vazias ficam de fora.
function lerMeses(linhas, col, onde) {
  const m = new Map();
  for (const l of linhas) {
    if (typeof l?.[0] !== 'number' || l[0] < 30000 || l[0] > 80000) continue;
    const fd = l[col.falDecretadas], rj = l[col.rjRequeridas];
    if (fd == null && rj == null) continue;
    if (!Number.isInteger(fd) || !Number.isInteger(rj) || fd < 0 || rj < 0) throw new Error(`Serasa: valor inválido em ${onde}, ${mesExcel(l[0])}: ${JSON.stringify(l.slice(0, 20))}`);
    const p = mesExcel(l[0]);
    if (m.has(p)) throw new Error(`Serasa: mês repetido ${p} em ${onde}`);
    m.set(p, { falDecretadas: fd, rjRequeridas: rj });
  }
  if (!m.size) throw new Error(`Serasa: nenhum mês lido em ${onde}`);
  return m;
}

// Planilha atual (dois últimos anos), aba "Total de CNPJs": colunas Mês | Falências Requeridas | Decretadas |
// Recuperações Judiciais Requeridas | Deferidas | Concedidas | Recuperações Extrajudiciais Requeridas.
async function serasaAtual() {
  const html = await baixar(SERASA_PAGINA, async (res) => res.text(), { headers: { Accept: 'text/html' } });
  const nomes = [...new Set([...html.matchAll(/\/content\/dam\/[^"'\s]*?falencias-e-recuperacoes[^"'\s]*?\.xlsx/gi)].map((m) => m[0]))];
  if (nomes.length !== 1) throw new Error(`Serasa: esperava 1 planilha de falências na página, achei ${nomes.length} (${nomes.join(', ')})`);
  const url = `${SERASA}${nomes[0]}`;
  const linhas = aba(lerXlsx(await baixarXlsx(url)), /^total de cnpjs$/i, url);
  const i = linhas.findIndex((l) => texto(l?.[1]) === 'requeridas' && texto(l?.[2]) === 'decretadas' && texto(l?.[3]) === 'requeridas' && texto(l?.[4]) === 'deferidas');
  if (i < 0 || !/fal[eê]ncias/.test(texto(linhas[i - 1]?.[1])) || !/recupera[cç][oõ]es judiciais/.test(texto(linhas[i - 1]?.[3]))) {
    throw new Error(`Serasa: cabeçalho inesperado na planilha atual (${url})`);
  }
  return { url, meses: lerMeses(linhas.slice(i + 1), { falDecretadas: 2, rjRequeridas: 3 }, url) };
}

// Planilha histórica, aba "Total de Ocorrências": Falências Requeridas (MPE, média, grande, Total) | Decretadas (idem)
// | Recuperações Judiciais Requeridas (idem) | Deferidas (idem) | Concedidas | Concordatas.
async function serasaHistorico() {
  const linhas = aba(lerXlsx(await baixarXlsx(SERASA_HISTORICO)), /^total de ocorr[eê]ncias$/i, 'planilha histórica');
  const i = linhas.findIndex((l) => texto(l?.[4]) === 'total' && texto(l?.[8]) === 'total' && texto(l?.[12]) === 'total');
  const grupos = linhas[i - 1] || [], titulos = linhas[i - 2] || [];
  if (i < 0 || texto(grupos[5]) !== 'decretadas' || texto(grupos[9]) !== 'requeridas' || !/fal[eê]ncias/.test(texto(titulos[1])) ||
    !/recupera[cç][oõ]es judiciais/.test(texto(titulos[9]))) throw new Error('Serasa: cabeçalho inesperado na planilha histórica');
  return lerMeses(linhas.slice(i + 1), { falDecretadas: 8, rjRequeridas: 12 }, 'planilha histórica');
}

let serasaCache = null;
function dadosSerasa() {
  serasaCache ??= (async () => {
    const atual = await serasaAtual();
    const historico = await serasaHistorico();
    const corte = ordenar(atual.meses)[0][0]; // primeiro mês da planilha atual
    const meses = new Map([...historico].filter(([p]) => p < corte));
    for (const [p, v] of atual.meses) meses.set(p, v);
    // Sem buraco entre as duas planilhas (a histórica vai até abr/2025; quando a atual começar depois de mai/2025,
    // sobra um vão e o indicador falha, mantendo o arquivo anterior).
    const ps = ordenar(meses).map(([p]) => p);
    for (let k = 1; k < ps.length; k++) {
      const [a, m] = ps[k - 1].split('-').map(Number);
      const prox = m === 12 ? `${a + 1}-01` : `${a}-${pad2(m + 1)}`;
      if (ps[k] !== prox) throw new Error(`Serasa: falta o mês ${prox} entre a planilha histórica e a atual (${atual.url})`);
    }
    console.log(`  (Serasa: histórico até ${ordenar(historico).pop()[0]}, usado antes de ${corte}; planilha atual ${corte} … ${ps[ps.length - 1]}: ${atual.url})`);
    // Anos civis cobertos pelas duas planilhas: tamanho da quebra de metodologia, só no log (a nota é fixa).
    for (let a = Number(corte.slice(0, 4)); ; a++) {
      const ms = Array.from({ length: 12 }, (_, i) => `${a}-${pad2(i + 1)}`);
      if (!ms.every((p) => historico.has(p) && atual.meses.has(p))) break;
      const soma = (m, c) => ms.reduce((s, p) => s + m.get(p)[c], 0);
      console.log(`  (Serasa ${a}, contagem atual × antiga: recuperações requeridas ${soma(atual.meses, 'rjRequeridas')} × ` +
        `${soma(historico, 'rjRequeridas')}; falências decretadas ${soma(atual.meses, 'falDecretadas')} × ${soma(historico, 'falDecretadas')})`);
    }
    return meses;
  })();
  serasaCache.catch(() => { serasaCache = null; });
  return serasaCache;
}

// Soma móvel de 12 meses da medida `campo`, a partir de SERASA_INICIO.
async function serieSerasa(campo) {
  const lista = ordenar(await dadosSerasa());
  const serie = [];
  for (let k = 11; k < lista.length; k++) {
    const p = lista[k][0];
    if (p < SERASA_INICIO) continue;
    let soma = 0;
    for (let j = k - 11; j <= k; j++) soma += lista[j][1][campo];
    serie.push([p, soma]);
  }
  return { serie };
}

const NOTA_SERASA = 'A Serasa Experian (empresa privada de informações de crédito) levanta, mês a mês, os processos ' +
  'publicados pelos fóruns, varas de falência e diários oficiais de todo o país; a contagem é por empresa (CNPJ), ' +
  'então um grupo que pede recuperação com várias empresas conta várias vezes. Cálculo deste painel: soma dos 12 ' +
  'meses terminados em cada mês, desde o primeiro período inteiro sob a Lei de Falências e Recuperação de Empresas ' +
  '(Lei 11.101, em vigor desde junho de 2005, que criou a recuperação judicial no lugar da concordata). A Serasa hoje ' +
  'publica só os dois últimos anos, com contagem revisada; esses meses vêm da planilha atual, e os anteriores, da ' +
  'planilha com a série completa que ela publicou até abril de 2025 (lida de uma cópia guardada no Internet Archive, ' +
  'porque saiu do site). Por isso há uma pequena quebra na emenda: ';

// ---------------------------------------------------------------- entradas
const comum = { independente: true, fonteTipo: 'instituto privado', tema: 'economia', periodicidade: 'mensal', casas: 0, melhor: 'menor' };

export function indicadoresEmpresas() {
  return [
    {
      ...comum,
      id: 'recuperacoes_judiciais',
      titulo: 'Pedidos de recuperação judicial de empresas (12 meses, Serasa Experian)',
      curto: 'Recuperações judiciais',
      unidade: 'pedidos por ano',
      descricao: 'Quantas empresas pediram recuperação judicial nos últimos 12 meses — o pedido à Justiça para ' +
        'renegociar as dívidas com todos os credores de uma vez e evitar a falência. É um termômetro do aperto ' +
        'financeiro das empresas.',
      fonte: 'Serasa Experian — Indicador de Falências e Recuperações (recuperações judiciais requeridas, total de CNPJs)',
      fonteUrl: SERASA_PAGINA,
      nota: NOTA_SERASA + 'em 2024, ano coberto pelas duas planilhas, os pedidos somam 2.193 na contagem atual e 2.273 ' +
        'na antiga (−3,5%; planilhas de maio de 2026 e de abril de 2025). Os meses mais recentes estão sujeitos a revisão.',
      montar: () => serieSerasa('rjRequeridas'),
    },
    {
      ...comum,
      id: 'falencias',
      titulo: 'Falências decretadas (12 meses, Serasa Experian)',
      curto: 'Falências decretadas',
      unidade: 'falências por ano',
      descricao: 'Quantas empresas tiveram a falência decretada pela Justiça nos últimos 12 meses, isto é, ' +
        'encerraram as atividades por ordem judicial para que os bens sejam vendidos e os credores pagos. Conta as ' +
        'falências de fato (decretadas), não os pedidos de falência, muitas vezes usados só para cobrar uma dívida.',
      fonte: 'Serasa Experian — Indicador de Falências e Recuperações (falências decretadas, total de CNPJs)',
      fonteUrl: SERASA_PAGINA,
      nota: NOTA_SERASA + 'em 2024, ano coberto pelas duas planilhas, as falências decretadas somam 774 na contagem ' +
        'atual e 780 na antiga (−0,8%; planilhas de maio de 2026 e de abril de 2025). Os meses mais recentes estão ' +
        'sujeitos a revisão.',
      montar: () => serieSerasa('falDecretadas'),
    },
  ];
}

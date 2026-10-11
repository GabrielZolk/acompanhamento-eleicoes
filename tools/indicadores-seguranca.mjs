// Indicadores de segurança pública do "Raio-X do Brasil", chamados por tools/build-indicadores.mjs, que valida,
// grava e monta o índice. Só fontes oficiais, sem chave de API:
//   - Ministério da Justiça e Segurança Pública (MJSP), Sinesp VDE — "Dados Nacionais de Segurança Pública"
//     (gov.br/mj, página "Base de Dados e Notas Metodológicas dos Gestores Estaduais"): uma planilha XLSX por ano
//     (bancovde-AAAA.xlsx, desde 2015, ~25 MB cada, republicadas a cada atualização), uma aba com uma linha por
//     UF, município (ou "NÃO INFORMADO"), evento e mês. Colunas: uf, municipio, evento, data_referencia (data do
//     Excel, 1º dia do mês), agente, arma, faixa_etaria, feminino, masculino, nao_informado, total_vitima, total,
//     total_peso, abrangencia ("Estadual", "Polícia Federal", "Polícia Rodoviária Federal"). Os eventos de vítimas
//     usam total_vitima; os de ocorrências (roubo de veículo), total. Célula vazia = a UF não informou o mês.
//     A folha tem ~350 MB de XML descomprimido; é lida em blocos (ver linhasVDE), sem montar a matriz inteira.
//   - Polícia Federal, SINARM (servicos.dpf.gov.br/dadosabertos/SINARM_CSV/REGISTROS/): CSVs de registros de
//     armas de fogo de pessoas físicas por ano e mês de emissão (REGISTROS_com_categoria_*.csv; separador e aspas
//     variam entre arquivos).
// Ficam de fora os registros de CAC (colecionadores, atiradores e caçadores): o SIGMA do Exército não tem dados
// abertos, e a PF (responsável desde jul/2025) só publica o painel de BI; o CSV do SINARM-CAC está vazio.
//
// Uso: indicadoresSeguranca() devolve entradas no formato de INDICADORES de build-indicadores.mjs (metadados do
// índice + `montar()`).
import { lerZip, dataExcel } from './xlsx.mjs';

const UA = 'apuracao-2026-painel/1.0 (indicadores)';
const INICIO = '2003-01';
const pad2 = (n) => String(n).padStart(2, '0');
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const ordenar = (m) => [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1));

// Mesma política de build-indicadores.mjs: uma requisição por vez, 3 tentativas com espera crescente.
async function baixar(url, ler, opcoes = {}) {
  for (let tentativa = 1; ; tentativa++) {
    await pausa(300);
    try {
      const res = await fetch(url, { ...opcoes, headers: { 'User-Agent': UA, Accept: '*/*', ...opcoes.headers }, signal: AbortSignal.timeout(300e3) });
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
}, { headers: { Accept: 'text/html,application/xhtml+xml,*/*' } });
const baixarBuffer = (url) => baixar(url, async (res) => Buffer.from(await res.arrayBuffer()));

// Meses consecutivos de `ini` a `fim` (inclusive), "AAAA-MM".
function meses(ini, fim) {
  const r = [];
  for (let [a, m] = [Number(ini.slice(0, 4)), Number(ini.slice(5))]; `${a}-${pad2(m)}` <= fim; m === 12 ? (a++, m = 1) : m++) r.push(`${a}-${pad2(m)}`);
  return r;
}

// Soma dos 12 meses terminados em cada mês, só quando os 12 meses existem: Map("AAAA-MM" → n) → [["AAAA-MM", soma]].
function soma12(mensal) {
  const chaves = [...mensal.keys()].sort();
  if (!chaves.length) return [];
  const serie = [];
  for (const p of meses(chaves[0], chaves[chaves.length - 1])) {
    const janela = meses(`${Number(p.slice(0, 4)) - 1}${p.slice(4)}`, p).slice(1);
    if (janela.some((q) => !mensal.has(q))) continue;
    serie.push([p, janela.reduce((s, q) => s + mensal.get(q), 0)]);
  }
  return serie;
}

// ---------------------------------------------------------------- MJSP (Sinesp VDE)
const VDE_PAGINA = 'https://www.gov.br/mj/pt-br/assuntos/sua-seguranca/seguranca-publica/estatistica/dados-nacionais-1/' +
  'base-de-dados-e-notas-metodologicas-dos-gestores-estaduais-sinesp-vde-2022-e-2023';
const VDE_ARQUIVO = (ano) => 'https://www.gov.br/mj/pt-br/assuntos/sua-seguranca/seguranca-publica/estatistica/download/' +
  `dnsp-base-de-dados/bancovde-${ano}.xlsx/@@download/file`;
const VDE_PRIMEIRO_ANO = 2015;
const NUM_UFS = 27;
// Eventos lidos: nome na planilha → coluna com a contagem.
const VDE_EVENTOS = {
  'Feminicídio': 'total_vitima',
  'Roubo seguido de morte (latrocínio)': 'total_vitima',
  'Estupro': 'total_vitima',
  'Estupro de vulnerável': 'total_vitima',
  'Roubo de veículo': 'total',
  'Morte por intervenção de Agente do Estado': 'total_vitima',
  'Morte de Agente do Estado': 'total_vitima',
};

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const desescapar = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTIDADES[e]);

// Linhas da folha (XML já descomprimido) como arrays densos, em blocos de ~8 MB cortados no fim de uma </row>: a
// folha inteira passa do tamanho que uma string do V8 aguenta com folga. A planilha do Sinesp usa só texto
// inline (t="inlineStr") e números; texto compartilhado (t="s") não aparece e é recusado.
function* linhasVDE(xml) {
  const FIM = Buffer.from('</row>');
  for (let ini = 0; ini < xml.length;) {
    let corte = Math.min(ini + 8e6, xml.length);
    if (corte < xml.length) {
      const k = xml.lastIndexOf(FIM, corte);
      if (k <= ini) throw new Error('Sinesp: linha da planilha grande demais');
      corte = k + FIM.length;
    }
    const bloco = xml.toString('utf8', ini, corte);
    ini = corte;
    for (const mr of bloco.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const linha = [];
      for (const mc of mr[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        let c = 0;
        for (const ch of mc[1]) c = c * 26 + ch.charCodeAt(0) - 64;
        const tipo = mc[2].match(/\st="([^"]*)"/)?.[1], corpo = mc[3] || '';
        let valor = null;
        if (tipo === 'inlineStr') valor = desescapar(corpo.match(/<t\b[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? '');
        else if (tipo === 's') throw new Error('Sinesp: planilha com texto compartilhado (formato mudou)');
        else {
          const v = corpo.match(/<v>([^<]*)<\/v>/)?.[1];
          if (v != null) valor = tipo === 'str' ? desescapar(v) : Number(v);
        }
        while (linha.length < c - 1) linha.push(null);
        linha[c - 1] = valor;
      }
      yield linha;
    }
  }
}

// Anos publicados: os links bancovde-AAAA.xlsx da página (têm de ser consecutivos desde 2015).
async function anosVDE() {
  const pagina = await baixarTexto(VDE_PAGINA);
  const anos = [...new Set([...pagina.matchAll(/bancovde-(\d{4})\.xlsx\/@@download\/file/g)].map((m) => Number(m[1])))].sort();
  if (anos[0] !== VDE_PRIMEIRO_ANO || anos.some((a, i) => a !== VDE_PRIMEIRO_ANO + i)) {
    throw new Error(`Sinesp: anos inesperados na página (${anos.join(', ') || 'nenhum'})`);
  }
  return anos;
}

// Por evento: { soma: Map("AAAA-MM" → n), ufs: Map("AAAA-MM" → Set(UF que informou, abrangência estadual)) }.
let vdeDados = null;
function dadosVDE() {
  if (!vdeDados) {
    vdeDados = (async () => {
      const dados = Object.fromEntries(Object.keys(VDE_EVENTOS).map((e) => [e, { soma: new Map(), ufs: new Map() }]));
      for (const ano of await anosVDE()) {
        const buf = await baixarBuffer(VDE_ARQUIVO(ano));
        if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) throw new Error(`Sinesp ${ano}: resposta não é XLSX`);
        const zip = lerZip(buf);
        const folhas = [...zip.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k));
        if (folhas.length !== 1) throw new Error(`Sinesp ${ano}: ${folhas.length} folhas (esperava 1)`);
        let col = null, n = 0;
        for (const l of linhasVDE(zip.get(folhas[0]))) {
          if (!col) {
            col = Object.fromEntries(l.map((c, i) => [c, i]));
            for (const k of ['uf', 'evento', 'data_referencia', 'total_vitima', 'total', 'abrangencia']) {
              if (!(k in col)) throw new Error(`Sinesp ${ano}: coluna ${k} ausente`);
            }
            continue;
          }
          const campo = VDE_EVENTOS[l[col.evento]];
          if (!campo) continue;
          const data = l[col.data_referencia];
          if (typeof data !== 'number') throw new Error(`Sinesp ${ano}: data inválida (${data})`);
          const p = dataExcel(data).slice(0, 7);
          if (p.slice(0, 4) !== String(ano)) throw new Error(`Sinesp ${ano}: mês ${p} fora do ano do arquivo`);
          const v = l[col[campo]];
          if (v == null) continue; // não informado
          if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`Sinesp ${ano}: valor inválido (${v})`);
          const d = dados[l[col.evento]];
          d.soma.set(p, (d.soma.get(p) || 0) + v);
          if (l[col.abrangencia] === 'Estadual') {
            if (!d.ufs.has(p)) d.ufs.set(p, new Set());
            d.ufs.get(p).add(l[col.uf]);
          }
          n++;
        }
        if (!n) throw new Error(`Sinesp ${ano}: nenhuma linha dos eventos procurados`);
      }
      return dados;
    })();
    vdeDados.catch(() => { vdeDados = null; });
  }
  return vdeDados;
}

// Soma de 12 meses dos eventos, só nos meses em que todas as 27 UFs informaram todos os eventos.
async function serieVDE(eventos) {
  const dados = await dadosVDE();
  const mensal = new Map();
  for (const [p] of dados[eventos[0]].soma) {
    if (eventos.some((e) => (dados[e].ufs.get(p)?.size || 0) < NUM_UFS || !dados[e].soma.has(p))) continue;
    mensal.set(p, eventos.reduce((s, e) => s + dados[e].soma.get(p), 0));
  }
  const serie = soma12(mensal).filter(([p]) => p >= INICIO);
  if (!serie.length) throw new Error(`Sinesp: nenhum período de 12 meses completo (${eventos.join(', ')})`);
  const nMeses = [...dados[eventos[0]].soma.keys()].length;
  if (mensal.size < nMeses) console.log(`  (${nMeses - mensal.size} meses sem as ${NUM_UFS} UFs ficaram de fora)`);
  return serie;
}

const NOTA_SINESP = 'Dados do Sinesp VDE, montados pelo Ministério da Justiça e Segurança Pública a partir dos ' +
  'registros das polícias e secretarias de segurança de cada estado (boletins de ocorrência), e não de atestados de ' +
  'óbito. Os estados podem corrigir meses já publicados, e a qualidade e a forma de registro variam entre estados e ' +
  'ao longo do tempo; os meses mais recentes costumam ser revistos. Cálculo deste painel: soma dos 12 meses ' +
  'terminados em cada mês, só com meses informados pelas 27 UFs.';

function entradaVDE({ id, titulo, curto, unidade, descricao, eventos, nota }) {
  return {
    id,
    titulo,
    curto,
    tema: 'segurança',
    unidade,
    casas: 0,
    periodicidade: 'mensal',
    descricao,
    fonte: 'Ministério da Justiça e Segurança Pública — Sinesp, Dados Nacionais de Segurança Pública (base Sinesp VDE)',
    fonteUrl: VDE_PAGINA,
    nota: `${NOTA_SINESP}${nota ? ` ${nota}` : ''}`,
    async montar() {
      return { serie: await serieVDE(eventos) };
    },
  };
}

// ---------------------------------------------------------------- Polícia Federal (SINARM)
const SINARM_PAGINA = 'https://www.gov.br/pf/pt-br/assuntos/armas/dados-abertos/registros';
const SINARM_DIR = 'https://servicos.dpf.gov.br/dadosabertos/SINARM_CSV/REGISTROS/';
// Começa depois do recadastramento de 2008–2011 (Leis 11.706/2008 e 11.922/2009), quando os registros chegaram a
// ~690 mil num ano e achatariam o resto do gráfico; assim também se baixam só os CSVs desde 2010 (~130 MB).
const SINARM_INICIO = '2012-01';

// Uma linha CSV com aspas opcionais (o separador muda entre arquivos: "," ou ";").
function camposCSV(linha, sep) {
  const r = [];
  for (const m of linha.matchAll(new RegExp(`(?:^|${sep})(?:"((?:[^"]|"")*)"|([^${sep}]*))`, 'g'))) {
    r.push((m[1] != null ? m[1].replace(/""/g, '"') : m[2]).trim());
  }
  return r;
}

// Registros emitidos por mês: Map("AAAA-MM" → n), desde SINARM_INICIO, sem o mês corrente (ainda incompleto).
async function registrosSinarm() {
  const indice = await baixarTexto(SINARM_DIR);
  const arquivos = [...new Set([...indice.matchAll(/href="(REGISTROS_com_categoria[^"]*\.csv)"/gi)].map((m) => m[1]))]
    .map((nome) => {
      const anos = nome.match(/(\d{4})(?:-(\d{4}))?\.csv$/i);
      return anos && { nome, ate: Number(anos[2] || anos[1]) };
    })
    .filter((a) => a && a.ate >= Number(SINARM_INICIO.slice(0, 4)));
  if (arquivos.length < 5) throw new Error(`SINARM: só ${arquivos.length} arquivos de registros no diretório`);
  const d = new Date(), atual = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
  const mensal = new Map();
  for (const { nome } of arquivos) {
    const txt = (await baixarBuffer(SINARM_DIR + nome)).toString('latin1');
    const linhas = txt.split(/\r?\n/);
    const sep = linhas[0].includes(';') ? ';' : ',';
    const cab = camposCSV(linhas[0], sep);
    const iAno = cab.indexOf('ANO_EMISSAO'), iMes = cab.findIndex((c) => /^MES_E?MISSAO$/.test(c)), iTot = cab.indexOf('TOTAL');
    if (iAno < 0 || iMes < 0 || iTot < 0) throw new Error(`SINARM ${nome}: cabeçalho inesperado (${linhas[0].slice(0, 120)})`);
    let n = 0;
    for (const l of linhas.slice(1)) {
      if (!l.trim()) continue;
      const c = camposCSV(l, sep);
      if (c.length !== cab.length) throw new Error(`SINARM ${nome}: linha com ${c.length} colunas: ${l.slice(0, 120)}`);
      const p = `${c[iAno]}-${pad2(c[iMes])}`, v = Number(c[iTot]);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p) || !Number.isInteger(v) || v < 0) throw new Error(`SINARM ${nome}: linha inválida: ${l.slice(0, 120)}`);
      n++;
      if (p < SINARM_INICIO || p >= atual) continue;
      mensal.set(p, (mensal.get(p) || 0) + v);
    }
    if (!n) throw new Error(`SINARM ${nome}: arquivo vazio`);
  }
  return mensal;
}

// ---------------------------------------------------------------- entradas
export function indicadoresSeguranca() {
  return [
    entradaVDE({
      id: 'feminicidios',
      titulo: 'Feminicídios',
      curto: 'Feminicídios',
      unidade: 'por ano',
      descricao: 'Mulheres vítimas de feminicídio (homicídio de mulher por razões da condição de sexo feminino) ' +
        'registradas pelas polícias nos 12 meses terminados em cada mês.',
      eventos: ['Feminicídio'],
      nota: 'O feminicídio virou crime específico em março de 2015 (Lei 13.104/2015); a alta dos primeiros anos ' +
        'reflete em boa parte a adoção da nova classificação pelas polícias, não só mais crimes.',
    }),
    entradaVDE({
      id: 'latrocinios',
      titulo: 'Latrocínios (roubo seguido de morte)',
      curto: 'Latrocínios',
      unidade: 'vítimas',
      descricao: 'Vítimas de roubo seguido de morte (latrocínio) registradas pelas polícias nos 12 meses terminados ' +
        'em cada mês.',
      eventos: ['Roubo seguido de morte (latrocínio)'],
    }),
    entradaVDE({
      id: 'estupros',
      titulo: 'Estupros registrados',
      curto: 'Estupros',
      unidade: 'vítimas',
      descricao: 'Vítimas de estupro e de estupro de vulnerável registradas pelas polícias nos 12 meses terminados ' +
        'em cada mês.',
      eventos: ['Estupro', 'Estupro de vulnerável'],
      nota: 'Soma de "estupro" e "estupro de vulnerável" (menores de 14 anos ou pessoas sem condição de consentir). ' +
        'É um crime muito subnotificado: mudanças no número refletem também a disposição das vítimas de denunciar ' +
        'e a forma de registro de cada estado, não só a ocorrência do crime.',
    }),
    entradaVDE({
      id: 'roubo_veiculos',
      titulo: 'Roubos de veículos',
      curto: 'Roubos de veículos',
      unidade: 'ocorrências',
      descricao: 'Ocorrências de roubo de veículo (com violência ou ameaça; não inclui furto) registradas pelas ' +
        'polícias nos 12 meses terminados em cada mês.',
      eventos: ['Roubo de veículo'],
      nota: 'Até 2020 nem todos os estados informaram este evento ao Sinesp; a série começa quando as 27 UFs ' +
        'passaram a informá-lo.',
    }),
    entradaVDE({
      id: 'mortes_policia',
      titulo: 'Mortes por intervenção de agentes do Estado',
      curto: 'Mortes pela polícia',
      unidade: 'vítimas',
      descricao: 'Pessoas mortas em intervenções de agentes do Estado (policiais e outros agentes de segurança) nos ' +
        '12 meses terminados em cada mês.',
      eventos: ['Morte por intervenção de Agente do Estado'],
      nota: 'Inclui as mortes informadas pelos estados e as da Polícia Federal e da Polícia Rodoviária Federal.',
    }),
    entradaVDE({
      id: 'policiais_mortos',
      titulo: 'Agentes de segurança mortos',
      curto: 'Agentes mortos',
      unidade: 'vítimas',
      descricao: 'Agentes de segurança pública mortos (policiais militares, civis e penais, bombeiros, guardas ' +
        'municipais, agentes de trânsito, peritos, Polícia Federal e Polícia Rodoviária Federal) nos 12 meses ' +
        'terminados em cada mês.',
      eventos: ['Morte de Agente do Estado'],
      nota: 'Evento "Morte de Agente do Estado" do Sinesp, somadas todas as categorias de agente; não inclui ' +
        'suicídios de agentes, que o Sinesp conta à parte.',
    }),
    {
      id: 'armas_registros',
      titulo: 'Novos registros de armas de fogo (Polícia Federal/SINARM)',
      curto: 'Registros de armas',
      tema: 'segurança',
      unidade: 'por ano',
      casas: 0,
      periodicidade: 'mensal',
      descricao: 'Registros de armas de fogo de pessoas físicas emitidos pela Polícia Federal (SINARM) nos 12 meses ' +
        'terminados em cada mês.',
      fonte: 'Polícia Federal — SINARM, dados abertos de registros de arma de fogo (arquivos CSV)',
      fonteUrl: SINARM_PAGINA,
      nota: 'Registros de pessoas físicas no SINARM (cidadãos, servidores com porte por prerrogativa de função e ' +
        'caçadores de subsistência), pela data de emissão, contando também os que depois venceram ou foram ' +
        'cancelados. Não inclui as armas de colecionadores, atiradores e caçadores (CAC), controladas até jun/2025 ' +
        'pelo Exército (SIGMA), nem as de empresas e órgãos públicos. A série começa em 2012: de 2008 a 2011 o ' +
        'recadastramento e a regularização de armas antigas (Leis 11.706/2008 e 11.922/2009) levaram a centenas de ' +
        'milhares de registros por ano (cerca de 690 mil em 2010). Cálculo deste painel: soma dos 12 meses ' +
        'terminados em cada mês.',
      async montar() {
        return { serie: soma12(await registrosSinarm()) };
      },
    },
  ];
}

// Indicadores sociais do "Raio-X do Brasil" (programa social, educação e segurança), chamados por
// tools/build-indicadores.mjs, que valida, grava e monta o índice. Só fontes oficiais, sem chave de API:
//   - MDS, VIS DATA / MI Social (aplicacoes.mds.gov.br/sagi/servicos/misocial): base Solr pública com uma linha
//     por município e mês. A soma nacional sai das estatísticas do próprio Solr (stats.field com stats.facet por
//     mês), sem baixar os 5.570 municípios. Bolsa Família desde jan/2004; Auxílio Brasil de nov/2021 a fev/2023.
//   - MDS, VIS DATA 3 (aplicacoes.cidadania.gov.br/vis/data3/v.php): pessoas em situação de rua inscritas no
//     Cadastro Único, total do Brasil por mês desde jan/2015 (base mi_cecad_prod, coluna v70390). A MI Social só
//     tem as famílias em situação de rua que recebem o Bolsa Família, que é outra coisa.
//   - INEP, Ideb (download.inep.gov.br/ideb/resultados/divulgacao_brasil_ideb_{edição}.zip): ZIP com a planilha
//     XLSX "Brasil" (abas Anos Iniciais, Anos Finais e EM, uma linha por rede), lida por tools/xlsx.mjs.
//   - Ministério da Saúde, SIM via DATASUS/TabNet (tabnet.datasus.gov.br, sim/cnv/ext10uf.def): óbitos por
//     agressão (CID-10 X85–Y09) por ano, por local de residência; só anos com dados finais (o TabNet informa até
//     que ano são finais). Denominador: IBGE, Projeções da População, revisão 2024 (população em 1º de julho).
// Fica de fora a cobertura vacinal: o TabNet do SI-PNI só vai até 2022 e os dados desde 2023 estão só no painel
// do Ministério da Saúde, sem tabela legível por máquina.
//
// Uso: indicadoresSociais({ indiceIPCA }) devolve entradas no formato de INDICADORES de build-indicadores.mjs
// (metadados do índice + `montar()`); `indiceIPCA` é o índice de preços encadeado de lá (SGS 433).
import { lerZip, lerXlsx } from './xlsx.mjs';

const UA = 'apuracao-2026-painel/1.0 (indicadores)';
const INICIO = '2003-01';
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const mesPorExtenso = (p) => `${MESES[Number(p.slice(5, 7)) - 1]} de ${p.slice(0, 4)}`;
const pausa = (ms) => new Promise((ok) => setTimeout(ok, ms));
const arred = (v, casas) => Math.round(v * 10 ** casas) / 10 ** casas;
const ordenar = (m) => [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1));

// Mesma política de build-indicadores.mjs: uma requisição por vez, 3 tentativas com espera crescente.
async function baixar(url, ler, opcoes = {}) {
  for (let tentativa = 1; ; tentativa++) {
    await pausa(300);
    try {
      const res = await fetch(url, { ...opcoes, headers: { 'User-Agent': UA, Accept: '*/*', ...opcoes.headers }, signal: AbortSignal.timeout(120e3) });
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
      return await ler(res);
    } catch (err) {
      if (tentativa >= 3) throw err;
      console.warn(`  tentativa ${tentativa} falhou (${err.message.slice(0, 120)}); repetindo...`);
      await pausa(2000 * tentativa ** 2);
    }
  }
}
const ehZip = (buf) => buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50;
const baixarZip = (url) => baixar(url, async (res) => {
  const buf = Buffer.from(await res.arrayBuffer());
  if (!ehZip(buf)) throw new Error(`resposta não é ZIP/XLSX em ${url}`);
  return buf;
});
// O TabNet responde em ISO-8859-1.
const baixarLatin1 = (url, opcoes) => baixar(url, async (res) => Buffer.from(await res.arrayBuffer()).toString('latin1'), opcoes);

// ---------------------------------------------------------------- MDS (VIS DATA / MI Social)
const MISOCIAL = 'https://aplicacoes.mds.gov.br/sagi/servicos/misocial';
const VISDATA = 'https://aplicacoes.mds.gov.br/sagi/vis/data3/data-explorer.php';
// Campos da base (somados por mês sobre os municípios). O Auxílio Brasil (nov/2021 a fev/2023) tem campos
// próprios; de dez/2021 a jun/2022 o complemento para R$ 400 (benefício extraordinário) foi pago à parte.
const PBF = { familias: 'qtd_familias_beneficiarias_bolsa_familia_i', valor: 'valor_repassado_bolsa_familia_f' };
const PAB = { familias: 'pab_qtd_fam_benef_i', valor: 'pab_valor_pago_d', extra: 'pab_extraordinario_valor_pago_d' };
// Meses do Auxílio Emergencial (abr–dez/2020 e abr–out/2021): quem recebia o auxílio teve o Bolsa Família
// suspenso, então o valor repassado pelo programa despenca, mas a família continua contada como beneficiária.
// O benefício médio desses meses não representa o que as famílias receberam e fica fora da série.
const AUXILIO_EMERGENCIAL = [['2020-04', '2020-12'], ['2021-04', '2021-10']];
const MIN_MUNICIPIOS = 5500; // mês com menos municípios informados está incompleto

let mdsDados = null;
function dadosMDS() {
  if (!mdsDados) {
    mdsDados = (async () => {
      const campos = [...Object.values(PBF), ...Object.values(PAB)];
      const url = `${MISOCIAL}?q=*:*&rows=0&wt=json&stats=true&stats.facet=anomes_s&${campos.map((c) => `stats.field=${c}`).join('&')}`;
      const json = await baixar(url, async (res) => JSON.parse(await res.text()), { headers: { Accept: 'application/json' } });
      const soma = {}, municipios = new Map();
      for (const c of campos) {
        const facetas = json?.stats?.stats_fields?.[c]?.facets?.anomes_s;
        if (!facetas) throw new Error(`MI Social sem o campo ${c}`);
        soma[c] = new Map();
        for (const [am, s] of Object.entries(facetas)) {
          if (!/^\d{6}$/.test(am) || !s || !(s.sum > 0)) continue;
          const p = `${am.slice(0, 4)}-${am.slice(4)}`;
          soma[c].set(p, s.sum);
          municipios.set(p, Math.max(municipios.get(p) || 0, s.count));
        }
      }
      // Por mês: { familias, valor } do programa vigente (Bolsa Família ou Auxílio Brasil).
      const meses = new Map();
      for (const [p, n] of municipios) {
        if (n < MIN_MUNICIPIOS) continue;
        const pbf = soma[PBF.familias].get(p), pab = soma[PAB.familias].get(p);
        if (pbf && pab) throw new Error(`MI Social: Bolsa Família e Auxílio Brasil no mesmo mês (${p})`);
        if (pbf) meses.set(p, { familias: pbf, valor: soma[PBF.valor].get(p) });
        else if (pab) meses.set(p, { familias: pab, valor: (soma[PAB.valor].get(p) || 0) + (soma[PAB.extra].get(p) || 0) });
      }
      if (meses.size < 200) throw new Error(`MI Social: só ${meses.size} meses com dados`);
      return meses;
    })();
    mdsDados.catch(() => { mdsDados = null; });
  }
  return mdsDados;
}

// Pessoas em situação de rua no Cadastro Único (VIS DATA 3). O parâmetro q[] é o link público do indicador no
// Data Explorer do VIS DATA ("Pessoas em situação de rua inscritas no Cadastro Único"); com wt=json a mesma URL
// devolve a série do Brasil, uma linha por mês: [código, "AAAA-MM-01", "MM/AAAA", pessoas].
const VIS3 = 'https://aplicacoes.cidadania.gov.br/vis/data3/v.php';
const RUA_Q = 'oNOclsLerpibuKep3bV%2Bg2hi05Kv2rmg2a19ZXF1ZWumaX6JaV2Jl2CadmCNrMmqc3hoc6l0s6%2BjoLycmcuppsK2iJqdtKiftHTAw6SppSTt16KlzJuxmVy4mq3sqK7BV5LEgabTsai%2BPvT337dVnt5Zv8OYTcDPps2vnNHcwFSqt1V92p2uwaufxoH2BKucwOrJpHfEsba0';
const RUA_COLUNA = 'v70390';

async function pessoasSituacaoRua() {
  const url = `${VIS3}?wt=json&wt_dsf=1&wt_cag=1&wt_ctpc=1&saida_dados_sem_formatacao=1&rows=999999999&q[]=${RUA_Q}`;
  const json = await baixar(url, async (res) => JSON.parse(await res.text()), { headers: { Accept: 'application/json' } });
  // Confere que a resposta é o indicador certo (coluna e título), e não outro metadado do VIS DATA.
  const col = (json?.colunas_ag || []).at(-1);
  if (col?.coluna !== RUA_COLUNA || !/situa[çc][ãa]o de rua/i.test(col?.cabecalho || '')) {
    throw new Error(`VIS DATA: coluna inesperada (${col?.coluna} — ${col?.cabecalho})`);
  }
  const serie = new Map();
  for (const linha of json.data || []) {
    const [codigo, data, , v] = linha;
    if (Number(codigo) !== 0) throw new Error(`VIS DATA: linha fora do total Brasil (${JSON.stringify(linha)})`);
    if (!/^\d{4}-\d{2}-01$/.test(data) || typeof v !== 'number' || !(v > 0)) throw new Error(`VIS DATA: linha inválida ${JSON.stringify(linha)}`);
    serie.set(data.slice(0, 7), v);
  }
  if (serie.size < 100) throw new Error(`VIS DATA: só ${serie.size} meses de pessoas em situação de rua`);
  return serie;
}

const NOTA_PROGRAMA = 'O programa se chamou Bolsa Família de out/2003 a out/2021, Auxílio Brasil de nov/2021 a fev/2023 ' +
  'e voltou a ser Bolsa Família em mar/2023.';

// ---------------------------------------------------------------- INEP (Ideb)
const IDEB_PAGINA = 'https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/ideb/resultados';
// Por HTTP: o servidor de download do INEP não envia o certificado intermediário, e o Node recusa o HTTPS
// ("unable to verify the first certificate"). O conteúdo é conferido (ZIP com a planilha e as colunas esperadas).
const IDEB_ZIP = (ano) => `http://download.inep.gov.br/ideb/resultados/divulgacao_brasil_ideb_${ano}.zip`;
const IDEB_ABAS = { iniciais: /anos\s+iniciais/i, finais: /anos\s+finais/i, medio: /\(EM\)|ensino\s+m[eé]dio/i };
const IDEB_REDE = 'Pública';

// Edição mais recente: o Ideb sai nos anos ímpares; tenta do ano atual (ou o ímpar anterior) para trás. Uma
// edição que ainda não saiu responde 404, que não é repetido.
let idebDados = null;
function dadosIdeb() {
  if (!idebDados) {
    idebDados = (async () => {
      let ano = new Date().getFullYear();
      if (ano % 2 === 0) ano--;
      for (let n = 0; n < 4; n++, ano -= 2) {
        const res = await fetch(IDEB_ZIP(ano), { method: 'HEAD', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60e3) }).catch(() => null);
        if (res?.status === 404) continue;
        const zip = lerZip(await baixarZip(IDEB_ZIP(ano)));
        const nome = [...zip.keys()].find((k) => /\.xlsx$/i.test(k));
        if (!nome) throw new Error(`ZIP do Ideb ${ano} sem XLSX`);
        return { edicao: ano, planilhas: lerXlsx(zip.get(nome)) };
      }
      throw new Error('nenhuma edição do Ideb encontrada');
    })();
    idebDados.catch(() => { idebDados = null; });
  }
  return idebDados;
}

// Série do Ideb observado de uma etapa, rede pública: [["AAAA-12", valor]]. O ano de cada coluna sai do código
// (VL_OBSERVADO_AAAA) ou, se o código faltar (acontece na planilha), do rótulo "IDEB AAAA (N x P)" acima dele.
async function serieIdeb(etapa) {
  const { planilhas } = await dadosIdeb();
  const aba = planilhas.find((p) => IDEB_ABAS[etapa].test(p.nome));
  if (!aba) throw new Error(`aba do Ideb não encontrada: ${etapa}`);
  const iCod = aba.linhas.findIndex((l) => l?.some((c) => /^VL_OBSERVADO_\d{4}$/.test(c ?? '')));
  if (iCod < 0) throw new Error(`cabeçalho do Ideb não encontrado: ${etapa}`);
  const colunas = new Map();
  const largura = Math.max(...aba.linhas.slice(0, iCod + 1).map((l) => l?.length || 0));
  for (let c = 0; c < largura; c++) {
    let ano = String(aba.linhas[iCod][c] ?? '').match(/^VL_OBSERVADO_(\d{4})$/)?.[1];
    if (!ano && !aba.linhas[iCod][c]) {
      for (let r = iCod - 1; r >= 0 && !ano; r--) ano = String(aba.linhas[r]?.[c] ?? '').match(/^IDEB\s+(\d{4})/)?.[1];
    }
    if (ano) colunas.set(c, ano);
  }
  const linha = aba.linhas.slice(iCod + 1).find((l) => String(l?.[1] ?? '').trim() === IDEB_REDE);
  if (!linha) throw new Error(`linha da rede ${IDEB_REDE} não encontrada: ${etapa}`);
  const serie = new Map();
  for (const [c, ano] of colunas) {
    const v = linha[c];
    if (typeof v === 'number' && Number.isFinite(v)) serie.set(`${ano}-12`, arred(v, 1));
  }
  return ordenar(serie);
}

function entradaIdeb(id, etapa, titulo, curto, anos) {
  return {
    id,
    titulo,
    curto,
    tema: 'educação',
    unidade: 'índice',
    casas: 1,
    periodicidade: 'anual',
    descricao: `Índice de Desenvolvimento da Educação Básica (Ideb) das escolas públicas nos ${anos}. Vai de 0 a 10 ` +
      'e junta o aprendizado (notas do Saeb em português e matemática) com a taxa de aprovação.',
    fonte: 'INEP — Ideb, resultados por rede (planilha Brasil)',
    fonteUrl: IDEB_PAGINA,
    nota: 'O Ideb é calculado a cada dois anos (anos ímpares); o ponto fica em dezembro do ano da prova. Valor da linha ' +
      '"Pública" da planilha do INEP (a rede total inclui as escolas privadas). O de 2021 foi afetado pela pandemia ' +
      '(aulas remotas e regras de aprovação flexibilizadas); o INEP publicou nota técnica sobre esse impacto.',
    async montar() {
      const serie = await serieIdeb(etapa);
      const { edicao } = await dadosIdeb();
      console.log(`  (planilha da edição ${edicao})`);
      return { serie };
    },
  };
}

// ---------------------------------------------------------------- Ministério da Saúde (SIM) + IBGE (população)
const TABNET = 'http://tabnet.datasus.gov.br/cgi';
const SIM_DEF = 'sim/cnv/ext10uf.def';
const SIM_PAGINA = `${TABNET}/deftohtm.exe?${SIM_DEF}`;
const PROJECAO = 'https://ftp.ibge.gov.br/Projecao_da_Populacao/Projecao_da_Populacao_2024/projecoes_2024_tab4_indicadores.xlsx';

// application/x-www-form-urlencoded em ISO-8859-1, como o formulário do TabNet.
const latin1URI = (s) => [...Buffer.from(s, 'latin1')].map((b) => (/[A-Za-z0-9_.\-]/.test(String.fromCharCode(b)) ? String.fromCharCode(b) : `%${b.toString(16).toUpperCase().padStart(2, '0')}`)).join('');

// Óbitos por agressão (X85–Y09), por residência, por ano: Map("AAAA" → óbitos), só anos com dados finais.
async function obitosAgressao() {
  const pagina = await baixarLatin1(SIM_PAGINA, { headers: { Accept: 'text/html' } });
  const ultimoFinal = pagina.match(/Dados finais dispon[ií]veis at[eé] (\d{4})/i)?.[1];
  if (!ultimoFinal) throw new Error('TabNet/SIM: não achei até que ano os dados são finais');
  const arquivos = [...pagina.matchAll(/<OPTION VALUE="(extuf\d{2}\.dbf)"[^>]*>\s*(\d{4})/gi)]
    .filter(([, , ano]) => ano >= INICIO.slice(0, 4) && ano <= ultimoFinal).map(([, arq]) => arq);
  const grupo = pagina.match(/<OPTION VALUE="(\d+)">\s*X85-Y09/i)?.[1];
  if (!arquivos.length || !grupo) throw new Error('TabNet/SIM: formulário mudou (anos ou grupo X85-Y09 não encontrados)');
  const campos = [
    ['Linha', 'Ano_do_Óbito'], ['Coluna', '--Não-Ativa--'], ['Incremento', 'Óbitos_p/Residênc'],
    ...arquivos.map((a) => ['Arquivos', a]),
    ['SRegião', 'TODAS_AS_CATEGORIAS__'], ['SUnidade_da_Federação', 'TODAS_AS_CATEGORIAS__'], ['SGrande_Grupo_CID10', grupo],
    ['formato', 'prn'], ['mostre', 'Mostra'],
  ];
  const txt = await baixarLatin1(`${TABNET}/tabcgi.exe?${SIM_DEF}`, {
    method: 'POST',
    body: campos.map(([k, v]) => `${latin1URI(k)}=${latin1URI(v)}`).join('&'),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' },
  });
  const obitos = new Map();
  for (const [, ano, n] of txt.matchAll(/^"(\d{4})";(\d+)\s*$/gm)) obitos.set(ano, Number(n));
  if (obitos.size !== arquivos.length) throw new Error(`TabNet/SIM: ${obitos.size} anos na resposta, ${arquivos.length} pedidos`);
  return { obitos, ultimoFinal };
}

// População do Brasil em 1º de julho de cada ano: Map("AAAA" → pessoas).
async function populacaoBrasil() {
  const [aba] = lerXlsx(await baixarZip(PROJECAO));
  const iCab = aba?.linhas.findIndex((l) => l?.[0] === 'ANO');
  if (!(iCab >= 0)) throw new Error('projeção do IBGE: cabeçalho não encontrado');
  const cab = aba.linhas[iCab], cAno = 0, cCod = cab.indexOf('CÓD.'), cPop = cab.indexOf('POP_T');
  if (cCod < 0 || cPop < 0) throw new Error('projeção do IBGE: colunas CÓD./POP_T ausentes');
  const pop = new Map();
  for (const l of aba.linhas.slice(iCab + 1)) {
    if (l?.[cCod] === 0 && typeof l[cAno] === 'number' && typeof l[cPop] === 'number') pop.set(String(l[cAno]), l[cPop]);
  }
  if (pop.size < 20) throw new Error('projeção do IBGE: série do Brasil não encontrada');
  return pop;
}

// ---------------------------------------------------------------- entradas
export function indicadoresSociais({ indiceIPCA }) {
  return [
    {
      id: 'bolsa_familia_familias',
      titulo: 'Famílias atendidas pelo Bolsa Família / Auxílio Brasil',
      curto: 'Famílias no programa',
      tema: 'social',
      unidade: 'milhões',
      casas: 1,
      periodicidade: 'mensal',
      descricao: 'Número de famílias que receberam o benefício do programa de transferência de renda do governo ' +
        'federal no mês, em milhões.',
      fonte: 'Ministério do Desenvolvimento e Assistência Social (MDS) — VIS DATA / MI Social',
      fonteUrl: VISDATA,
      nota: `${NOTA_PROGRAMA} Soma dos municípios na base do MDS. Em 2020 e 2021, muitas famílias receberam o ` +
        'Auxílio Emergencial no lugar do benefício, mas continuaram contadas como beneficiárias.',
      async montar() {
        const meses = await dadosMDS();
        return { serie: ordenar(new Map([...meses].map(([p, { familias }]) => [p, arred(familias / 1e6, 2)]))) };
      },
    },
    {
      id: 'bolsa_familia_valor',
      titulo: 'Benefício médio por família (corrigido pela inflação)',
      curto: 'Benefício médio',
      tema: 'social',
      unidade: 'R$',
      casas: 0,
      periodicidade: 'mensal',
      descricao: 'Valor médio pago por família no mês, corrigido pelo IPCA.', // completada em montar()
      fonte: 'Ministério do Desenvolvimento e Assistência Social (MDS) — VIS DATA / MI Social; IPCA mensal do IBGE (SGS 433)',
      fonteUrl: VISDATA,
      nota: `${NOTA_PROGRAMA} Cálculo deste painel: valor total repassado no mês dividido pelo número de famílias, ` +
        'corrigido pelo IPCA até o mês mais recente com IPCA divulgado. No Auxílio Brasil, inclui o benefício ' +
        'extraordinário (complemento até R$ 400 de dez/2021 a jun/2022). Sem dado de abr a dez/2020 e de abr a ' +
        'out/2021: nesses meses quem recebia o Auxílio Emergencial teve o benefício suspenso e a média do programa ' +
        'não representa o que as famílias receberam.',
      async montar() {
        const meses = await dadosMDS();
        const { indice, ultimo } = await indiceIPCA();
        const base = indice.get(ultimo);
        const nivel = (p) => indice.get(p > ultimo ? ultimo : p);
        const serie = [];
        for (const [p, { familias, valor }] of ordenar(meses)) {
          if (AUXILIO_EMERGENCIAL.some(([a, b]) => p >= a && p <= b) || !nivel(p) || !(valor > 0)) continue;
          serie.push([p, arred(((valor / familias) * base) / nivel(p), 2)]);
        }
        return {
          serie,
          meta: { descricao: `Valor médio pago por família no mês, em reais de ${mesPorExtenso(ultimo)} (corrigido pelo IPCA).` },
        };
      },
    },
    {
      id: 'situacao_rua',
      titulo: 'Pessoas em situação de rua inscritas no Cadastro Único',
      curto: 'Situação de rua',
      tema: 'social',
      unidade: 'mil pessoas',
      casas: 0,
      periodicidade: 'mensal',
      descricao: 'Número de pessoas que se declararam em situação de rua no Cadastro Único para Programas Sociais ' +
        '(CadÚnico) do governo federal no mês, em milhares.',
      fonte: 'Ministério do Desenvolvimento e Assistência Social (MDS) — VIS DATA 3, Cadastro Único (Departamento do Cadastro Único)',
      fonteUrl: `${VIS3}?q[]=${RUA_Q}`,
      nota: 'Conta inscrições no Cadastro Único, não é um censo: quem vive na rua e nunca se cadastrou fica de fora, ' +
        'e parte do crescimento vem de mais gente sendo cadastrada (busca ativa dos municípios), não só de mais ' +
        'gente na rua. O Ministério dos Direitos Humanos (MDHC) aponta que a atualização dos cadastros ' +
        'enfraqueceu de 2019 a 2022. A pesquisa do IBGE usada para pobreza (PNAD Contínua) não inclui quem vive ' +
        'na rua, porque entrevista moradores de domicílios. Série do MDS desde jan/2015; os números de meses ' +
        'passados podem ser revistos pelo ministério.',
      async montar() {
        const serie = await pessoasSituacaoRua();
        return { serie: ordenar(new Map([...serie].map(([p, n]) => [p, arred(n / 1e3, 1)]))) };
      },
    },
    entradaIdeb('ideb_iniciais', 'iniciais', 'Ideb dos anos iniciais do ensino fundamental (rede pública)', 'Ideb anos iniciais', 'anos iniciais do ensino fundamental (1º ao 5º ano)'),
    entradaIdeb('ideb_finais', 'finais', 'Ideb dos anos finais do ensino fundamental (rede pública)', 'Ideb anos finais', 'anos finais do ensino fundamental (6º ao 9º ano)'),
    entradaIdeb('ideb_medio', 'medio', 'Ideb do ensino médio (rede pública)', 'Ideb ensino médio', 'três anos do ensino médio'),
    {
      id: 'homicidios',
      titulo: 'Homicídios por 100 mil habitantes',
      curto: 'Homicídios',
      tema: 'segurança',
      unidade: 'por 100 mil',
      casas: 1,
      periodicidade: 'anual',
      descricao: 'Mortes por agressão (homicídios) no ano para cada 100 mil habitantes, segundo os atestados de óbito ' +
        'registrados no Sistema de Informações sobre Mortalidade (SIM) do Ministério da Saúde.',
      fonte: 'Ministério da Saúde — SIM (DATASUS/TabNet), óbitos por causas externas; IBGE — Projeções da População (revisão 2024)',
      fonteUrl: SIM_PAGINA,
      nota: 'Óbitos por agressão (CID-10 X85 a Y09), pelo estado de residência da vítima, divididos pela população ' +
        'projetada pelo IBGE para 1º de julho de cada ano. Não inclui mortes por intervenção policial (Y35–Y36) nem ' +
        'mortes violentas de intenção indeterminada. Só anos com dados finais do SIM (os dois anos mais recentes ' +
        'costumam ser preliminares e ficam de fora até serem fechados).',
      async montar() {
        const { obitos, ultimoFinal } = await obitosAgressao();
        const pop = await populacaoBrasil();
        const serie = [];
        for (const [ano, n] of ordenar(obitos)) {
          if (!pop.has(ano)) throw new Error(`sem população projetada para ${ano}`);
          serie.push([`${ano}-12`, arred((n / pop.get(ano)) * 1e5, 2)]);
        }
        console.log(`  (dados finais do SIM até ${ultimoFinal})`);
        return { serie };
      },
    },
  ];
}

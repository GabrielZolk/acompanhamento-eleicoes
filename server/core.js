// Núcleo sem estado próprio: busca os arquivos do TSE sob demanda (com cache por ETag
// enquanto a instância estiver ativa) e monta as respostas da API. Serve tanto às funções
// serverless da Vercel (api/) quanto ao servidor local (server/index.js).
import { UFS, CARGOS, UF_BY_CODE, cdDoCargo, nomeDoCargo } from '../public/js/ufs.js';
import { semAcento } from '../public/js/format.js';
import { atribuirCores } from '../public/js/colors.js';
import { fetchJson, urls } from './tse.js';
import { parseUnificado, parseAcompanhamento } from './normalize.js';
import { montarPainel } from './dashboard.js';
import { Tracker } from './tracker.js';
import { store } from './store.js';
import { mapLimit } from './util.js';

// Códigos de eleição do TSE. Para o 2º turno (25/10) use TSE_ELE_FEDERAL=6258 e TSE_ELE_ESTADUAL=6260.
if (process.env.TSE_ELE_FEDERAL) CARGOS.presidente.ele = process.env.TSE_ELE_FEDERAL;
if (process.env.TSE_ELE_ESTADUAL) for (const k of ['governador', 'senado', 'camara', 'assembleia']) CARGOS[k].ele = process.env.TSE_ELE_ESTADUAL;

// Início da totalização: 17h de Brasília no dia da eleição.
const INICIO = Date.parse(`${process.env.ELEICAO_DATA || '2026-10-04'}T17:00:00-03:00`);
const UF_LIST = UFS.map((u) => u.uf);

const parsed = new Map(); // url -> objeto normalizado (reaproveitado quando o TSE responde 304)
async function load(url, parse) {
  const { data, changed } = await fetchJson(url);
  if (!data) return null;
  if (changed || !parsed.has(url)) parsed.set(url, parse(data));
  return parsed.get(url);
}

const fotoDe = (cargo, uf) => (sq) => urls.foto(cargo.ele, cargo.federal ? 'br' : uf, sq);

const carregarUF = (cargo, uf) =>
  load(urls.unificado(cargo.ele, cdDoCargo(cargo, uf), uf), (d) => parseUnificado(d, { foto: fotoDe(cargo, uf) }));

async function carregarCargo(cargo) {
  const ufs = cargo.federal ? [...UF_LIST, 'zz'] : UF_LIST;
  const estados = {};
  await mapLimit(ufs, 10, async (uf) => {
    const e = await carregarUF(cargo, uf);
    if (e) estados[uf] = e;
  });
  const nacional = cargo.federal
    ? await load(urls.unificado(cargo.ele, cargo.cd, 'br'), (d) => parseUnificado(d, { foto: fotoDe(cargo, 'br') }))
    : null;
  return { nacional, estados };
}

async function trackerAtualizado(ele, ab) {
  const chave = `apuracao2026:tracker:${ele}`;
  let salvo = null;
  try {
    salvo = await store.get(chave);
  } catch (err) {
    console.error('[store] leitura falhou:', err.message);
  }
  const tracker = new Tracker(salvo);
  if (tracker.ingest(ab)) {
    try {
      await store.set(chave, tracker.toJSON());
    } catch (err) {
      console.error('[store] gravação falhou:', err.message);
    }
  }
  return tracker.view();
}

// Identificador da publicação atual do TSE: o TSE numera cada geração de arquivo (idg).
const versaoDe = (ab, nacional) => `${ab?.idg || ''}-${nacional?.idg || ''}`;

// Consulta leve (2 arquivos, normalmente respondidos com 304) para o navegador saber se há dado novo.
export async function obterVersao(cargoKey) {
  const cargo = CARGOS[cargoKey];
  const [ab, nacional] = await Promise.all([
    load(urls.acompanhamento(cargo.ele), parseAcompanhamento),
    cargo.federal ? load(urls.unificado(cargo.ele, cargo.cd, 'br'), (d) => parseUnificado(d, { foto: fotoDe(cargo, 'br') })) : null,
  ]);
  return { versao: versaoDe(ab, nacional), geradoEm: Math.max(ab?.geradoEm || 0, nacional?.geradoEm || 0) || null };
}

export async function obterPainel(cargoKey) {
  const cargo = CARGOS[cargoKey];
  const [ab, dados] = await Promise.all([
    load(urls.acompanhamento(cargo.ele), parseAcompanhamento),
    carregarCargo(cargo),
  ]);
  if (!ab && !dados.nacional && !Object.keys(dados.estados).length) return null;
  const tracker = await trackerAtualizado(cargo.ele, ab);
  const p = montarPainel({ cargoKey, ...dados, ab, tracker, inicio: INICIO });
  p.armazenamento = store.tipo;
  p.versao = versaoDe(ab, dados.nacional);
  return p;
}

let municipiosCache = null;
export async function listarMunicipios() {
  if (municipiosCache && Date.now() - municipiosCache.at < 3600e3) return municipiosCache.lista;
  const { data } = await fetchJson(urls.municipios(CARGOS.presidente.ele));
  const lista = [];
  for (const abr of data?.abr || []) {
    const uf = abr.cd.toLowerCase();
    for (const m of abr.mu || []) lista.push({ uf, cd: m.cd, nome: m.nm, capital: m.c === 's' });
  }
  municipiosCache = { at: Date.now(), lista };
  return lista;
}

export async function obterMunicipio({ cargo: cargoKey, uf, mun }) {
  cargoKey = CARGOS[cargoKey] ? cargoKey : 'presidente';
  uf = (uf || '').toLowerCase();
  mun = (mun || '').replace(/\D/g, '');
  if (!UF_BY_CODE[uf] || !mun) return { status: 400, body: { erro: 'Parâmetros uf e mun são obrigatórios.' } };
  if (cargoKey !== 'presidente' && uf === 'zz') return { status: 404, body: { erro: 'No exterior só há votação para Presidente.' } };
  const cargo = CARGOS[cargoKey];
  const { data } = await fetchJson(urls.unificado(cargo.ele, cdDoCargo(cargo, uf), uf, mun));
  const r = parseUnificado(data, { foto: fotoDe(cargo, uf) });
  if (!r) return { status: 404, body: { erro: 'Resultado do município indisponível no momento.' } };
  let cores;
  if (cargo.federal) {
    // Mesmas cores do painel nacional.
    const nac = await load(urls.unificado(cargo.ele, cargo.cd, 'br'), (d) => parseUnificado(d, { foto: fotoDe(cargo, 'br') }));
    cores = atribuirCores((nac?.candidatos || []).map((c) => ({ key: c.n, partido: c.partido })));
  } else {
    cores = atribuirCores(r.candidatos.map((c) => ({ key: c.n, partido: c.partido })));
  }
  const nome = (await listarMunicipios()).find((m) => m.uf === uf && m.cd === mun)?.nome;
  return {
    status: 200,
    body: {
      ...r,
      cargo: nomeDoCargo(cargo, uf),
      proporcional: !!cargo.proporcional,
      uf,
      municipio: nome || mun,
      candidatos: r.candidatos.slice(0, 40).map((c) => ({ ...c, cor: cores[c.n] || '#94a3b8' })),
      partidos: r.partidos?.slice(0, 40) || [],
    },
  };
}

// ---------------------------------------------------------------- candidatos (lista completa e busca)
const compacto = (c, uf, pos) => ({
  n: c.n,
  sq: c.sq,
  nome: c.nome,
  partido: c.partido,
  votos: c.votos,
  pct: c.pct,
  eleito: c.eleito,
  situacao: c.situacao,
  pos,
  uf,
});

const bate = (c, termo, termoMaiusculo) =>
  semAcento(c.nome).includes(termo) ||
  semAcento(c.nomeCompleto || '').includes(termo) ||
  c.n.startsWith(termo) ||
  c.partido === termoMaiusculo;

// uf = sigla: lista completa da UF. uf = "br" + q: busca em todas as UFs (máx. 80 resultados).
export async function obterCandidatos({ cargo: cargoKey, uf, q }) {
  const cargo = CARGOS[cargoKey];
  if (!cargo || cargo.federal) return { status: 400, body: { erro: 'Cargo inválido.' } };
  uf = (uf || '').toLowerCase();
  if (uf && uf !== 'br') {
    if (!UF_BY_CODE[uf] || uf === 'zz') return { status: 400, body: { erro: 'UF inválida.' } };
    const e = await carregarUF(cargo, uf);
    if (!e) return { status: 404, body: { erro: 'Resultado indisponível no momento.' } };
    return {
      status: 200,
      body: {
        uf,
        cargo: nomeDoCargo(cargo, uf),
        vagas: e.cargo.vagas,
        secoes: e.secoes,
        votos: e.votos,
        fotoBase: urls.foto(cargo.ele, uf, '{sq}'),
        total: e.candidatos.length,
        candidatos: e.candidatos.map((c, i) => compacto(c, uf, i + 1)),
        partidos: e.partidos.map((p) => ({ sigla: p.sigla, nome: p.nome, votos: p.votos, eleitos: p.eleitos, candidatos: p.candidatos })),
      },
    };
  }
  const termo = semAcento((q || '').trim());
  if (termo.length < 3) return { status: 400, body: { erro: 'Digite pelo menos 3 letras.' } };
  const termoMaiusculo = termo.toUpperCase();
  const achados = [];
  await mapLimit(UF_LIST, 10, async (u) => {
    const e = await carregarUF(cargo, u);
    e?.candidatos.forEach((c, i) => {
      if (bate(c, termo, termoMaiusculo)) achados.push({ ...compacto(c, u, i + 1), foto: c.foto });
    });
  });
  achados.sort((a, b) => b.votos - a.votos || a.nome.localeCompare(b.nome));
  return { status: 200, body: { uf: 'br', cargo: cargo.nome, total: achados.length, candidatos: achados.slice(0, 80) } };
}

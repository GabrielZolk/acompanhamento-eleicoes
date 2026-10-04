// Núcleo sem estado próprio: busca os arquivos do TSE sob demanda (com cache por ETag
// enquanto a instância estiver ativa) e monta as respostas da API. Serve tanto às funções
// serverless da Vercel (api/) quanto ao servidor local (server/index.js).
import { UFS, CARGOS, UF_BY_CODE, cdDoCargo, nomeDoCargo } from '../public/js/ufs.js';
import { semAcento } from '../public/js/format.js';
import { atribuirCores } from '../public/js/colors.js';
import { fetchJson, urls } from './tse.js';
import { parseUnificado, parseAcompanhamento } from './normalize.js';
import { montarPainel } from './dashboard.js';
import { montarPartidos, resumoPartidos } from './partidos.js';
import { montarEleitos } from './eleitos.js';
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

// Percentual dos principais candidatos a Presidente, com e sem o exterior (histórico de resultado).
function fotoCandidatos(nacional, zz) {
  const top = (nacional?.candidatos || []).filter((c) => c.votos > 0).slice(0, 5);
  if (!top.length) return null;
  const r2 = (v) => Math.round(v * 100) / 100;
  const zzVotos = Object.fromEntries((zz?.candidatos || []).map((c) => [c.n, c.votos]));
  const validosSE = (nacional.votos?.validos || 0) - (zz?.votos?.validos || 0);
  const c = {}, cSE = {};
  for (const x of top) {
    c[x.n] = r2(x.pct);
    cSE[x.n] = validosSE > 0 ? r2(((x.votos - (zzVotos[x.n] || 0)) / validosSE) * 100) : 0;
  }
  return { c, cSE };
}

async function trackerAtualizado(ele, ab, cands = null) {
  const chave = `apuracao2026:tracker:${ele}`;
  let salvo = null;
  try {
    salvo = await store.get(chave);
  } catch (err) {
    console.error('[store] leitura falhou:', err.message);
  }
  const tracker = new Tracker(salvo);
  if (tracker.ingest(ab, cands)) {
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

async function montarPainelAtual(cargoKey) {
  const cargo = CARGOS[cargoKey];
  const [ab, dados] = await Promise.all([
    load(urls.acompanhamento(cargo.ele), parseAcompanhamento),
    carregarCargo(cargo),
  ]);
  if (!ab && !dados.nacional && !Object.keys(dados.estados).length) return null;
  const tracker = await trackerAtualizado(cargo.ele, ab, cargo.federal ? fotoCandidatos(dados.nacional, dados.estados.zz) : null);
  const p = montarPainel({ cargoKey, ...dados, ab, tracker, inicio: INICIO });
  p.armazenamento = store.tipo;
  p.versao = versaoDe(ab, dados.nacional);
  return p;
}

// O último painel bom de cada cargo fica guardado: se o TSE limitar ou cair, ele é servido
// (marcado como desatualizado) em vez de um erro.
const versaoGuardada = {};
const memoPainel = {}; // cargo -> { valor, em } ou { promessa }: protege Redis e TSE de rajadas
export function obterPainel(cargoKey) {
  const m = memoPainel[cargoKey];
  if (m?.promessa) return m.promessa;
  if (m && Date.now() - m.em < 4000) return Promise.resolve(m.valor);
  const promessa = obterPainelAgora(cargoKey).then(
    (valor) => {
      memoPainel[cargoKey] = { valor, em: Date.now() };
      return valor;
    },
    (err) => {
      delete memoPainel[cargoKey];
      throw err;
    },
  );
  memoPainel[cargoKey] = { promessa };
  return promessa;
}

async function obterPainelAgora(cargoKey) {
  const chave = `apuracao2026:painel:${cargoKey}`;
  try {
    const p = await montarPainelAtual(cargoKey);
    if (p && versaoGuardada[cargoKey] !== p.versao) {
      versaoGuardada[cargoKey] = p.versao;
      store.set(chave, p).catch(() => {});
    }
    if (p) return p;
  } catch (err) {
    console.error('[painel] TSE indisponível:', err.message);
  }
  const guardado = await store.get(chave).catch(() => null);
  if (!guardado) return null;
  return { ...guardado, servidor: { erro: 'TSE indisponível no momento; exibindo a última atualização recebida.' } };
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
  projetado: !!c.projetado,
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
        quociente: e.quociente,
        final: e.final,
        secoes: e.secoes,
        votos: e.votos,
        fotoBase: urls.foto(cargo.ele, uf, '{sq}'),
        total: e.candidatos.length,
        candidatos: e.candidatos.map((c, i) => compacto(c, uf, i + 1)),
        partidos: e.partidos.map((p) => ({ sigla: p.sigla, nome: p.nome, votos: p.votos, eleitos: p.eleitos, candidatos: p.candidatos })),
      },
    };
  }
  const termo = semAcento((q || '').trim()).slice(0, 60);
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

// ---------------------------------------------------------------- partidos (todos os cargos)
let partidosMemo = { chave: null, valor: null, em: 0 };
let partidosEmVoo = null;
function calcularPartidos() {
  if (partidosMemo.valor && Date.now() - partidosMemo.em < 8000) return Promise.resolve(partidosMemo.valor);
  partidosEmVoo ||= calcularPartidosAgora().finally(() => (partidosEmVoo = null));
  return partidosEmVoo;
}

// Todos os cargos de uma vez (usado por partidos e eleitos). "chave" muda quando algum arquivo muda.
async function carregarTodos() {
  const keys = ['presidente', 'governador', 'senado', 'camara', 'assembleia'];
  const lidos = await Promise.all(keys.map((k) => carregarCargo(CARGOS[k])));
  const dados = Object.fromEntries(keys.map((k, i) => [k, lidos[i]]));
  const chave = keys.map((k) => [dados[k].nacional?.idg, ...Object.values(dados[k].estados).map((e) => e.idg)].join(',')).join('|');
  return { dados, chave };
}

async function calcularPartidosAgora() {
  // Recalcula só quando algum arquivo mudou (os objetos normalizados são reaproveitados no 304).
  const { dados, chave } = await carregarTodos();
  if (partidosMemo.chave !== chave) partidosMemo = { chave, valor: montarPartidos(dados), em: Date.now() };
  else partidosMemo.em = Date.now();
  return partidosMemo.valor;
}

export async function obterPartidos() {
  return { status: 200, body: { atualizadoEm: Date.now(), ...resumoPartidos(await calcularPartidos()) } };
}

export async function obterPartido(sigla) {
  const todos = await calcularPartidos();
  const alvo = (sigla || '').trim().toUpperCase();
  const p = todos.partidos.find((x) => x.sigla.toUpperCase() === alvo);
  if (!p) return { status: 404, body: { erro: 'Partido não encontrado.' } };
  return { status: 200, body: { atualizadoEm: Date.now(), totais: todos.totais, vagas: todos.vagas, partido: p } };
}

// ---------------------------------------------------------------- eleitos
let eleitosMemo = { chave: null, valor: null, em: 0 };
let eleitosEmVoo = null;
export function obterEleitos() {
  if (eleitosMemo.valor && Date.now() - eleitosMemo.em < 8000) return Promise.resolve({ status: 200, body: eleitosMemo.valor });
  eleitosEmVoo ||= (async () => {
    const { dados, chave } = await carregarTodos();
    if (eleitosMemo.chave !== chave) eleitosMemo = { chave, valor: { atualizadoEm: Date.now(), ...montarEleitos(dados) }, em: Date.now() };
    else eleitosMemo.em = Date.now();
    return { status: 200, body: eleitosMemo.valor };
  })().finally(() => (eleitosEmVoo = null));
  return eleitosEmVoo;
}

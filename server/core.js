// Núcleo sem estado próprio: busca os arquivos do TSE sob demanda (com cache por ETag
// enquanto a instância estiver ativa) e monta as respostas da API. Serve tanto às funções
// serverless da Vercel (api/) quanto ao servidor local (server/index.js).
import { UFS, CARGOS, UF_BY_CODE } from '../public/js/ufs.js';
import { atribuirCores } from '../public/js/colors.js';
import { fetchJson, urls } from './tse.js';
import { parseUnificado, parseAcompanhamento } from './normalize.js';
import { montarPainel } from './dashboard.js';
import { Tracker } from './tracker.js';
import { store } from './store.js';
import { mapLimit } from './util.js';

// Códigos de eleição do TSE. Para o 2º turno (25/10) use TSE_ELE_FEDERAL=6258 e TSE_ELE_ESTADUAL=6260.
if (process.env.TSE_ELE_FEDERAL) CARGOS.presidente.ele = process.env.TSE_ELE_FEDERAL;
if (process.env.TSE_ELE_ESTADUAL) for (const k of ['governador', 'senado', 'camara']) CARGOS[k].ele = process.env.TSE_ELE_ESTADUAL;

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

async function carregarCargo(cargo) {
  const ufs = cargo.federal ? [...UF_LIST, 'zz'] : UF_LIST;
  const estados = {};
  await mapLimit(ufs, 10, async (uf) => {
    const e = await load(urls.unificado(cargo.ele, cargo.cd, uf), (d) => parseUnificado(d, { foto: fotoDe(cargo, uf) }));
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
  const { data } = await fetchJson(urls.unificado(cargo.ele, cargo.cd, uf, mun));
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
      cargo: cargo.nome,
      uf,
      municipio: nome || mun,
      candidatos: r.candidatos.slice(0, 40).map((c) => ({ ...c, cor: cores[c.n] || '#94a3b8' })),
      partidos: r.partidos?.slice(0, 40) || [],
    },
  };
}

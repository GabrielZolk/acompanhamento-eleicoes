// Resultado resumido de todos os municípios de uma UF, para o mapa "por cidade".
//
// O TSE publica um arquivo por município e limita requisições por IP. Para não consultar
// milhares de arquivos a cada ciclo, usa-se o andamento da UF ({uf}-e{ele}-ab.json), que diz
// quantas seções cada município já totalizou: só é baixado o arquivo das cidades em que esse
// número mudou. Cidade sem seções não é consultada; cidade 100% apurada não muda mais.
// O agregado da UF fica no armazenamento compartilhado (Redis na Vercel) com trava, para que
// várias instâncias não repitam o trabalho.
import { CARGOS, UF_BY_CODE, cdDoCargo } from '../public/js/ufs.js';
import { fetchJson, urls, stats, comLimite, frear, pausado } from './tse.js';
import { store } from './store.js';
import { num, int, mapLimit } from './util.js';

const FRESCO_MS = 90e3;
const PRAZO_MS = 20e3; // cada chamada trabalha no máximo isso; o resto fica para a próxima

function resumir(raw) {
  const cands = [];
  for (const agr of raw.carg?.[0]?.agr || []) for (const par of agr.par || []) for (const c of par.cand || []) {
    cands.push([c.n, num(c.pvap), par.sg, int(c.vap)]);
  }
  cands.sort((a, b) => b[3] - a[3]);
  return { a: num(raw.s?.pst), v: int(raw.v?.vv), c: cands.slice(0, 3).map(([n, p, sg]) => [n, p, sg]) };
}

async function baixarResumo(url) {
  if (pausado('baixa')) return null;
  stats.requests++;
  try {
    const res = await comLimite(() => fetch(url, { headers: { 'User-Agent': 'apuracao-2026-painel/1.0' }, signal: AbortSignal.timeout(12000) }), {
      prioridade: 'baixa',
    });
    if (res.status === 429) frear(res);
    if (!res.ok) return null;
    return resumir(await res.json());
  } catch {
    stats.errors++;
    return null;
  }
}

const listas = new Map(); // ele -> { at, porUF: { uf: { cd: { cdi, nm } } } }
async function municipiosDaEleicao(ele) {
  const l = listas.get(ele);
  if (l && Date.now() - l.at < 3600e3) return l.porUF;
  const { data } = await fetchJson(urls.municipios(ele));
  const porUF = {};
  for (const abr of data?.abr || []) {
    porUF[abr.cd.toLowerCase()] = Object.fromEntries((abr.mu || []).map((m) => [m.cd, { cdi: m.cdi, nm: m.nm }]));
  }
  listas.set(ele, { at: Date.now(), porUF });
  return porUF;
}

async function ler(chave) {
  try {
    return await store.get(chave);
  } catch {
    return null;
  }
}

const memo = new Map(); // chave -> { body, em } | { promessa }

export function obterMapaMunicipios(args) {
  const cargo = CARGOS[args.cargo];
  const uf = (args.uf || '').toLowerCase();
  const chave = `${args.cargo}:${uf}`;
  const m = memo.get(chave);
  if (m?.promessa) return m.promessa;
  if (m && Date.now() - m.em < (m.body?.body?.parcial ? 8e3 : 30e3)) return Promise.resolve(m.body);
  if (!cargo || !UF_BY_CODE[uf]) return obterMapaMunicipiosAgora(args);
  const promessa = obterMapaMunicipiosAgora(args).then(
    (body) => {
      memo.set(chave, { body, em: Date.now() });
      return body;
    },
    (err) => {
      memo.delete(chave);
      throw err;
    },
  );
  memo.set(chave, { promessa });
  return promessa;
}

async function obterMapaMunicipiosAgora({ cargo: cargoKey, uf }) {
  const cargo = CARGOS[cargoKey];
  uf = (uf || '').toLowerCase();
  if (!cargo || cargo.proporcional) return { status: 400, body: { erro: 'Mapa por cidade disponível para Presidente, Governador e Senado.' } };
  if (!UF_BY_CODE[uf] || uf === 'zz') return { status: 400, body: { erro: 'UF inválida.' } };

  const chave = `apuracao2026:mun:${cargo.ele}:${cargo.cd}:${uf}`;
  const guardado = await ler(chave);
  const fresco = guardado && !guardado.parcial && Date.now() - guardado.geradoEm < FRESCO_MS;
  if (guardado && (fresco || pausado('baixa') || !(await store.travar(`${chave}:trava`, 60).catch(() => true)))) {
    return { status: 200, body: publico(guardado) };
  }

  const [lista, abResp] = await Promise.all([
    municipiosDaEleicao(cargo.ele),
    fetchJson(urls.acompanhamento(cargo.ele, uf)),
  ]);
  const doUF = lista[uf] || {};
  const ab = abResp.data;
  const municipios = { ...(guardado?.municipios || {}) };
  const st = { ...(guardado?.st || {}) }; // seções totalizadas na última vez que o arquivo da cidade foi lido
  const mudaram = [];
  for (const a of ab?.abr || []) {
    if (a.tpabr !== 'mun') continue;
    const m = doUF[a.cdabr];
    if (!m) continue;
    const apuradas = int(a.s?.st);
    if (apuradas === 0) {
      municipios[m.cdi] = { cd: a.cdabr, nm: m.nm, a: 0, v: 0, c: [] };
      st[m.cdi] = 0;
    } else if (st[m.cdi] !== apuradas || !municipios[m.cdi]?.c?.length) {
      mudaram.push({ cd: a.cdabr, cdi: m.cdi, nm: m.nm, apuradas });
    }
  }
  const cd = cdDoCargo(cargo, uf);
  const prazo = Date.now() + PRAZO_MS;
  let pendentes = 0;
  await mapLimit(mudaram, 8, async (m) => {
    if (Date.now() > prazo || pausado('baixa')) return void pendentes++;
    const r = await baixarResumo(urls.unificado(cargo.ele, cd, uf, m.cd));
    if (r) {
      municipios[m.cdi] = { cd: m.cd, nm: m.nm, ...r };
      st[m.cdi] = m.apuradas;
    }
  });

  const agregado = { uf, cargo: cargo.nome, geradoEm: Date.now(), consultadas: mudaram.length - pendentes, parcial: pendentes > 0, municipios, st };
  try {
    await store.set(chave, agregado);
  } catch {
    /* sem armazenamento compartilhado: segue só com o cache de borda */
  }
  return { status: 200, body: publico(agregado) };
}

const publico = ({ st, ...resto }) => resto;

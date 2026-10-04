// Converte os JSONs "unificados" (-u.json) e de acompanhamento (-ab.json) do TSE
// para o modelo usado pelo painel.
import { num, int, parseTseDate } from './util.js';

const pctOf = (part, total) => (total > 0 ? (part / total) * 100 : 0);

export function parseSecoes(s = {}) {
  const total = int(s.ts), apuradas = int(s.st);
  return { total, apuradas, pct: num(s.pst) || pctOf(apuradas, total) };
}

export function parseEleitorado(e = {}) {
  return {
    total: int(e.te),
    comparecimento: int(e.c),
    pctComparecimento: num(e.pc),
    abstencao: int(e.a),
    pctAbstencao: num(e.pa),
  };
}

export function parseVotos(v = {}) {
  const total = int(v.tv), validos = int(v.vv), brancos = int(v.vb), nulos = int(v.tvn);
  return {
    total,
    validos,
    pctValidos: num(v.pvv) || pctOf(validos, total),
    brancos,
    pctBrancos: num(v.pvb) || pctOf(brancos, total),
    nulos,
    pctNulos: num(v.ptvn) || pctOf(nulos, total),
  };
}

const tipoAgremiacao = { c: 'Coligação', f: 'Federação', i: 'Partido isolado' };

export function parseUnificado(raw, { foto } = {}) {
  if (!raw?.carg?.length) return null;
  const carg = raw.carg[0];
  const candidatos = [];
  const partidos = [];
  for (const agr of carg.agr || []) {
    for (const par of agr.par || []) {
      const cands = par.cand || [];
      const nominais = cands.reduce((s, c) => s + int(c.vap), 0);
      partidos.push({
        n: par.n,
        sigla: par.sg,
        nome: par.nm,
        federacao: par.nfed || null,
        agremiacao: agr.nm,
        votos: (int(par.tvtn) || nominais) + int(par.tvtl),
        legenda: int(par.tvtl),
        candidatos: cands.length,
        eleitos: cands.filter((c) => c.e === 's').length,
      });
      for (const c of cands) {
        const vice = c.vs?.[0];
        candidatos.push({
          n: c.n,
          sq: c.sqcand,
          nome: c.nmu,
          nomeCompleto: c.nm,
          partido: par.sg,
          agremiacao: agr.tp === 'i' ? null : { tipo: tipoAgremiacao[agr.tp] || agr.tp, nome: agr.nm, composicao: agr.com },
          votos: int(c.vap),
          pct: num(c.pvap),
          eleito: c.e === 's',
          situacao: c.st || '',
          seq: int(c.seq),
          vice: vice ? { nome: vice.nmu, partido: vice.sgp, tipo: vice.tp } : null,
          foto: foto ? foto(c.sqcand) : null,
        });
      }
    }
  }
  candidatos.sort((a, b) => b.votos - a.votos || a.seq - b.seq);
  partidos.sort((a, b) => b.votos - a.votos || a.sigla.localeCompare(b.sigla));
  return {
    ele: raw.ele,
    turno: int(raw.t),
    abrangencia: raw.cdabr,
    cargo: { cd: int(carg.cd), nome: carg.nmn, vagas: int(carg.nv) || 1 },
    geradoEm: parseTseDate(raw.dg, raw.hg),
    totalizadoEm: parseTseDate(raw.dt, raw.ht),
    final: raw.tf === 's',
    secoes: parseSecoes(raw.s),
    eleitorado: parseEleitorado(raw.e),
    votos: parseVotos(raw.v),
    candidatos,
    partidos,
  };
}

export function parseAcompanhamento(raw) {
  if (!raw?.abr) return null;
  const ufs = {};
  let br = null;
  for (const a of raw.abr) {
    const item = {
      secoes: parseSecoes(a.s),
      eleitorado: parseEleitorado(a.e),
      totalizadoEm: parseTseDate(a.dt, a.ht),
    };
    if (a.tpabr === 'br') br = item;
    else ufs[a.cdabr.toLowerCase()] = item;
  }
  return { ele: raw.ele, geradoEm: parseTseDate(raw.dg, raw.hg), br, ufs };
}

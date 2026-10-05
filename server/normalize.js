// Converte os JSONs "unificados" (-u.json) e de acompanhamento (-ab.json) do TSE
// para o modelo usado pelo painel.
import { num, int, parseTseDate } from './util.js';
import { marcarGarantidos } from './garantia.js';

const pctOf = (part, total) => (total > 0 ? (part / total) * 100 : 0);

export function parseSecoes(s = {}) {
  const total = int(s.ts), apuradas = int(s.st);
  return { total, apuradas, pct: num(s.pst) || pctOf(apuradas, total) };
}

export function parseEleitorado(e = {}) {
  return {
    total: int(e.te),
    apurado: int(e.est), // eleitorado das seções já totalizadas
    comparecimento: int(e.c),
    pctComparecimento: num(e.pc),
    abstencao: int(e.a),
    pctAbstencao: num(e.pa),
  };
}

export function parseVotos(v = {}) {
  const total = int(v.tv), validos = int(v.vv), brancos = int(v.vb), nulos = int(v.tvn);
  // Percentuais calculados sobre o total de votos: o "pvv" do TSE não usa essa base
  // (veio 100,00% com 96% de válidos na apuração de 2026).
  return {
    total,
    validos,
    pctValidos: total ? pctOf(validos, total) : num(v.pvv),
    brancos,
    pctBrancos: total ? pctOf(brancos, total) : num(v.pvb),
    nulos,
    pctNulos: total ? pctOf(nulos, total) : num(v.ptvn),
  };
}

const tipoAgremiacao = { c: 'Coligação', f: 'Federação', i: 'Partido isolado' };

// O TSE marca e = "s" também em quem vai ao 2º turno (com st = "2º turno"): eleito é só o resto.
const eleitoTSE = (c) => c.e === 's' && !/2º turno/i.test(c.st || '');

// garantia: marca quem já tem a vitória matematicamente garantida (só no resultado de um lugar
// inteiro — país ou UF —, nunca no de um município).
export function parseUnificado(raw, { foto, garantia = false } = {}) {
  if (!raw?.carg?.length) return null;
  const carg = raw.carg[0];
  const candidatos = [];
  const partidos = [];
  const agremiacoes = [];
  for (const agr of carg.agr || []) {
    // Vagas que o TSE atribui à agremiação (partido ou federação) com os votos apurados até agora.
    if (agr.vag !== undefined && carg.qe) {
      agremiacoes.push({
        nome: agr.nm,
        sigla: (agr.com || agr.par?.[0]?.sg || '').replace(/\s*\/\s*/g, '/'),
        tipo: tipoAgremiacao[agr.tp] || agr.tp,
        vagas: int(agr.vag),
        partidos: (agr.par || []).map((p) => p.sg),
        votos: (agr.par || []).reduce((s, p) => s + int(p.tvtn) + int(p.tvtl), 0),
      });
    }
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
        eleitos: cands.filter(eleitoTSE).length,
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
          agr: agr.n,
          votos: int(c.vap),
          pct: num(c.pvap),
          eleito: eleitoTSE(c),
          situacao: c.st || '',
          destino: c.dvt || '', // destinação do voto: "Válido" ou "Anulado sub judice"
          seq: int(c.seq),
          vice: vice ? { nome: vice.nmu, partido: vice.sgp, tipo: vice.tp } : null,
          foto: foto ? foto(c.sqcand) : null,
        });
      }
    }
  }
  candidatos.sort((a, b) => b.votos - a.votos || a.seq - b.seq);
  partidos.sort((a, b) => b.votos - a.votos || a.sigla.localeCompare(b.sigla));

  // Eleição proporcional: dentro de cada agremiação, as vagas vão para os mais votados da lista.
  // Antes do fim da totalização isso é uma projeção ("projetado"); depois o TSE marca os eleitos.
  if (agremiacoes.length) {
    const vagasPorAgr = Object.fromEntries((carg.agr || []).map((a) => [a.n, int(a.vag)]));
    const usadas = {};
    // Com os eleitos já marcados pelo TSE não há projeção: eles podem diferir dos mais votados de cada
    // agremiação (Assembleia de MS em 2026: um dos mais votados não foi eleito) e, somando os dois,
    // as cadeiras passariam do número de vagas.
    const oficial = candidatos.some((c) => c.eleito);
    for (const c of candidatos) {
      if (!oficial && c.votos > 0 && (usadas[c.agr] || 0) < (vagasPorAgr[c.agr] || 0)) {
        usadas[c.agr] = (usadas[c.agr] || 0) + 1;
        c.projetado = true;
      }
    }
    const cadeiras = {};
    for (const c of candidatos) if (c.eleito || c.projetado) cadeiras[c.partido] = (cadeiras[c.partido] || 0) + 1;
    for (const p of partidos) p.cadeiras = cadeiras[p.sigla] || 0;
    agremiacoes.sort((a, b) => b.vagas - a.vagas || b.votos - a.votos);
  }
  const lugar = {
    ele: raw.ele,
    turno: int(raw.t),
    abrangencia: raw.cdabr,
    cargo: { cd: int(carg.cd), nome: carg.nmn, vagas: int(carg.nv) || 1 },
    geradoEm: parseTseDate(raw.dg, raw.hg),
    idg: raw.idg || null,
    totalizadoEm: parseTseDate(raw.dt, raw.ht),
    final: raw.tf === 's',
    secoes: parseSecoes(raw.s),
    eleitorado: parseEleitorado(raw.e),
    votos: parseVotos(raw.v),
    candidatos,
    partidos,
    agremiacoes,
    quociente: int(carg.qe) || null,
  };
  return garantia ? marcarGarantidos(lugar) : lugar;
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
  return { ele: raw.ele, geradoEm: parseTseDate(raw.dg, raw.hg), idg: raw.idg || null, br, ufs };
}

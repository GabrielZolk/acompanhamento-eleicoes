// Eleitos por lugar e cargo. Usa a marcação oficial do TSE (eleito / 2º turno) quando a
// totalização termina; antes disso, quem já tem a vitória matematicamente garantida (garantia.js)
// e, nos demais, quem lidera ou está dentro das vagas, como provisório.
import { UFS } from '../public/js/ufs.js';

const UF_LIST = UFS.map((u) => u.uf);
const resumo = (c, pos) => ({ n: c.n, nome: c.nome, partido: c.partido, votos: c.votos, pct: c.pct, pos, foto: c.foto, garantido: c.garantido || null });
const segundoTurno = (c) => /2º turno/i.test(c.situacao || '');

function majoritario(e) {
  const vagas = e.cargo.vagas || 1;
  const cands = e.candidatos;
  const eleitos = cands.filter((c) => c.eleito).map((c) => resumo(c, cands.indexOf(c) + 1));
  const turno = cands.filter(segundoTurno).map((c) => resumo(c, cands.indexOf(c) + 1));
  const apurou = e.secoes.apuradas > 0 && cands[0]?.votos > 0;
  return {
    secoes: e.secoes,
    final: e.final,
    vagas,
    eleitos,
    segundoTurno: turno,
    haveraSegundoTurno: !!e.haveraSegundoTurno, // certo pela conta, antes da marcação do TSE
    lideres: apurou ? cands.slice(0, Math.max(2, vagas)).map((c, i) => resumo(c, i + 1)) : [],
  };
}

function proporcional(e) {
  const cands = e.candidatos;
  const eleitos = cands.filter((c) => c.eleito);
  // Sem fotos aqui: são até 1.572 deputados, e a lista só precisa de nome, partido e votos.
  const lista = (eleitos.length ? eleitos : cands.filter((c) => c.projetado)).map((c) => ({ n: c.n, nome: c.nome, partido: c.partido, votos: c.votos, pct: c.pct, oficial: !!c.eleito }));
  return { secoes: e.secoes, final: e.final, vagas: e.cargo.vagas, oficiais: eleitos.length, lista };
}

// dados: { presidente: { nacional, estados }, governador: { estados }, ... }
export function montarEleitos(dados) {
  const out = {};
  const nac = dados.presidente?.nacional;
  out.presidente = nac ? majoritario(nac) : null;
  for (const key of ['governador', 'senado', 'camara', 'assembleia']) {
    const estados = {};
    for (const uf of UF_LIST) {
      const e = dados[key]?.estados?.[uf];
      if (!e) continue;
      estados[uf] = key === 'camara' || key === 'assembleia' ? proporcional(e) : majoritario(e);
    }
    out[key] = { estados };
  }
  return out;
}

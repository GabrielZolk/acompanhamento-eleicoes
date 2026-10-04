// Projeção do resultado (estimativa). Em cada estado, supõe que as seções que faltam votem
// como as já apuradas naquele estado; as projeções dos estados são somadas.
// Não é resultado oficial: regiões apuradas mais tarde podem votar diferente.
const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);

export function projetarResultado(d) {
  if (!d?.cargo?.federal || !d.nacional?.candidatos?.length) return null;
  const proj = {};
  let validosProj = 0, eleitores = 0, faltam = 0, eleitoresComDados = 0;
  const semDados = [];
  for (const [uf, e] of Object.entries(d.estados || {})) {
    if (uf === 'zz' && d.semExterior) continue;
    const total = e.eleitorado?.total || 0;
    const apurado = e.eleitorado?.apurado || 0;
    eleitores += total;
    faltam += Math.max(0, total - apurado);
    if (!e.votos?.validos || !apurado) {
      semDados.push(total);
      continue;
    }
    const fator = total / apurado;
    eleitoresComDados += total;
    validosProj += e.votos.validos * fator;
    for (const c of e.candidatos) proj[c.n] = (proj[c.n] || 0) + c.votos * fator;
  }
  if (!validosProj) return null;
  // Estados sem nenhuma seção apurada: entram com o comportamento médio dos demais.
  const extra = semDados.reduce((s, t) => s + t, 0) * (validosProj / (eleitoresComDados || 1));
  if (extra) {
    const base = validosProj;
    for (const n of Object.keys(proj)) proj[n] += (proj[n] / base) * extra;
    validosProj += extra;
  }
  const candidatos = d.nacional.candidatos
    .map((c) => ({ n: c.n, nome: c.nome, cor: c.cor, atual: c.pct, projetado: pct(proj[c.n] || 0, validosProj) }))
    .sort((a, b) => b.projetado - a.projetado);
  const [a, b] = candidatos;
  return {
    candidatos,
    faltam: pct(faltam, eleitores),
    validosProjetados: Math.round(validosProj),
    venceNo1oTurno: a.projetado > 50 ? a : null,
    segundoTurno: a.projetado > 50 ? null : [a, b],
  };
}

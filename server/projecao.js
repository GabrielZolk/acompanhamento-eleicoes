// Projeção por cidade (estimativa). Cada cidade é projetada pelo próprio resultado parcial:
// votos válidos apurados × (eleitorado total ÷ eleitorado das seções apuradas). Cidades sem
// nenhuma seção apurada (ou ainda não lidas) entram com o padrão do estado. Assim a projeção
// leva em conta quais cidades ainda faltam, em vez de supor que o estado inteiro vota igual.

// estado: dados normalizados da UF (parseUnificado); agregado: saída de obterMapaMunicipios.
export function projetarUF(estado, agregado) {
  const proj = {};
  let validos = 0, eleitores = 0, cobertos = 0;
  const total = estado.eleitorado?.total || 0;
  const apurado = estado.eleitorado?.apurado || 0;
  const taxa = apurado ? (estado.votos?.validos || 0) / apurado : 0; // votos válidos por eleitor
  const partes = Object.fromEntries((estado.candidatos || []).map((c) => [c.n, (c.pct || 0) / 100]));
  const pelaMedia = (t) => {
    const vv = t * taxa;
    validos += vv;
    for (const [n, s] of Object.entries(partes)) proj[n] = (proj[n] || 0) + vv * s;
  };
  for (const m of Object.values(agregado?.municipios || {})) {
    const t = m.t || 0;
    if (!t) continue;
    eleitores += t;
    if (m.v > 0 && m.ea > 0 && m.c?.length) {
      const vv = m.v * (t / m.ea);
      validos += vv;
      for (const [n, p] of m.c) proj[n] = (proj[n] || 0) + (vv * p) / 100;
      cobertos += t;
    } else {
      pelaMedia(t);
    }
  }
  // Eleitores de cidades que ainda não estão no agregado: padrão do estado.
  if (total > eleitores) pelaMedia(total - eleitores);
  return { proj, validos, eleitores: Math.max(total, eleitores), cobertos, faltam: Math.max(0, total - apurado) };
}

// Soma várias projeções de UF e monta a lista de candidatos com percentual atual e projetado.
export function consolidar(partes, candidatos) {
  const proj = {};
  let validos = 0, eleitores = 0, cobertos = 0, faltam = 0;
  for (const p of partes) {
    validos += p.validos;
    eleitores += p.eleitores;
    cobertos += p.cobertos;
    faltam += p.faltam;
    for (const [n, v] of Object.entries(p.proj)) proj[n] = (proj[n] || 0) + v;
  }
  const lista = candidatos
    .map((c) => ({ n: c.n, nome: c.nome, partido: c.partido, atual: c.pct, projetado: validos ? ((proj[c.n] || 0) / validos) * 100 : 0 }))
    .sort((a, b) => b.projetado - a.projetado);
  return {
    candidatos: lista,
    faltam: eleitores ? (faltam / eleitores) * 100 : 0,
    cobertura: eleitores ? (cobertos / eleitores) * 100 : 0,
    validosProjetados: Math.round(validos),
  };
}

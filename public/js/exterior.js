// O resultado nacional publicado pelo TSE já inclui o exterior (abrangência "zz").
// Com "Incluir exterior" desmarcado, o exterior é subtraído do total nacional.

const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);

export function nacionalSemExterior(d) {
  const n = d.nacional;
  const zz = d.estados.zz;
  if (!zz) return n;
  const secoes = {
    total: n.secoes.total - (zz.secoes?.total || 0),
    apuradas: n.secoes.apuradas - (zz.secoes?.apuradas || 0),
  };
  secoes.pct = pct(secoes.apuradas, secoes.total);
  let eleitorado = null;
  if (n.eleitorado) {
    const z = zz.eleitorado || {};
    const comparecimento = (n.eleitorado.comparecimento || 0) - (z.comparecimento || 0);
    const abstencao = (n.eleitorado.abstencao || 0) - (z.abstencao || 0);
    eleitorado = {
      ...n.eleitorado,
      total: n.eleitorado.total - (z.total || 0),
      comparecimento,
      abstencao,
      pctComparecimento: pct(comparecimento, comparecimento + abstencao),
      pctAbstencao: pct(abstencao, comparecimento + abstencao),
    };
  }
  if (!zz.votos || !n.votos) return { ...n, secoes, eleitorado };

  const v = n.votos, z = zz.votos;
  const total = v.total - z.total, validos = v.validos - z.validos, brancos = v.brancos - z.brancos, nulos = v.nulos - z.nulos;
  const votosZZ = Object.fromEntries(zz.candidatos.map((c) => [c.n, c.votos]));
  const candidatos = n.candidatos
    .map((c) => {
      const votos = c.votos - (votosZZ[c.n] || 0);
      return { ...c, votos, pct: pct(votos, validos) };
    })
    .sort((a, b) => b.votos - a.votos || a.seq - b.seq);
  return {
    ...n,
    secoes,
    eleitorado,
    votos: {
      total, validos, brancos, nulos,
      pctValidos: pct(validos, total),
      pctBrancos: pct(brancos, total),
      pctNulos: pct(nulos, total),
    },
    candidatos,
  };
}

// Dados como devem ser exibidos, de acordo com o checkbox.
export function vistaExterior(d, incluir) {
  if (!d || !d.cargo.federal || incluir) return d;
  return {
    ...d,
    semExterior: true,
    nacional: nacionalSemExterior(d),
    historico: d.historico.map((p) => ({ ...p, pct: p.pctSE ?? p.pct, c: p.cSE ?? p.c })),
    atualizacoes: d.atualizacoes.filter((u) => u.uf !== 'zz'),
    eleitorado2022: d.eleitorado2022 - (d.eleitorado2022Exterior || 0),
  };
}

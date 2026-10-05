// Monta o payload consumido pelo navegador a partir dos dados normalizados.
import { UFS, REGIOES, CARGOS, ELEITORADO_2022, ELEITORADO_2022_EXTERIOR } from '../public/js/ufs.js';
import { atribuirCores, corPartido, PALETA } from '../public/js/colors.js';
import { calcularPrevisao } from '../public/js/previsao.js';

const UF_LIST = UFS.map((u) => u.uf);
const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);
const MAX_SEGMENTOS = 4;

export function montarPainel({ cargoKey, nacional, estados, ab, tracker, inicio }) {
  const cargo = CARGOS[cargoKey];
  const base = {
    cargo: { key: cargo.key, cd: cargo.cd, nome: cargo.nome, titulo: cargo.titulo, federal: cargo.federal, proporcional: !!cargo.proporcional },
    turno: nacional?.turno || Object.values(estados)[0]?.turno || 1,
    eleitorado2022: ELEITORADO_2022,
    eleitorado2022Exterior: ELEITORADO_2022_EXTERIOR,
    inicio,
    historico: tracker.historico.map(({ t, pct, pctSE, c, cSE }) => ({ t, pct, pctSE: pctSE ?? pct, ...(c ? { c, cSE } : {}) })),
    atualizacoes: tracker.atualizacoes,
    previsao: calcularPrevisao(tracker.historico),
    geradoEm: Date.now(),
  };
  const corpo = cargo.federal
    ? painelPresidente({ nacional, estados, ab })
    : painelEstadual({ cargo, estados, ab });
  return { ...base, ...corpo, ...horarios({ cargo, nacional, estados, ab }) };
}

// O TSE às vezes para de republicar o resultado (-u.json) enquanto o andamento (-ab.json) segue
// mudando. Por isso os dois horários vão separados: o cabeçalho mostra o do resultado e avisa quando
// ele está parado. "atualizadoEm" (o mais novo dos dois) continua no payload por compatibilidade.
function horarios({ cargo, nacional, estados, ab }) {
  const resultadoEm = cargo.federal
    ? nacional?.geradoEm
    : Math.max(0, ...UF_LIST.map((uf) => estados[uf]?.geradoEm || 0));
  return { resultadoEm: resultadoEm || null, andamentoEm: ab?.geradoEm || null };
}

function status(secoes, final) {
  if (final) return 'finalizado';
  return secoes?.apuradas > 0 ? 'apurando' : 'aguardando';
}

function segmentos(ordem, votosPorChave, validos, cores, rotulos, max = MAX_SEGMENTOS) {
  const segs = [];
  let usado = 0;
  for (const key of ordem.slice(0, max)) {
    const v = votosPorChave[key] || 0;
    usado += v;
    segs.push({ key, label: rotulos[key], votos: v, pct: pct(v, validos), cor: cores[key] });
  }
  const resto = Math.max(0, validos - usado);
  if (validos > 0) segs.push({ key: 'outros', label: 'Outros', votos: resto, pct: pct(resto, validos), cor: null });
  return segs;
}

function secoesDe(uf, estados, ab) {
  return estados[uf]?.secoes || ab?.ufs?.[uf]?.secoes || { total: 0, apuradas: 0, pct: 0 };
}

function painelPresidente({ nacional, estados, ab }) {
  const candidatos = nacional?.candidatos || [];
  const cores = atribuirCores(candidatos.map((c) => ({ key: c.n, partido: c.partido })));
  const est = {};
  for (const uf of [...UF_LIST, 'zz']) {
    const e = estados[uf];
    if (!e) {
      if (ab?.ufs?.[uf]) est[uf] = { secoes: ab.ufs[uf].secoes, eleitorado: ab.ufs[uf].eleitorado, votos: null, candidatos: [], lider: null };
      continue;
    }
    const top = e.candidatos[0];
    est[uf] = {
      secoes: e.secoes,
      eleitorado: e.eleitorado,
      votos: e.votos,
      geradoEm: e.geradoEm,
      candidatos: e.candidatos.map((c) => ({ n: c.n, votos: c.votos, pct: c.pct })),
      lider: e.secoes.apuradas > 0 && top?.votos > 0 ? top.n : null,
    };
  }

  const ordem = candidatos.map((c) => c.n);
  const rotulos = Object.fromEntries(candidatos.map((c) => [c.n, c.nome]));
  const regioes = REGIOES.map((r) => {
    const ufs = UFS.filter((u) => u.regiao === r.id).map((u) => u.uf);
    const votos = {};
    let validos = 0, total = 0, apuradas = 0;
    for (const uf of ufs) {
      const s = secoesDe(uf, estados, ab);
      total += s.total;
      apuradas += s.apuradas;
      const e = estados[uf];
      if (!e) continue;
      validos += e.votos.validos;
      for (const c of e.candidatos) votos[c.n] = (votos[c.n] || 0) + c.votos;
    }
    return {
      id: r.id,
      nome: r.nome,
      ufs,
      secoes: { total, apuradas, pct: pct(apuradas, total) },
      validos,
      segmentos: segmentos(ordem, votos, validos, cores, rotulos),
    };
  });

  const secoes = nacional?.secoes || ab?.br?.secoes || { total: 0, apuradas: 0, pct: 0 };
  return {
    status: status(secoes, nacional?.final),
    atualizadoEm: Math.max(nacional?.geradoEm || 0, ab?.geradoEm || 0) || null,
    totalizadoEm: nacional?.totalizadoEm || null,
    nacional: {
      secoes,
      eleitorado: nacional?.eleitorado || ab?.br?.eleitorado || null,
      votos: nacional?.votos || null,
      candidatos: candidatos.map((c) => ({ ...c, cor: cores[c.n] })),
      // 2º turno certo pela conta, antes da marcação do TSE (server/garantia.js): destaque do card.
      haveraSegundoTurno: !!nacional?.haveraSegundoTurno,
    },
    estados: est,
    regioes,
    cores,
  };
}

// Partido líder da UF (candidato mais votado ou, na Câmara, partido mais votado).
function liderDe(e, camara) {
  if (!e || !(e.secoes.apuradas > 0)) return null;
  if (camara) return e.partidos[0]?.votos > 0 ? e.partidos[0].sigla : null;
  return e.candidatos[0]?.votos > 0 ? e.candidatos[0].partido : null;
}

function painelEstadual({ cargo, estados, ab }) {
  const camara = !!cargo.proporcional; // deputados: o líder é o partido mais votado
  const est = {};

  // Cores por partido para o mapa inteiro: quem lidera mais estados escolhe primeiro e
  // tons parecidos (muitos partidos usam azul) são trocados por cores bem distintas.
  const votosNac = {};
  const bancadaNac = {};
  const lideres = {};
  for (const uf of UF_LIST) {
    const e = estados[uf];
    if (!e) continue;
    for (const p of e.partidos) votosNac[p.sigla] = (votosNac[p.sigla] || 0) + p.votos;
    const l = liderDe(e, camara);
    if (l) lideres[l] = (lideres[l] || 0) + 1;
  }
  const ordem = Object.keys(votosNac).sort((a, b) => votosNac[b] - votosNac[a]);
  const prioridade = [...ordem].sort((a, b) => (lideres[b] || 0) - (lideres[a] || 0) || votosNac[b] - votosNac[a]);
  const cores = {
    ...Object.fromEntries(ordem.map((s) => [s, corPartido(s)])),
    ...atribuirCores(prioridade.filter((s) => lideres[s]).map((s) => ({ key: s, partido: s })), { matiz: 24 }),
  };
  const corDe = (sigla) => cores[sigla] || corPartido(sigla);

  let validosNac = 0, totalNac = 0, brancosNac = 0, nulosNac = 0;
  let geradoEm = ab?.geradoEm || 0, final = UF_LIST.length > 0;
  // Visão "Brasil" do card da disputa: soma dos estados por partido e, nos proporcionais,
  // os deputados mais votados do país.
  const senado = cargo.key === 'senado';
  const partidosNac = {};
  let maisVotados = [];
  let candidatosNac = 0, vagasNac = 0, ufsNac = 0;

  for (const uf of UF_LIST) {
    const e = estados[uf];
    if (!e) {
      final = false;
      if (ab?.ufs?.[uf]) est[uf] = { secoes: ab.ufs[uf].secoes, eleitorado: ab.ufs[uf].eleitorado, votos: null, candidatos: [], partidos: [], lider: null };
      continue;
    }
    final = final && e.final;
    geradoEm = Math.max(geradoEm, e.geradoEm || 0);
    validosNac += e.votos.validos;
    totalNac += e.votos.total;
    brancosNac += e.votos.brancos;
    nulosNac += e.votos.nulos;

    // Dois candidatos do mesmo partido na mesma disputa (possível no Senado) não ficam com a mesma cor.
    const usadas = new Set();
    const corCand = (c) => {
      let cor = corDe(c.partido);
      if (usadas.has(cor)) cor = PALETA.find((p) => !usadas.has(p)) || cor;
      usadas.add(cor);
      return cor;
    };
    const lider = liderDe(e, camara);
    let partidos = [];
    let candidatos;
    if (camara) {
      partidos = e.partidos.map((p) => ({
        sigla: p.sigla,
        nome: p.nome,
        votos: p.votos,
        pct: pct(p.votos, e.votos.validos),
        eleitos: p.eleitos,
        cadeiras: p.cadeiras || 0,
        candidatos: p.candidatos,
        cor: corDe(p.sigla),
      }));
      for (const p of partidos) bancadaNac[p.sigla] = (bancadaNac[p.sigla] || 0) + p.cadeiras;
      // Só os mais votados vão no painel; a lista completa vem de /api/candidatos.
      candidatos = e.candidatos.slice(0, 10).map((c) => ({
        n: c.n, sq: c.sq, nome: c.nome, partido: c.partido, votos: c.votos, pct: c.pct,
        eleito: c.eleito, projetado: !!c.projetado, situacao: c.situacao, foto: c.foto, cor: corDe(c.partido),
      }));
    } else {
      candidatos = e.candidatos.map((c) => ({ ...c, cor: corCand(c) }));
    }
    est[uf] = {
      secoes: e.secoes,
      eleitorado: e.eleitorado,
      votos: e.votos,
      geradoEm: e.geradoEm,
      vagas: e.cargo.vagas,
      totalCandidatos: e.candidatos.length,
      eleitos: camara ? e.candidatos.filter((c) => c.eleito).length : undefined,
      quociente: camara ? e.quociente : undefined,
      agremiacoes: camara ? e.agremiacoes.filter((a) => a.vagas > 0).map((a) => ({ sigla: a.sigla, tipo: a.tipo, vagas: a.vagas, partidos: a.partidos })) : undefined,
      candidatos,
      partidos,
      lider,
    };

    ufsNac++; // no 2º turno de Governador só parte dos estados tem disputa
    candidatosNac += e.candidatos.length;
    vagasNac += e.cargo.vagas || 0;
    for (const p of e.partidos) {
      const t = (partidosNac[p.sigla] ||= { sigla: p.sigla, nome: p.nome, votos: 0, candidatos: 0, assentos: 0 });
      t.votos += p.votos;
      t.candidatos += p.candidatos;
      if (camara) t.assentos += p.cadeiras || 0;
    }
    if (camara) {
      // Os 10 mais votados de cada estado bastam para achar os 10 mais votados do país.
      maisVotados.push(...candidatos.map((c) => ({ ...c, uf })));
      maisVotados = maisVotados.sort((a, b) => b.votos - a.votos).slice(0, 10);
    } else if (e.secoes.apuradas > 0) {
      // Governador: partido do candidato que lidera o estado. Senado: partidos dentro das vagas agora.
      for (const c of e.candidatos.slice(0, senado ? e.cargo.vagas || 1 : 1)) {
        if (c.votos > 0 && partidosNac[c.partido]) partidosNac[c.partido].assentos++;
      }
    }
  }

  // Cadeiras projetadas (deputados), estados liderados (Governador) ou vagas ocupadas (Senado).
  const campoNac = camara ? 'cadeiras' : senado ? 'vagas' : 'lidera';
  const partidosBR = Object.values(partidosNac)
    .map(({ assentos, ...p }) => ({ ...p, pct: pct(p.votos, validosNac), [campoNac]: assentos, cor: corDe(p.sigla) }))
    .sort((a, b) => b[campoNac] - a[campoNac] || b.votos - a.votos || b.candidatos - a.candidatos || a.sigla.localeCompare(b.sigla));

  // Projeção de cadeiras no país (soma dos estados), com os votos apurados até agora.
  const bancadas = camara
    ? Object.entries(bancadaNac)
        .filter(([, n]) => n > 0)
        .map(([sigla, cadeiras]) => ({ sigla, cadeiras, votos: votosNac[sigla] || 0, cor: corDe(sigla) }))
        .sort((a, b) => b.cadeiras - a.cadeiras || b.votos - a.votos)
    : undefined;

  const rotulos = Object.fromEntries(ordem.map((s) => [s, s]));
  const regioes = REGIOES.map((r) => {
    const ufs = UFS.filter((u) => u.regiao === r.id).map((u) => u.uf);
    const votos = {};
    let validos = 0, total = 0, apuradas = 0;
    for (const uf of ufs) {
      const s = secoesDe(uf, estados, ab);
      total += s.total;
      apuradas += s.apuradas;
      const e = estados[uf];
      if (!e) continue;
      validos += e.votos.validos;
      if (camara) for (const p of e.partidos) votos[p.sigla] = (votos[p.sigla] || 0) + p.votos;
      else for (const c of e.candidatos) votos[c.partido] = (votos[c.partido] || 0) + c.votos;
    }
    return {
      id: r.id,
      nome: r.nome,
      ufs,
      secoes: { total, apuradas, pct: pct(apuradas, total) },
      validos,
      // Cada região mostra os seus 3 partidos mais votados (são muitos partidos nas disputas estaduais).
      segmentos: segmentos(Object.keys(votos).sort((a, b) => votos[b] - votos[a]), votos, validos, cores, rotulos, 3),
    };
  });

  // A abrangência "br" do acompanhamento estadual inclui o exterior, que não vota para cargos estaduais.
  let secoes = { total: 0, apuradas: 0, pct: 0 };
  let eleitorado = { total: 0, comparecimento: 0, abstencao: 0 };
  for (const uf of UF_LIST) {
    const s = secoesDe(uf, estados, ab);
    secoes.total += s.total;
    secoes.apuradas += s.apuradas;
    const el = estados[uf]?.eleitorado || ab?.ufs?.[uf]?.eleitorado;
    eleitorado.total += el?.total || 0;
    eleitorado.comparecimento += el?.comparecimento || 0;
    eleitorado.abstencao += el?.abstencao || 0;
  }
  secoes.pct = pct(secoes.apuradas, secoes.total);
  eleitorado.pctAbstencao = pct(eleitorado.abstencao, eleitorado.abstencao + eleitorado.comparecimento);
  eleitorado.pctComparecimento = pct(eleitorado.comparecimento, eleitorado.abstencao + eleitorado.comparecimento);

  return {
    status: status(secoes, final),
    atualizadoEm: geradoEm || null,
    nacional: {
      secoes,
      eleitorado,
      votos: {
        total: totalNac,
        validos: validosNac,
        pctValidos: pct(validosNac, totalNac),
        brancos: brancosNac,
        pctBrancos: pct(brancosNac, totalNac),
        nulos: nulosNac,
        pctNulos: pct(nulosNac, totalNac),
      },
      candidatos: [],
      ufs: ufsNac,
      totalCandidatos: candidatosNac,
      vagas: vagasNac,
      partidos: partidosBR,
      maisVotados: camara ? maisVotados : undefined,
    },
    estados: est,
    regioes,
    cores,
    bancadas,
  };
}

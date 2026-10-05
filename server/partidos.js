// Desempenho de cada partido em todos os cargos: votos e percentual no país, por estado,
// cadeiras projetadas (deputados) e os candidatos do partido. Monta tudo de uma vez a partir
// dos mesmos arquivos do painel e reaproveita o resultado enquanto os dados não mudam.
import { UFS, CARGOS } from '../public/js/ufs.js';
import { corPartido } from '../public/js/colors.js';

const UF_LIST = UFS.map((u) => u.uf);
const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);
const CARGOS_ESTADUAIS = ['governador', 'senado', 'camara', 'assembleia'];

const candidatoResumo = (c, uf, pos, extra = {}) => ({
  n: c.n,
  nome: c.nome,
  uf,
  votos: c.votos,
  pct: c.pct,
  pos,
  eleito: c.eleito,
  situacao: c.situacao,
  garantido: c.garantido || null,
  foto: c.foto,
  ...extra,
});

// dados: { presidente: { nacional, estados }, governador: { estados }, ... } (saída de carregarCargo)
export function montarPartidos(dados) {
  const P = {};
  const partido = (sigla, nome, n) => {
    if (!P[sigla]) {
      P[sigla] = {
        sigla,
        nome: nome || sigla,
        n: n || null,
        cor: corPartido(sigla),
        federacao: null,
        presidente: null,
        governador: { votos: 0, candidatos: [] },
        senado: { votos: 0, candidatos: [] },
        camara: { votos: 0, cadeiras: 0, top: [] },
        assembleia: { votos: 0, cadeiras: 0, top: [] },
        estados: {},
      };
    }
    if (nome && P[sigla].nome === sigla) P[sigla].nome = nome;
    if (n && !P[sigla].n) P[sigla].n = n;
    return P[sigla];
  };
  const doEstado = (p, uf) => (p.estados[uf] ||= {});

  // ---------------------------------------------------------------- presidente
  const pres = dados.presidente;
  const totais = { presidente: pres?.nacional?.votos?.validos || 0 };
  (pres?.nacional?.candidatos || []).forEach((c, i) => {
    const p = partido(c.partido);
    p.presidente = { ...candidatoResumo(c, 'br', i + 1), vice: c.vice };
  });
  for (const [uf, e] of Object.entries(pres?.estados || {})) {
    e.candidatos.forEach((c, i) => {
      const p = P[c.partido];
      if (p?.presidente) doEstado(p, uf).presidente = [c.pct, i + 1];
    });
  }

  // ---------------------------------------------------------------- cargos estaduais
  const vagas = { governador: 0, senado: 0, camara: 0, assembleia: 0 };
  for (const key of CARGOS_ESTADUAIS) {
    const estados = dados[key]?.estados || {};
    const prop = CARGOS[key].proporcional;
    totais[key] = 0;
    for (const uf of UF_LIST) {
      const e = estados[uf];
      if (!e) continue;
      totais[key] += e.votos.validos;
      vagas[key] += e.cargo.vagas;
      const apurou = e.secoes.apuradas > 0;
      for (const pa of e.partidos) {
        const p = partido(pa.sigla, pa.nome, pa.n);
        if (pa.federacao && !p.federacao) p.federacao = pa.agremiacao;
        if (prop) {
          p[key].votos += pa.votos;
          p[key].cadeiras += pa.cadeiras || 0;
          doEstado(p, uf)[key] = [pct(pa.votos, e.votos.validos), pa.cadeiras || 0];
        }
      }
      if (prop) {
        // Os mais votados de cada partido no estado (o recorte nacional é feito depois).
        const vistos = {};
        e.candidatos.forEach((c, i) => {
          vistos[c.partido] = (vistos[c.partido] || 0) + 1;
          if (vistos[c.partido] > 10 || !c.votos) return;
          P[c.partido]?.[key].top.push(candidatoResumo(c, uf, i + 1, { dentro: !!(c.eleito || c.projetado) }));
        });
      } else {
        const vagasUF = e.cargo.vagas || 1;
        e.candidatos.forEach((c, i) => {
          const p = partido(c.partido);
          p[key].votos += c.votos;
          const dentro = apurou && c.votos > 0 && i < vagasUF;
          p[key].candidatos.push(candidatoResumo(c, uf, i + 1, { dentro, vagas: vagasUF }));
          const atual = doEstado(p, uf)[key];
          if (!atual || i + 1 < atual[1]) doEstado(p, uf)[key] = [c.pct, i + 1, vagasUF];
        });
      }
    }
  }

  // ---------------------------------------------------------------- consolidação
  const lista = Object.values(P).map((p) => {
    for (const key of ['governador', 'senado']) {
      p[key].pct = pct(p[key].votos, totais[key]);
      p[key].candidatos.sort((a, b) => a.pos - b.pos || b.pct - a.pct);
      p[key].dentro = p[key].candidatos.filter((c) => c.dentro).length;
    }
    for (const key of ['camara', 'assembleia']) {
      p[key].pct = pct(p[key].votos, totais[key]);
      p[key].top = p[key].top.sort((a, b) => b.votos - a.votos).slice(0, 12);
    }
    if (p.presidente) p.presidente.pct = pct(p.presidente.votos, totais.presidente);
    return p;
  });
  lista.sort((a, b) => b.camara.votos - a.camara.votos || b.governador.votos - a.governador.votos);
  return { totais, vagas, partidos: lista };
}

// Resumo leve de todos os partidos (para a lista de seleção e a busca).
export const resumoPartidos = ({ totais, vagas, partidos }) => ({
  totais,
  vagas,
  partidos: partidos.map((p) => ({
    sigla: p.sigla,
    nome: p.nome,
    n: p.n,
    cor: p.cor,
    federacao: p.federacao,
    presidente: p.presidente ? { nome: p.presidente.nome, pct: p.presidente.pct, pos: p.presidente.pos } : null,
    governador: { pct: p.governador.pct, candidatos: p.governador.candidatos.length, dentro: p.governador.dentro },
    senado: { pct: p.senado.pct, candidatos: p.senado.candidatos.length, dentro: p.senado.dentro },
    camara: { pct: p.camara.pct, cadeiras: p.camara.cadeiras },
    assembleia: { pct: p.assembleia.pct, cadeiras: p.assembleia.cadeiras },
  })),
});

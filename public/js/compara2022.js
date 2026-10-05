// Resultado de Presidente em 2022 (TSE), para comparar com 2026. A comparação é por partido, porque o
// candidato do PL mudou: PT = Lula nos dois anos; PL = Jair Bolsonaro em 2022 e Flávio Bolsonaro em 2026.
// Os arquivos são estáticos (gerados por tools/build-historico-2022.mjs) e baixados uma vez, só quando
// usados: os totais por UF (~2 KB) com o cargo Presidente; os municípios (~90 KB comprimidos) no mapa
// por cidade e no resultado de uma cidade. Nada disso consulta o TSE.

const PASTA = 'data/historico';
const arquivos = {}; // nome -> { dados, promessa, falhouEm }
const ouvintes = new Set();

function arquivo(nome) {
  const a = (arquivos[nome] ||= {});
  if (a.dados) return Promise.resolve(a.dados);
  if (a.promessa) return a.promessa;
  // Falhou há pouco (rede): não insiste a cada atualização do painel.
  if (a.falhouEm && Date.now() - a.falhouEm < 60e3) return Promise.reject(new Error('Dados de 2022 indisponíveis.'));
  a.promessa = fetch(`${PASTA}/${nome}.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((j) => {
      a.dados = j;
      for (const fn of ouvintes) fn();
      return j;
    })
    .catch((err) => {
      a.falhouEm = Date.now();
      throw err;
    })
    .finally(() => (a.promessa = null));
  return a.promessa;
}

// Dados já baixados; se ainda não, começa a baixar (uma vez) e devolve null.
function jaBaixado(nome) {
  const a = arquivos[nome];
  if (a?.dados) return a.dados;
  arquivo(nome).catch(() => {});
  return null;
}

// 1º turno de 2026 compara com o 1º de 2022; 2º com 2º.
export const turno2022 = (t) => (Number(t) === 2 ? 2 : 1);
// Turno do painel em exibição (o mapa avisa a cada atualização), para quem não recebe o payload,
// como o modal de partidos.
let turnoPainel = 1;
export const definirTurno2026 = (t) => (turnoPainel = turno2022(t));
export const turnoAtual2026 = () => turnoPainel;
const nomeMun = (t) => `presidente-2022-${turno2022(t)}t`;

export const carregarUFs2022 = () => arquivo('presidente-2022-uf');
export const carregarMunicipios2022 = (turno) => arquivo(nomeMun(turno));
// Chamado sempre que um arquivo chega (para redesenhar o que estava esperando por ele).
export const aoCarregar2022 = (fn) => ouvintes.add(fn);

// Registro [eleitorado, válidos, Lula, Bolsonaro] -> percentuais dos válidos de PT e PL.
function percentuais(r) {
  if (!r || !(r[1] > 0)) return null;
  return { pt: (r[2] / r[1]) * 100, pl: (r[3] / r[1]) * 100, validos: r[1] };
}

// Estado (ou "zz", exterior; ou "br", Brasil com exterior). undefined = ainda carregando; null = sem dado.
export function estado2022(turno, uf) {
  const d = jaBaixado('presidente-2022-uf')?.[turno2022(turno)];
  if (!d) return undefined;
  return percentuais(uf === 'br' ? d.br : d.uf[uf]);
}

// Brasil sem o exterior (checkbox "Incluir exterior" desmarcado).
export function brasilSemExterior2022(turno) {
  const d = jaBaixado('presidente-2022-uf')?.[turno2022(turno)];
  if (!d) return undefined;
  const z = d.uf.zz || [0, 0, 0, 0];
  return percentuais(d.br.map((v, i) => v - z[i]));
}

// Município pelo código IBGE (mapa) ou pelo código do TSE (resultado da cidade, busca).
// No exterior ("zz") só existe o código do TSE. undefined = ainda carregando; null = sem dado.
const indicesTSE = new WeakMap();
export function municipio2022(turno, { uf, cdi, cd }) {
  const d = jaBaixado(nomeMun(turno));
  if (!d) return undefined;
  if (uf === 'zz') return percentuais(d.ex?.[Number(cd)]);
  let r = cdi ? d.m[cdi] : null;
  if (!r && cd) {
    let idx = indicesTSE.get(d);
    if (!idx) indicesTSE.set(d, (idx = new Map(Object.values(d.m).map((x) => [x[0], x]))));
    r = idx.get(Number(cd));
  }
  return percentuais(r?.slice(1));
}

// Candidatos do PT e do PL em 2026, a partir da lista nacional do painel.
export function candidatosPorPartido(candidatos = []) {
  return { pt: candidatos.find((c) => c.partido === 'PT') || null, pl: candidatos.find((c) => c.partido === 'PL') || null };
}

// Comparação de um lugar: a22 = percentuais de 2022; a26 = { pt, pl } de 2026 (null se ainda sem votos).
// Variações em pontos percentuais dos votos válidos; dVantagem > 0 = vantagem do PL sobre o PT cresceu.
// As contas usam os percentuais já arredondados a uma casa, como aparecem na tela (47,5% → 46,6% dá
// −0,9, e não −1,0 por causa das casas escondidas).
const r1 = (x) => Math.round(x * 10) / 10;
export function comparar(a22, a26) {
  if (!a22) return null;
  const pt22 = r1(a22.pt), pl22 = r1(a22.pl);
  const c = { pt22, pl22, vantagem22: r1(pl22 - pt22) };
  if (a26) {
    const pt26 = r1(a26.pt), pl26 = r1(a26.pl);
    Object.assign(c, { pt26, pl26, dPT: r1(pt26 - pt22), dPL: r1(pl26 - pl22), dVantagem: r1(pl26 - pt26 - c.vantagem22) });
  }
  return c;
}

// +1,2 p.p. / −0,8 p.p. (variações abaixo de 0,05 aparecem como 0,0)
export function pp(n, sufixo = ' p.p.') {
  const v = Math.round(Math.abs(n) * 10) / 10;
  const txt = v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return (v === 0 ? '' : n > 0 ? '+' : '−') + txt + sufixo;
}

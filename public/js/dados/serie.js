// Utilidades de séries temporais: períodos, formatação e estatísticas por mandato.
// O eixo do tempo usa "meses desde o ano 0" (ano * 12 + mês - 1), com fração para dias.

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// "2016-05-12" -> 24196.35 (início do dia dentro do mês)
export function dataParaT(s) {
  const [a, m, d = 1] = s.split('-').map(Number);
  const dias = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return a * 12 + (m - 1) + (d - 1) / dias;
}

// Fim do dia (para o "fim" inclusivo dos mandatos).
export const dataFimParaT = (s) => {
  const [a, m] = s.split('-').map(Number);
  return dataParaT(s) + 1 / new Date(Date.UTC(a, m, 0)).getUTCDate();
};

// Intervalo [ini, fim) de tempo coberto por um ponto da série.
// Mensal: o mês inteiro. Trimestral: os 3 meses do trimestre (aceita o período marcado pelo
// último mês — mar/jun/set/dez — ou pelo primeiro — jan/abr/jul/out).
export function intervaloPonto(periodo, periodicidade) {
  const [a, m] = periodo.split('-').map(Number);
  const t = a * 12 + (m - 1);
  if (periodicidade === 'trimestral') {
    const ini = m % 3 === 0 ? t - 2 : t - ((m - 1) % 3);
    return [ini, ini + 3];
  }
  return [t, t + 1];
}

// Rótulo curto do período: "ago/2026" ou "2º tri 2026".
export function rotuloPeriodo(periodo, periodicidade) {
  const [a, m] = periodo.split('-').map(Number);
  if (periodicidade === 'trimestral') {
    const [ini] = intervaloPonto(periodo, periodicidade);
    const tri = Math.floor((ini - a * 12) / 3) + 1;
    return `${tri}º tri ${a}`;
  }
  return `${MESES[m - 1]}/${a}`;
}

// Data "2026-10-09" -> "09/10/2026"; mês "2026-10" -> "out/2026".
export function dataBR(s) {
  if (!s) return '';
  if (/^\d{4}-\d{2}$/.test(s)) return rotuloPeriodo(s, 'mensal');
  return s.split('-').reverse().join('/');
}

const num = (v, casas) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });

// Valor com unidade: "4,58%", "82,9% do PIB", "R$ 3.660", "R$ 5,14".
export function fmtValor(v, ind, casas = ind.casas ?? 1) {
  if (v == null || !Number.isFinite(v)) return '—';
  const neg = v < 0 ? '−' : '';
  const a = Math.abs(v);
  switch (ind.unidade) {
    case 'R$':
    case 'R$/US$':
      return `${neg}R$ ${num(a, casas)}`;
    case '% do PIB':
      return `${neg}${num(a, casas)}% do PIB`;
    case '%':
      return `${neg}${num(a, casas)}%`;
    default:
      return `${neg}${num(a, casas)}${ind.unidade ? ' ' + ind.unidade : ''}`;
  }
}

// Partes do valor para o número grande dos cartões (número e unidade separados).
export function partesValor(v, ind) {
  if (v == null || !Number.isFinite(v)) return { pre: '', num: '—', suf: '' };
  const n = (v < 0 ? '−' : '') + num(Math.abs(v), ind.casas ?? 1);
  if (ind.unidade === 'R$' || ind.unidade === 'R$/US$') return { pre: 'R$', num: n, suf: ind.unidade === 'R$/US$' ? 'por US$' : '' };
  if (ind.unidade === '% do PIB') return { pre: '', num: n, suf: '% do PIB' };
  if (ind.unidade === '%') return { pre: '', num: n, suf: '%' };
  return { pre: '', num: n, suf: ind.unidade || '' };
}

// Indicadores em % mostram a variação em pontos percentuais; os em R$, em % de mudança.
export const variacaoEmPP = (ind) => ind.unidade === '%' || ind.unidade === '% do PIB';

export function fmtVariacao(ini, fim, ind) {
  if (ini == null || fim == null) return '—';
  if (variacaoEmPP(ind)) {
    const d = fim - ini;
    const c = Math.max(1, Math.min(2, ind.casas ?? 1));
    const s = Math.abs(d) < 0.5 * 10 ** -c ? '' : d > 0 ? '+' : '−';
    return `${s}${num(Math.abs(d), c)} p.p.`;
  }
  if (ini === 0) return '—';
  const p = ((fim - ini) / Math.abs(ini)) * 100;
  const s = Math.abs(p) < 0.05 ? '' : p > 0 ? '+' : '−';
  return `${s}${num(Math.abs(p), 1)}%`;
}

// Prepara a série: pontos com tempo central e intervalo, ordenados, sem valores inválidos.
export function prepararSerie(serie, periodicidade) {
  return (serie || [])
    .filter((p) => Array.isArray(p) && typeof p[0] === 'string' && Number.isFinite(p[1]))
    .map(([periodo, v]) => {
      const [ini, fim] = intervaloPonto(periodo, periodicidade);
      return { periodo, v, ini, fim, t: (ini + fim) / 2 };
    })
    .sort((a, b) => a.t - b.t);
}

// Mandatos com tempo numérico. "fim" nulo = em curso (vai até o último dado).
export function prepararMandatos(mandatos) {
  return (mandatos || []).map((m) => ({
    ...m,
    t0: dataParaT(m.inicio),
    t1: m.fim ? dataFimParaT(m.fim) : Infinity,
    emCurso: !m.fim,
  }));
}

// Mandato a que pertence um ponto: o que contém o centro do período do ponto
// (ex.: mai/2016 conta para Temer, que governou a maior parte do mês).
export const mandatoDoPonto = (p, mandatos) => mandatos.find((m) => p.t >= m.t0 && p.t < m.t1) || null;

// Estatísticas de cada mandato que tem ao menos um ponto.
export function estatisticasPorMandato(pts, mandatos, ind, periodicidade) {
  const out = [];
  if (!pts.length) return out;
  const primeiro = pts[0], ultimo = pts[pts.length - 1];
  for (const m of mandatos) {
    const dentro = pts.filter((p) => p.t >= m.t0 && p.t < m.t1);
    if (!dentro.length) continue;
    const a = dentro[0], b = dentro[dentro.length - 1];
    const media = dentro.reduce((s, p) => s + p.v, 0) / dentro.length;
    const notas = [];
    // A série começa depois do início do mandato (folga de um período).
    if (a === primeiro && primeiro.ini > m.t0 + (periodicidade === 'trimestral' ? 3 : 1)) {
      notas.push(`dados a partir de ${rotuloPeriodo(a.periodo, periodicidade)}`);
    }
    if (m.emCurso) notas.push(`dados até ${rotuloPeriodo(b.periodo, periodicidade)}`);
    else if (b === ultimo && ultimo.fim < m.t1 - (periodicidade === 'trimestral' ? 3 : 1)) {
      notas.push(`dados até ${rotuloPeriodo(b.periodo, periodicidade)}`);
    }
    out.push({
      mandato: m,
      ini: a,
      fim: b,
      media,
      n: dentro.length,
      variacao: fmtVariacao(a.v, b.v, ind),
      cobertura: notas.join(' · '),
    });
  }
  return out;
}

// Ticks "bonitos" para o eixo Y.
export function ticksY(min, max, alvo = 5) {
  if (min === max) {
    const d = Math.abs(min) * 0.1 || 1;
    min -= d;
    max += d;
  }
  const bruto = (max - min) / alvo;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((p) => p >= bruto) || 10 * mag;
  const ini = Math.floor(min / passo) * passo;
  const fim = Math.ceil(max / passo) * passo;
  const ticks = [];
  for (let v = ini; v <= fim + passo / 2; v += passo) ticks.push(Math.round(v / passo) * passo);
  const casas = Math.max(0, -Math.floor(Math.log10(passo) + 1e-9) + (passo / mag === 2.5 ? 1 : 0));
  return { ticks, lo: ini, hi: fim, casas };
}

// Periodicidade observada na série (as séries por UF podem ser trimestrais mesmo quando a
// nacional é mensal): mediana do intervalo entre pontos consecutivos.
export function detectarPeriodicidade(serie, padrao = 'mensal') {
  const ts = (serie || []).slice(-13).map(([p]) => {
    const [a, m] = p.split('-').map(Number);
    return a * 12 + m;
  });
  if (ts.length < 3) return padrao;
  const difs = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b);
  return difs[difs.length >> 1] >= 3 ? 'trimestral' : 'mensal';
}

// Valor compacto para eixos: "3,5 mil" etc.
export function fmtEixo(v, ind, casas) {
  const neg = v < 0 ? '−' : '';
  const a = Math.abs(v);
  const n = a >= 10000 ? `${num(a / 1000, a % 1000 ? 1 : 0)} mil` : num(a, casas);
  if (ind.unidade === 'R$' || ind.unidade === 'R$/US$') return `${neg}${n}`;
  if (ind.unidade === '%' || ind.unidade === '% do PIB') return `${neg}${n}%`;
  return `${neg}${n}`;
}

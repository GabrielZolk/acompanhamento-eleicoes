// Ritmo recente de totalização -> horário estimado de conclusão (compartilhado servidor/navegador).
export function calcularPrevisao(historico) {
  const pts = historico.filter((p) => p.pct > 0);
  const last = pts.at(-1);
  if (!last) return { status: 'aguardando', barras: [] };
  const barras = barrasRitmo(historico, last.t);
  if (last.pct >= 99.995) return { status: 'concluida', eta: last.t, barras };
  const JANELA = 30 * 60e3;
  let base = pts.find((p) => p.t >= last.t - JANELA) || pts[0];
  if (last.t - base.t < 5 * 60e3) base = pts[0];
  if (base === last || last.t - base.t < 60e3) return { status: 'calculando', barras };
  const ritmo = (last.pct - base.pct) / (last.t - base.t); // pp por ms
  if (ritmo <= 0) return { status: 'calculando', barras };
  return {
    status: 'estimada',
    eta: Math.round(last.t + (100 - last.pct) / ritmo),
    ritmoPorHora: ritmo * 3600e3,
    barras,
  };
}

// 10 colunas de 6 minutos: pontos percentuais apurados em cada intervalo.
function barrasRitmo(historico, fim) {
  const N = 10, PASSO = 6 * 60e3;
  const pctEm = (t) => {
    let v = 0;
    for (const p of historico) {
      if (p.t > t) break;
      v = p.pct;
    }
    return v;
  };
  const out = [];
  for (let i = N; i > 0; i--) {
    const a = fim - i * PASSO, b = a + PASSO;
    out.push(Math.max(0, pctEm(b) - pctEm(a)));
  }
  return out;
}

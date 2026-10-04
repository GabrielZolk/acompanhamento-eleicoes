// Guarda no navegador a evolução e as atualizações já vistas e mescla com o que o servidor
// devolve. Assim a curva continua completa mesmo se a instância serverless reiniciar.
import { calcularPrevisao } from './previsao.js';

const MAX_PONTOS = 2000;
const MAX_ATUALIZACOES = 200;

export function mesclarHistorico(d) {
  const chave = `apuracao2026:${d.cargo.federal ? 'federal' : 'estadual'}:${d.inicio}`;
  let salvo = null;
  try {
    salvo = JSON.parse(localStorage.getItem(chave));
  } catch {
    /* sem histórico local */
  }
  const pontos = new Map((salvo?.historico || []).map((p) => [p.t, p]));
  for (const p of d.historico) pontos.set(p.t, p);
  const historico = [...pontos.values()].sort((a, b) => a.t - b.t).slice(-MAX_PONTOS);

  const upd = new Map((salvo?.atualizacoes || []).map((u) => [`${u.t}-${u.uf}`, u]));
  for (const u of d.atualizacoes) upd.set(`${u.t}-${u.uf}`, u);
  const atualizacoes = [...upd.values()].sort((a, b) => b.t - a.t).slice(0, MAX_ATUALIZACOES);

  try {
    localStorage.setItem(chave, JSON.stringify({ historico, atualizacoes }));
  } catch {
    /* armazenamento cheio ou bloqueado */
  }
  return { ...d, historico, atualizacoes, previsao: calcularPrevisao(historico) };
}

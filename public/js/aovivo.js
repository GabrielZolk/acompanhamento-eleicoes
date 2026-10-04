// Contador "ao vivo" (estimativa). Entre duas divulgações do TSE, avança seções e votos válidos
// no ritmo medido da apuração (últimos ~30 min). Não substitui os números oficiais: é exibido à
// parte, marcado como estimativa, se acerta a cada divulgação e para se o TSE demorar a publicar.
const LIMITE_MS = 180e3; // sem divulgação nova há mais que isso: para de estimar
const SEGURA_MS = 20e3; // se a estimativa passou do oficial novo, segura o valor por até 20 s

let ultimo = { chave: null, base: 0, secoes: 0, votos: 0, desde: 0 };

export function estimarAgora(d) {
  if (!d || d.status !== 'apurando') return null;
  const n = d.nacional || {};
  const total = n.secoes?.total || 0;
  const apuradas = n.secoes?.apuradas || 0;
  const validos = n.votos?.validos || 0;
  const p = d.previsao || {};
  const idade = Date.now() - (d.atualizadoEm || Date.now());
  if (!total || !apuradas || p.status !== 'estimada' || !(p.ritmoPorHora > 0) || idade > LIMITE_MS) {
    return { secoes: apuradas, votos: validos, oficial: apuradas, estimando: false };
  }
  const porMs = ((p.ritmoPorHora / 100) * total) / 3600e3;
  let secoes = Math.min(total, apuradas + porMs * Math.max(0, idade));
  let votos = validos + (secoes - apuradas) * (validos / apuradas);

  // Nunca anda para trás: se uma divulgação nova veio abaixo do que já estava na tela,
  // segura o valor até a estimativa alcançá-lo (no máximo 20 s).
  const chave = `${d.cargo.key}:${d.semExterior ? 1 : 0}`;
  const agora = Date.now();
  if (ultimo.chave === chave && ultimo.secoes > secoes) {
    if (ultimo.base !== d.atualizadoEm) ultimo.desde = ultimo.desde || agora;
    if (agora - (ultimo.desde || agora) < SEGURA_MS) {
      secoes = ultimo.secoes;
      votos = Math.max(votos, ultimo.votos);
    }
  } else {
    ultimo.desde = 0;
  }
  ultimo = { chave, base: d.atualizadoEm, secoes, votos, desde: ultimo.desde };
  return { secoes, votos, oficial: apuradas, estimando: true };
}

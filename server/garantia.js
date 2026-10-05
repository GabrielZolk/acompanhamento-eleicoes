// Vitória matematicamente garantida nas disputas majoritárias (Presidente, Governador e Senado).
// O TSE só marca eleitos e 2º turno quando fecha a totalização do lugar; até lá, com quase tudo
// apurado, a conta abaixo já mostra quem não pode mais ser alcançado.
//
// Pior caso: todo o eleitorado das seções ainda não apuradas vota, e vota validamente. Cada eleitor
// dá no máximo um voto a cada candidato (no Senado com 2 vagas ele vota em dois, mas não duas vezes
// no mesmo), então nenhum candidato ganha mais que "restantes" votos. Votos de candidato sub judice
// (anulados hoje, podem passar a valer) contam contra quem está na frente.

const MAJORITARIOS = new Set([1, 3, 5]); // Presidente, Governador, Senador
const MAIORIA_ABSOLUTA = new Set([1, 3]); // Presidente e Governador: mais da metade dos válidos

// cands: [{ votos, valido }] (valido === false: voto anulado sub judice), em qualquer ordem.
// validos: votos válidos apurados. restantes: eleitores que ainda podem votar.
// Devolve { marcas, segundoTurno }: marcas[i] = 'eleito' | 'segundoTurno' | null, na ordem de cands;
// segundoTurno = true quando ninguém mais consegue maioria absoluta (o 2º turno é certo).
export function calcularGarantia({ cands, validos, restantes, vagas = 1, absoluta = false, turno = 1 }) {
  const marcas = cands.map(() => null);
  const nada = { marcas, segundoTurno: false };
  const R = Math.max(0, restantes || 0);
  if (!(validos > 0) || !cands.length) return nada;

  // Quantos outros candidatos ainda podem alcançar X. O empate também conta: o desempate é pela idade.
  const ameacas = (i) => cands.reduce((n, y, j) => n + (j !== i && y.votos + R >= cands[i].votos ? 1 : 0), 0);
  const marcavel = (c) => c.valido !== false && c.votos > 0;

  if (!absoluta) {
    // Maioria simples (Senado): eleito se menos candidatos que o número de vagas ainda podem alcançá-lo.
    cands.forEach((c, i) => {
      if (marcavel(c) && ameacas(i) < Math.max(1, vagas)) marcas[i] = 'eleito';
    });
    return { marcas, segundoTurno: false };
  }

  // Maioria absoluta: o líder está eleito se tem mais da metade dos válidos mesmo que todos os
  // restantes votem nos outros e os votos sub judice passem a valer.
  const incertos = cands.reduce((s, c) => s + (c.valido === false ? c.votos : 0), 0);
  let lider = -1;
  cands.forEach((c, i) => {
    if (marcavel(c) && (lider < 0 || c.votos > cands[lider].votos)) lider = i;
  });
  if (lider >= 0 && 2 * cands[lider].votos > validos + incertos + R) {
    marcas[lider] = 'eleito';
    return { marcas, segundoTurno: false };
  }
  if (turno !== 1) return nada;

  // 2º turno certo: ninguém passa de 50% nem recebendo todos os restantes (aqui o pior caso é o
  // sub judice continuar anulado; se ele passar a valer, os próprios votos dele entram na base).
  const alcancaMaioria = (c) => 2 * (c.votos + R) > validos + R + (c.valido === false ? c.votos : 0);
  if (cands.some(alcancaMaioria)) return nada;
  // Garantido no 2º turno: no máximo um outro candidato ainda pode alcançá-lo.
  cands.forEach((c, i) => {
    if (marcavel(c) && ameacas(i) <= 1) marcas[i] = 'segundoTurno';
  });
  return { marcas, segundoTurno: true };
}

// Marca cada candidato do lugar (país ou UF) com garantido = 'eleito' | 'segundoTurno' | null e o
// lugar com haveraSegundoTurno. A marcação oficial do TSE, quando existe, prevalece: aí nada é calculado.
export function marcarGarantidos(lugar) {
  if (!lugar?.candidatos) return lugar;
  for (const c of lugar.candidatos) c.garantido = null;
  lugar.haveraSegundoTurno = false;
  const cd = lugar.cargo?.cd;
  if (!MAJORITARIOS.has(cd) || lugar.quociente) return lugar;
  const oficial = lugar.final || lugar.candidatos.some((c) => c.eleito || /2º turno/i.test(c.situacao || ''));
  const { total, apurado } = lugar.eleitorado || {};
  if (oficial || !(total > 0) || apurado > total || !(lugar.secoes?.apuradas > 0)) return lugar;

  const { marcas, segundoTurno } = calcularGarantia({
    cands: lugar.candidatos.map((c) => ({ votos: c.votos, valido: votoValido(c) })),
    validos: lugar.votos?.validos || 0,
    restantes: total - (apurado || 0),
    vagas: lugar.cargo.vagas || 1,
    absoluta: MAIORIA_ABSOLUTA.has(cd),
    turno: lugar.turno || 1,
  });
  lugar.candidatos.forEach((c, i) => (c.garantido = marcas[i]));
  lugar.haveraSegundoTurno = segundoTurno;
  return lugar;
}

// "Válido" na destinação do voto do TSE; "Anulado sub judice" (e afins) não conta nos válidos.
const votoValido = (c) => !c.destino || /^v[áa]lido/i.test(c.destino);

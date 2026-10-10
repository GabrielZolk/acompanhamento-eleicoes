// Datas da eleição e contagem regressiva, sem dependências: usadas pelo painel e pela página inicial.
// O 2º turno é no último domingo de outubro (Constituição, art. 77).
export const PRIMEIRO_TURNO = '2026-10-04';
export const SEGUNDO_TURNO = '2026-10-25';

// A contagem é em dias de calendário no fuso de Brasília: vira à meia-noite de Brasília, não à do visitante.
const diaBrasilia = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric', day: 'numeric' });
export const utc = (iso) => {
  const [a, m, d] = iso.split('-').map(Number);
  return Date.UTC(a, m - 1, d);
};
function hojeEmBrasilia(agora) {
  const p = Object.fromEntries(diaBrasilia.formatToParts(agora).map((x) => [x.type, x.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day));
}
// Dias até a data: 0 no próprio dia, negativo depois dela.
export const diasAte = (iso = SEGUNDO_TURNO, agora = Date.now()) => Math.round((utc(iso) - hojeEmBrasilia(agora)) / 864e5);

// "domingo, 25 de outubro de 2026" (a data já está em UTC: formatar em UTC não muda o dia).
const extenso = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const curto = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
export const dataSegundoTurno = (ano = true) => (ano ? extenso : curto).format(utc(SEGUNDO_TURNO));

// "faltam 21 dias" · "falta 1 dia" · "é hoje"; depois da data, nada.
export function contagem(dias = diasAte()) {
  if (dias > 1) return `faltam ${dias} dias`;
  if (dias === 1) return 'falta 1 dia';
  return dias === 0 ? 'é hoje' : '';
}

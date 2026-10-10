// Página inicial: escolha entre a apuração e o Raio-X do Brasil. O cartão da apuração mostra a
// situação do calendário (contagem para o 2º turno, "ao vivo" no dia da votação).
import { SEGUNDO_TURNO, diasAte, dataSegundoTurno, contagem } from './datas.js';

const status = document.getElementById('status-eleicao');
const dias = diasAte(SEGUNDO_TURNO);
if (dias > 0) {
  status.innerHTML = `<b>2º turno</b> · ${dataSegundoTurno(false)} · ${contagem(dias)}`;
} else if (dias === 0) {
  status.classList.add('chip--vivo');
  status.innerHTML = '<i></i><b>Hoje é dia de 2º turno</b> · apuração ao vivo a partir das 17h';
} else {
  status.innerHTML = '<b>Resultado final</b> · 1º e 2º turnos';
}

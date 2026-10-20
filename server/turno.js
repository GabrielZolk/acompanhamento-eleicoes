// Turno em curso e código de eleição do TSE de cada cargo/UF. Compartilhado por core e municipios.
import { CARGOS } from '../public/js/ufs.js';

// Turnos e códigos de eleição do TSE (comum/config/ele-c.json): 1º turno 6257 (federal) e 6259
// (estadual); 2º turno 6258 (Presidente) e 6260 (Governador, só nos estados com 2º turno). A troca é
// automática à 0h de Brasília do dia do 2º turno; TURNO=1|2 força um turno e TSE_ELE_FEDERAL /
// TSE_ELE_ESTADUAL forçam um código. Senado e deputados não têm 2º turno: ficam no resultado do 1º.
const PRIMEIRO_TURNO = process.env.ELEICAO_DATA || '2026-10-04';
const SEGUNDO_TURNO = process.env.SEGUNDO_TURNO_DATA || '2026-10-25';
const UFS_GOVERNADOR_2T = new Set(['ac', 'am', 'df', 'es', 'rn', 'to']);
export const emSegundoTurno = () => process.env.TURNO === '2' || (process.env.TURNO !== '1' && Date.now() >= Date.parse(`${SEGUNDO_TURNO}T00:00:00-03:00`));
Object.defineProperty(CARGOS.presidente, 'ele', { configurable: true, enumerable: true, get: () => process.env.TSE_ELE_FEDERAL || (emSegundoTurno() ? '6258' : '6257') });
Object.defineProperty(CARGOS.governador, 'ele', { configurable: true, enumerable: true, get: () => process.env.TSE_ELE_ESTADUAL || (emSegundoTurno() ? '6260' : '6259') });
// Código da eleição de um cargo numa UF: no 2º turno, Governador sem disputa fica no 1º turno.
export const eleDo = (cargo, uf) => (cargo.key === 'governador' && cargo.ele === '6260' && !UFS_GOVERNADOR_2T.has(uf) ? '6259' : cargo.ele);

// Início da totalização: 17h de Brasília no dia da votação do turno em curso.
export const inicioTotalizacao = () => Date.parse(`${emSegundoTurno() ? SEGUNDO_TURNO : PRIMEIRO_TURNO}T17:00:00-03:00`);

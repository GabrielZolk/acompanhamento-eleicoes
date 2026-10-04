import { obterPartidos, obterPartido } from '../server/core.js';
import { json, query } from './_util.js';

// /api/partidos: resumo de todos; /api/partidos?sigla=MISSÃO: detalhes de um partido.
export default async function handler(req, res) {
  const sigla = query(req).get('sigla');
  try {
    const r = sigla ? await obterPartido(sigla) : await obterPartidos();
    return json(res, r.status, r.body, r.status === 200 ? 'public, max-age=0, s-maxage=20, stale-while-revalidate=40' : 'no-store');
  } catch (err) {
    console.error(err);
    return json(res, 502, { erro: 'Falha ao consultar o TSE.', detalhe: err.message });
  }
}

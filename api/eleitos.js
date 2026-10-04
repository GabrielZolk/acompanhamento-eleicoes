import { obterEleitos } from '../server/core.js';
import { json } from './_util.js';

export default async function handler(req, res) {
  try {
    const r = await obterEleitos();
    return json(res, r.status, r.body, 'public, max-age=0, s-maxage=20, stale-while-revalidate=40');
  } catch (err) {
    console.error(err);
    return json(res, 502, { erro: 'Falha ao consultar o TSE.', detalhe: err.message });
  }
}

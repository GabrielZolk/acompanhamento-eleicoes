import { CARGOS } from '../public/js/ufs.js';
import { obterVersao } from '../server/core.js';
import { json, query } from './_util.js';

export default async function handler(req, res) {
  const q = query(req);
  const cargo = CARGOS[q.get('cargo')] ? q.get('cargo') : 'presidente';
  try {
    return json(res, 200, await obterVersao(cargo), 'public, max-age=0, s-maxage=2, stale-while-revalidate=2');
  } catch (err) {
    console.error(err);
    return json(res, 502, { erro: 'Falha ao consultar o TSE.', detalhe: err.message });
  }
}

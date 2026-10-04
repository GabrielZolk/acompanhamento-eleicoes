import { obterProjecao } from '../server/core.js';
import { json, query } from './_util.js';

export default async function handler(req, res) {
  const q = query(req);
  try {
    const r = await obterProjecao({ cargo: q.get('cargo'), uf: q.get('uf') });
    return json(res, r.status, r.body, r.status === 200 ? 'public, max-age=0, s-maxage=45, stale-while-revalidate=120' : 'no-store');
  } catch (err) {
    console.error(err);
    return json(res, 502, { erro: 'Falha ao calcular a projeção.', detalhe: err.message });
  }
}

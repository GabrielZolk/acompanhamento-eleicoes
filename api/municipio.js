import { obterMunicipio } from '../server/core.js';
import { json, query } from './_util.js';

export default async function handler(req, res) {
  const q = query(req);
  try {
    const r = await obterMunicipio({ cargo: q.get('cargo'), uf: q.get('uf'), mun: q.get('mun') });
    return json(res, r.status, r.body, r.status === 200 ? 'public, max-age=0, s-maxage=30, stale-while-revalidate=60' : 'no-store');
  } catch (err) {
    console.error(err);
    return json(res, 502, { erro: 'Falha ao consultar o TSE.', detalhe: err.message });
  }
}

import { CARGOS } from '../public/js/ufs.js';
import { obterPainel } from '../server/core.js';
import { json, query } from './_util.js';

// Cache de borda curto: o TSE atualiza seu CDN a cada ~30 s.
const CACHE = 'public, max-age=0, s-maxage=20, stale-while-revalidate=40';

export default async function handler(req, res) {
  const q = query(req);
  const cargo = CARGOS[q.get('cargo')] ? q.get('cargo') : 'presidente';
  try {
    const p = await obterPainel(cargo);
    if (!p) return json(res, 503, { erro: 'Não foi possível obter os dados do TSE agora. Tente novamente em instantes.' });
    return json(res, 200, p, CACHE);
  } catch (err) {
    console.error(err);
    return json(res, 502, { erro: 'Falha ao consultar o TSE.', detalhe: err.message });
  }
}

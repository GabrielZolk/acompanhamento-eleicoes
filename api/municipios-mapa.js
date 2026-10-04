import { obterMapaMunicipios } from '../server/municipios.js';
import { json, query } from './_util.js';

// Cache de borda maior: cada UF exige centenas de consultas ao TSE.
const CACHE = 'public, max-age=0, s-maxage=90, stale-while-revalidate=300';

export default async function handler(req, res) {
  const q = query(req);
  try {
    const r = await obterMapaMunicipios({ cargo: q.get('cargo'), uf: q.get('uf') });
    // Resultado parcial (cidades ainda sendo consultadas) fica pouco tempo em cache.
    const cache = r.status !== 200 ? 'no-store' : r.body.parcial ? 'public, max-age=0, s-maxage=8' : CACHE;
    return json(res, r.status, r.body, cache);
  } catch (err) {
    console.error(err);
    return json(res, 502, { erro: 'Falha ao consultar o TSE.', detalhe: err.message });
  }
}
